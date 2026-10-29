/**
 * usePresenceChannel — per-entity collaboration presence channel.
 *
 * Wraps `createSseConnection` on `GET /api/v1/entities/:entity/:uuid/presence/events`
 * (SSE: `snapshot` | `presence-update` | `entity-changed`) plus the REST twin
 * `POST …/presence` for client signals (READING / EDITING / LEAVE / HEARTBEAT).
 *
 * Lifecycle: call during component init — the channel connects on mount,
 * sends READING + a 20s heartbeat, and sends LEAVE on destroy / `sendBeacon`
 * on page unload. Reconnection + backoff are owned by `createSseConnection`;
 * on every (re)open the channel re-sends READING and relies on the server
 * snapshot to realign.
 *
 * Render decisions (ordering, caps, rings) live in the component — this
 * composable only keeps the raw reactive sets.
 *
 * Wire types come from `@primebrick/core` (via `@primebrick/ui`).
 */
import { onMount, onDestroy } from 'svelte';
import { browser } from '$app/environment';
import { createSseConnection, parseSseData } from '$lib/sse/create-sse-connection';
import { apiFetch } from '$lib/api';
import type {
  PresenceDelta,
  PresenceEntry,
  PresenceSignal,
  PresenceSnapshot,
  EntityChangedMarker,
} from '@primebrick/ui';

const HEARTBEAT_MS = 20_000;

export function usePresenceChannel(opts: {
  entity: string;
  uuid: string;
  /** Optional — the entity `version` the page loaded (staleness detection). */
  getLoadedVersion?: () => number | undefined;
}) {
  const base = `/api/v1/entities/${opts.entity}/${opts.uuid}/presence`;
  /** Timestamp this channel instance mounted — "edited after my entry" comparisons. */
  const mountedAt = Date.now();
  /** Per-tab session id — server dedups tabs of the same user by it. */
  const sessionId = crypto.randomUUID();

  let readers = $state<PresenceEntry[]>([]);
  let editors = $state<PresenceEntry[]>([]);
  let changed = $state<EntityChangedMarker | null>(null);
  let currentVersion = $state<number>(0);

  async function sendSignal(signal: PresenceSignal, keepalive = false) {
    try {
      await apiFetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...signal, session_id: sessionId }),
        keepalive,
      });
    } catch {
      // best-effort — presence is a feature, not a requirement
    }
  }

  function sendReading() {
    void sendSignal({ action: 'READING', loaded_version: opts.getLoadedVersion?.() });
  }

  function applyDelta(delta: PresenceDelta) {
    const { user_uuid, action, entry } = delta;
    if (action === 'LEAVE' || entry === null) {
      readers = readers.filter((e) => e.user_uuid !== user_uuid);
      editors = editors.filter((e) => e.user_uuid !== user_uuid);
      return;
    }
    if (entry.status === 'EDITING') {
      editors = [...editors.filter((e) => e.user_uuid !== user_uuid), entry];
      readers = readers.filter((e) => e.user_uuid !== user_uuid);
    } else {
      readers = [...readers.filter((e) => e.user_uuid !== user_uuid), entry];
      editors = editors.filter((e) => e.user_uuid !== user_uuid);
    }
  }

  if (browser) {
    let close: (() => void) | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const sendLeaveBeacon = () => {
      try {
        navigator.sendBeacon(
          base,
          new Blob([JSON.stringify({ action: 'LEAVE', session_id: sessionId })], {
            type: 'application/json',
          }),
        );
      } catch {
        // best-effort
      }
    };

    onMount(() => {
      close = createSseConnection({
        url: `${base}/events`,
        // REST twin — the session-expired probe retries this after re-login.
        authProbeUrl: base,
        onOpen: () => {
          // Fresh (re)connect → re-announce ourselves; the snapshot realigns.
          sendReading();
        },
        onMessage: (msg) => {
          if (msg.event === 'snapshot') {
            const snap = parseSseData<PresenceSnapshot>(msg.data);
            readers = snap.readers;
            editors = snap.editors;
            changed = snap.changed;
            currentVersion = snap.current_version;
          } else if (msg.event === 'presence-update') {
            applyDelta(parseSseData<PresenceDelta>(msg.data));
          } else if (msg.event === 'entity-changed') {
            changed = parseSseData<EntityChangedMarker>(msg.data);
          }
        },
      });
      sendReading();
      heartbeat = setInterval(
        () => void sendSignal({ action: 'HEARTBEAT', loaded_version: opts.getLoadedVersion?.() }),
        HEARTBEAT_MS,
      );
      window.addEventListener('beforeunload', sendLeaveBeacon);
      return () => {
        if (heartbeat) clearInterval(heartbeat);
        window.removeEventListener('beforeunload', sendLeaveBeacon);
        void sendSignal({ action: 'LEAVE' }, true);
        close?.();
      };
    });

    onDestroy(() => {
      close?.();
    });
  }

  return {
    /** Epoch ms this channel mounted — FE-side "edited after my entry" anchor. */
    get mountedAt() {
      return mountedAt;
    },
    get readers() {
      return readers;
    },
    get editors() {
      return editors;
    },
    get changed() {
      return changed;
    },
    get currentVersion() {
      return currentVersion;
    },
    /** Notify other viewers that `field` is being edited (full draft value). */
    sendEditing(field: string, value: unknown) {
      void sendSignal({ action: 'EDITING', field, value });
    },
    /** Field edit finished (e.g. save succeeded locally) — back to READING. */
    sendReading,
  };
}
