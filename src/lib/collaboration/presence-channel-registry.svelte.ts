/**
 * presence-channel-registry — ONE presence channel per `entity:uuid`, shared
 * by every consumer on the page (PageHeader avatars, collaborative form).
 *
 * Two consumers must never open two SSE streams — each connection carries a
 * `session_id` and the server counts tabs by it: a duplicated channel would
 * render the same user twice and double every EDITING signal. The registry
 * refcounts acquisition; the last release schedules the close a tick later
 * so `{#key}` remounts (destroy → create in the same flush) reuse the live
 * channel instead of churning connect/LEAVE/READING.
 *
 * The channel connects eagerly on first acquire (these composables run
 * inside component init, always in the browser for this SPA host).
 */
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { createSseConnection, parseSseData } from '$lib/sse/create-sse-connection';
import { apiFetch } from '$lib/api';
import { getTabSessionId } from '$lib/collaboration/tab-session';
import type {
	PresenceDelta,
	PresenceEntry,
	PresenceSignal,
	PresenceSnapshot,
	EntityChangedMarker,
} from '@primebrick/ui';

/**
 * Fallback heartbeat cadence — only sent while the SSE stream is DOWN. When
 * SSE is open the server refreshes this session's presence TTL (60s) itself
 * on every 45s keep-alive tick, so a periodic POST would be redundant.
 */
const HEARTBEAT_MS = 45_000;
/** Coalesce rapid focus changes into one EDITING signal (trailing edge). */
const EDITING_DEBOUNCE_MS = 400;
/** Grace window for release→acquire remounts (one Svelte flush). */
const RELEASE_GRACE_MS = 0;

export interface PresenceChannel {
	readonly entity: string;
	readonly uuid: string;
	/** Epoch ms this channel mounted — "edited after my entry" anchor. */
	readonly mountedAt: number;
	readonly sessionId: string;
	readonly readers: PresenceEntry[];
	readonly editors: PresenceEntry[];
	readonly changed: EntityChangedMarker | null;
	readonly currentVersion: number;
	sendEditing(field: string, value: unknown): void;
	sendReading(): void;
	/** Subscribe to `entity-changed` events. Returns unsubscribe. */
	onEntityChanged(cb: (marker: EntityChangedMarker) => void): () => void;
}

interface ChannelCore {
	state: {
		readers: PresenceEntry[];
		editors: PresenceEntry[];
		changed: EntityChangedMarker | null;
		currentVersion: number;
	};
	publicChannel: PresenceChannel;
	close(): void;
}

