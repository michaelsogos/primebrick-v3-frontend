/**
 * SSE client utility for Primebrick frontend.
 *
 * Uses @microsoft/fetch-event-source for control over reconnection, backoff,
 * and headers (cookies via credentials: 'include'). The native EventSource
 * API does not support custom headers or credentials, so it cannot be used
 * with Primebrick's cookie-based auth.
 *
 * Two modes:
 * - `createSseConnection` — long-lived GET streams with automatic reconnection,
 *   exponential backoff, and visibility-aware behavior (e.g. service status).
 * - `createSsePostStream` — one-shot POST streams (request body → stream → close)
 *   with NO reconnection (e.g. AI chat: POST /api/v1/ai/chat streams the response).
 *
 * Features:
 * - Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (cap) [GET only]
 * - Visibility-aware: pauses when tab is hidden, resumes when visible [GET only]
 * - Cookie auth: credentials: 'include' (same as REST apiFetch)
 * - Ext-JSON parsing: uses extJsonParse for BigInt-safe deserialization
 *
 * @see @primebrick/sdk docs/user-guide/sse-standard.mdx for the full standard.
 */

import { fetchEventSource, type EventSourceMessage } from '@microsoft/fetch-event-source';
import { extJsonParse } from '$lib/api-ext';

export interface SseConnectionOptions {
  /** Full URL of the SSE endpoint (e.g. '/api/v1/system/services/events'). */
  url: string;
  /** Called for each SSE event. The `data` field is parsed via extJsonParse. */
  onMessage: (msg: EventSourceMessage) => void;
  /** Called when the connection is opened (including reconnects). */
  onOpen?: () => void;
  /** Called when the connection is closed by the server or an error occurs. */
  onError?: (err: unknown) => void;
  /** Called when the server sends a `close` event (graceful close signal). */
  onClose?: () => void;
}

/**
 * Create an SSE connection with automatic reconnection and exponential backoff.
 *
 * Returns a `close()` function that stops the connection and prevents reconnection.
 *
 * @example
 * ```ts
 * const close = createSseConnection({
 *   url: '/api/v1/system/services/events',
 *   onMessage: (msg) => {
 *     if (msg.event === 'snapshot') {
 *       const data = extJsonParse<{ services: ServiceInfo[] }>(msg.data);
 *       servicesState.services = data.services;
 *     }
 *   },
 * });
 * // Later: close();
 * ```
 */
export function createSseConnection(opts: SseConnectionOptions): () => void {
  const { url, onMessage, onOpen, onError, onClose } = opts;

  let closed = false;
  let retryMs = 1000;
  const MAX_RETRY_MS = 30_000;
  let visible = true;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const onVisibilityChange = () => {
    visible = !document.hidden;
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  function scheduleReconnect(): void {
    if (closed) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => void connect(), retryMs);
    // Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (cap)
    retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
  }

  async function connect(): Promise<void> {
    if (closed || !visible) {
      if (!visible && !closed) {
        // Will reconnect when tab becomes visible again
        return;
      }
      return;
    }

    const ctrl = new AbortController();

    try {
      await fetchEventSource(url, {
        method: 'GET',
        credentials: 'include',
        signal: ctrl.signal,

        onopen: async (res) => {
          if (res.ok) {
            // Reset backoff on successful connection
            retryMs = 1000;
            onOpen?.();
            return;
          }
          // Non-OK status — throw to trigger onerror
          throw new Error(`SSE connection failed: ${res.status}`);
        },

        onmessage(msg) {
          // Check for graceful close signal
          if (msg.event === 'close') {
            onClose?.();
            ctrl.abort();
            return;
          }
          onMessage(msg);
        },

        onclose() {
          // Server closed the connection — schedule reconnect
          if (!closed) scheduleReconnect();
        },

        onerror(err) {
          ctrl.abort();
          if (closed) throw err; // Stop retry loop if closed
          onError?.(err);
          scheduleReconnect();
          // Throw to stop the current retry loop — we handle reconnection manually
          throw err;
        },
      });
    } catch {
      // fetchEventSource throws when onerror throws — we already scheduled reconnect
      if (!closed && !reconnectTimer) {
        scheduleReconnect();
      }
    }
  }

  // Reconnect when tab becomes visible again
  const onVisChangeReconnect = () => {
    if (!closed && visible && !reconnectTimer) {
      retryMs = 1000;
      void connect();
    }
  };
  document.addEventListener('visibilitychange', onVisChangeReconnect);

  void connect();

  return () => {
    closed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    document.removeEventListener('visibilitychange', onVisibilityChange);
    document.removeEventListener('visibilitychange', onVisChangeReconnect);
  };
}

