/**
 * SSE client utility for Primebrick frontend.
 *
 * Uses @microsoft/fetch-event-source for control over reconnection, backoff,
 * and headers (cookies via credentials: 'include'). The native EventSource
 * API does not support custom headers or credentials, so it cannot be used
 * with Primebrick's cookie-based auth.
 *
 * Features:
 * - Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (cap)
 * - Visibility-aware: pauses when tab is hidden, resumes when visible
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

/**
 * Parse SSE event data using extJsonParse (BigInt-safe).
 * Use this in onMessage handlers to deserialize the `data` field.
 */
export function parseSseData<T = unknown>(data: string): T {
  return extJsonParse<T>(data);
}