function createChannel(
	entity: string,
	uuid: string,
	getLoadedVersion?: () => number | undefined,
): ChannelCore {
	const base = `/api/v1/entities/${entity}/${uuid}/presence`;
	const sessionId = getTabSessionId();
	const changedCbs = new SvelteSet<(m: EntityChangedMarker) => void>();

	const state = $state({
		readers: [] as PresenceEntry[],
		editors: [] as PresenceEntry[],
		changed: null as EntityChangedMarker | null,
		currentVersion: 0,
	});

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
		void sendSignal({ action: 'READING', loaded_version: getLoadedVersion?.() });
	}

	// Entries of THIS tab's own session must never enter channel state:
	// the server excludes own-session delta echoes, but the connect-time
	// SNAPSHOT is unfiltered — after an SSE reconnect our own EDITING/READING
	// entry (still live in Redis) would surface to consumers as a foreign
	// session. Filtering once at ingestion keeps every consumer safe.
	const notSelfSession = (e: PresenceEntry) => e.session_id !== sessionId;

	function applyDelta(delta: PresenceDelta) {
		const { user_uuid, session_id, action, entry } = delta;
		if (session_id === sessionId) return;
		// Entries are session-keyed: a delta affects the writer's session only.
		// When the delta carries no session (synthetic __expired__ LEAVEs),
		// fall back to user-level matching.
		const match = (e: PresenceEntry) =>
			session_id ? e.session_id === session_id : e.user_uuid === user_uuid;
		if (action === 'LEAVE' || entry === null) {
			state.readers = state.readers.filter((e) => !match(e));
			state.editors = state.editors.filter((e) => !match(e));
			return;
		}
		if (entry.status === 'EDITING') {
			state.editors = [...state.editors.filter((e) => !match(e)), entry];
			state.readers = state.readers.filter((e) => !match(e));
		} else {
			state.readers = [...state.readers.filter((e) => !match(e)), entry];
			state.editors = state.editors.filter((e) => !match(e));
		}
	}

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

	let sseOpen = false;
	const closeSse = createSseConnection({
		// The server excludes only echoes of THIS session — another tab of the
		// same user is a different session and must be echoed.
		url: `${base}/events?session_id=${encodeURIComponent(sessionId)}`,
		// REST twin — the session-expired probe retries this after re-login.
		authProbeUrl: base,
		onOpen: () => {
			// Fresh (re)connect → re-announce ourselves; the snapshot realigns.
			// SSE liveness now drives the TTL — heartbeat stays silent.
			sseOpen = true;
			sendReading();
		},
		onError: () => {
			// SSE down → fallback heartbeat resumes until the next onOpen.
			sseOpen = false;
		},
		onMessage: (msg) => {
			if (msg.event === 'snapshot') {
				const snap = parseSseData<PresenceSnapshot>(msg.data);
				state.readers = snap.readers.filter(notSelfSession);
				state.editors = snap.editors.filter(notSelfSession);
				state.changed = snap.changed;
				state.currentVersion = snap.current_version;
			} else if (msg.event === 'presence-update') {
				applyDelta(parseSseData<PresenceDelta>(msg.data));
			} else if (msg.event === 'entity-changed') {
				const marker = parseSseData<EntityChangedMarker>(msg.data);
				state.changed = marker;
				for (const cb of changedCbs) cb(marker);
			}
		},
	});
	sendReading();
	const heartbeat = setInterval(() => {
		// SSE-driven liveness: while the stream is open the server refreshes
		// this session's TTL on each keep-alive tick — skip the POST entirely.
		if (sseOpen) return;
		void sendSignal({ action: 'HEARTBEAT', loaded_version: getLoadedVersion?.() });
	}, HEARTBEAT_MS);
	window.addEventListener('beforeunload', sendLeaveBeacon);

	let editingTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingEditing: { field: string; value: unknown } | null = null;

	function sendEditingDebounced(field: string, value: unknown) {
		// Rapid focus hops coalesce to the LATEST field+value — a burst of
		// focusin events produces a single trailing EDITING signal.
		pendingEditing = { field, value };
		editingTimer ??= setTimeout(() => {
			editingTimer = null;
			const signal = pendingEditing;
			pendingEditing = null;
			if (signal) void sendSignal({ action: 'EDITING', field: signal.field, value: signal.value });
		}, EDITING_DEBOUNCE_MS);
	}

	function close() {
		if (editingTimer) {
			clearTimeout(editingTimer);
			editingTimer = null;
			pendingEditing = null; // LEAVE supersedes any pending EDITING
		}
		clearInterval(heartbeat);
		window.removeEventListener('beforeunload', sendLeaveBeacon);
		void sendSignal({ action: 'LEAVE' }, true);
		closeSse();
	}

	return {
		state,
		close,
		publicChannel: {
			entity,
			uuid,
			mountedAt: Date.now(),
			sessionId,
			get readers() {
				return state.readers;
			},
			get editors() {
				return state.editors;
			},
			get changed() {
				return state.changed;
			},
			get currentVersion() {
				return state.currentVersion;
			},
			sendEditing(field: string, value: unknown) {
				sendEditingDebounced(field, value);
			},
			sendReading,
			onEntityChanged(cb) {
				changedCbs.add(cb);
				return () => changedCbs.delete(cb);
			},
		},
	};
}

interface RegistryEntry {
	core: ChannelCore;
	refs: number;
	releaseTimer: ReturnType<typeof setTimeout> | null;
}

const registry = new SvelteMap<string, RegistryEntry>();

export function acquirePresenceChannel(
	entity: string,
	uuid: string,
	getLoadedVersion?: () => number | undefined,
): PresenceChannel {
	const key = `${entity}:${uuid}`;
	let entry = registry.get(key);
	if (!entry) {
		entry = { core: createChannel(entity, uuid, getLoadedVersion), refs: 0, releaseTimer: null };
		registry.set(key, entry);
	}
	entry.refs++;
	if (entry.releaseTimer) {
		clearTimeout(entry.releaseTimer);
		entry.releaseTimer = null;
	}
	return entry.core.publicChannel;
}

export function releasePresenceChannel(channel: PresenceChannel): void {
	const key = `${channel.entity}:${channel.uuid}`;
	const entry = registry.get(key);
	if (!entry || entry.core.publicChannel !== channel) return;
	entry.refs--;
	if (entry.refs > 0) return;
	entry.releaseTimer = setTimeout(() => {
		registry.delete(key);
		entry.core.close();
	}, RELEASE_GRACE_MS);
}