// ─── POST one-shot SSE stream ──────────────────────────────────────────────

/**
 * Options for a one-shot POST SSE stream.
 *
 * Unlike `SseConnectionOptions`, this is a single request → stream → close
 * flow with NO reconnection. Used by the AI chat endpoint
 * (POST /api/v1/ai/chat) where the request body carries the user's message
 * and the response is an SSE stream of text-delta/tool-call/finish events.
 */
export interface SsePostStreamOptions {
  /** Full URL of the SSE endpoint (e.g. '/api/v1/ai/chat'). */
  url: string;
  /** JSON body to send as the POST request body. */
  body: unknown;
  /** Called for each SSE event. The `data` field is parsed via extJsonParse. */
  onMessage: (msg: EventSourceMessage) => void;
  /** Called when the connection is opened (HTTP 200 received). */
  onOpen?: (res: Response) => void;
  /** Called when the stream ends (server closes, error, or client abort). */
  onError?: (err: unknown) => void;
  /** Called when the server sends a `close` or `finish` event (graceful end). */
  onClose?: () => void;
  /**
   * Called when the server returns a non-200 status (e.g. 429 rate limited).
   * The response body is parsed as JSON and passed to the callback.
   * If not provided, non-200 status triggers `onError` with a generic message.
   */
  onHttpError?: (status: number, body: unknown) => void;
}

/**
 * Create a one-shot POST SSE stream — sends a POST request with a JSON body
 * and streams the SSE response. No reconnection, no backoff, no visibility
 * awareness (the stream is tied to a single user action, not a long-lived
 * subscription).
 *
 * Reuses the same `@microsoft/fetch-event-source` library and `extJsonParse`
 * BigInt-safe deserialization as `createSseConnection`.
 *
 * Returns a `close()` function that aborts the stream (e.g. when the user
 * closes the chat panel or navigates away).
 *
 * @example
 * ```ts
 * const close = createSsePostStream({
 *   url: '/api/v1/ai/chat',
 *   body: { message: 'How many customers?', conversation_uuid: '...' },
 *   onMessage: (msg) => {
 *     if (msg.event === 'text-delta') {
 *       const data = parseSseData<{ text: string }>(msg.data);
 *       appendToCurrentMessage(data.text);
 *     }
 *   },
 *   onClose: () => { isStreaming = false; },
 * });
 * // User closes panel: close();
 * ```
 */
export function createSsePostStream(opts: SsePostStreamOptions): () => void {
  const { url, body, onMessage, onOpen, onError, onClose, onHttpError } = opts;

  let closed = false;
  const ctrl = new AbortController();

  void (async () => {
    try {
      await fetchEventSource(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,

        onopen: async (res) => {
          if (res.ok) {
            onOpen?.(res);
            return;
          }
          // Non-OK status — try to parse the error body as JSON
          let errorBody: unknown = null;
          try {
            errorBody = await res.json();
          } catch {
            // Body is not JSON — fall back to text
            errorBody = await res.text().catch(() => null);
          }
          if (onHttpError) {
            onHttpError(res.status, errorBody);
          } else {
            throw new Error(`SSE POST stream failed: ${res.status}`);
          }
          // After onHttpError, abort the stream — no events to read
          ctrl.abort();
        },

        onmessage(msg) {
          if (closed) return;
          // Check for graceful close / finish signals
          if (msg.event === 'close' || msg.event === 'finish') {
            onClose?.();
            ctrl.abort();
            return;
          }
          onMessage(msg);
        },

        onclose() {
          if (!closed) {
            onClose?.();
          }
        },

        onerror(err) {
          ctrl.abort();
          if (closed) throw err; // Stop retry loop if closed
          onError?.(err);
          // Throw to stop fetchEventSource's internal retry loop —
          // one-shot streams do NOT reconnect.
          throw err;
        },
      });
    } catch (err) {
      if (!closed) {
        // fetchEventSource throws when onerror throws — only forward if
        // it's not an abort from our close() function.
        if (!(err instanceof Error && err.name === 'AbortError')) {
          onError?.(err);
        }
      }
    }
  })();

  return () => {
    closed = true;
    ctrl.abort();
  };
}

/**
 * Parse SSE event data using extJsonParse (BigInt-safe).
 * Use this in onMessage handlers to deserialize the `data` field.
 */
export function parseSseData<T = unknown>(data: string): T {
  return extJsonParse<T>(data);
}
