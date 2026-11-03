/**
 * useCollaborativeForm — attaches merge/conflict/stale collaboration to a
 * superforms instance on an update (`kind: 'detail'`) surface.
 *
 * Flow: `entity-changed` SSE → fetch the field-level audit diff from the
 * OWNING service (`{entityApiBase}/:uuid/audit?page=1&limit=1` — the
 * gateway never proxies another service's audit table) → per-field
 * `mergeDelta`: silent merge for untouched fields, conflicts for locally
 * tainted ones. `is_stale` latches on the first foreign change and resets
 * only on reload/remount — the in-memory record is no longer canonical.
 *
 * Marker handling rules:
 *  - `marker.version <= recordVersion` → already consumed (self-save echo)
 *  - self marker (`changed_by` is me) → values realign, NO stale/chip —
 *    my other tab changed the record; merging is correct but flagging it
 *    "updated by someone" would be noise
 *  - foreign marker → full merge + stale + chip state
 *
 * The channel comes from the shared registry — the PageHeader avatar
 * stack and this form share ONE SSE connection / session id.
 */
import { onDestroy } from 'svelte';
import { browser } from '$app/environment';
import { untrack } from 'svelte';
import { get } from 'svelte/store';
import { t } from '$lib/i18n';
import {
	acquirePresenceChannel,
	releasePresenceChannel,
	type PresenceChannel,
} from './presence-channel-registry.svelte';
import { mergeDelta, type FieldConflict } from './merge-delta';
import { PRESENCE_STALE_MS } from './presence-stack';
import { registerCollabStatus, type CollabStatus } from './collab-status-store.svelte';
import { apiFetchExt, extJsonStringify } from '$lib/api-ext';
import { entityApiBase } from '$lib/api';
import type { MetaColumn } from '@primebrick/ui';
import type { EntityChangedMarker } from '@primebrick/ui';

/** Transient "just merged" badge window per field (ms). */
const MERGED_BADGE_MS = 3_000;

interface AuditPageRow {
	id: bigint | number;
	delta: Record<string, { old: unknown; new: unknown }>;
	changed_by: string;
	changed_by_display_name?: string | null;
	version: number;
}

export interface CollaborativeFormOpts {
	entity: string;
	uuid: string;
	/**
	 * Activation gate — reactive: the channel + handler only live while this
	 * returns true (e.g. `isDetail && meta.collaboration.enabled`). Called
	 * unconditionally at component init so the SSE stream never opens on
	 * create pages or non-collaborative entities.
	 */
	enabled: () => boolean;
	/** Current user's uuid — self-marker filter. */
	actorUuid: () => string | undefined;
	getField: (field: string) => unknown;
	setField: (field: string, value: unknown) => void;
	untaint: (field: string) => void;
	isTainted: (field: string) => boolean;
	/** Column lookup for record→form value conversion. */
	columnOf: (field: string) => MetaColumn | undefined;
	getRecordVersion: () => number | bigint;
	setRecordVersion: (v: number | bigint) => void;
}

/** Record value → the shape the form control binds (JSON cols → string). */
function defaultToFormValue(col: MetaColumn | undefined, raw: unknown): unknown {
	if (raw === null || raw === undefined) return '';
	const isJson = col?.format === 'json' || col?.pg_type === 'jsonb' || col?.pg_type === 'json';
	if (isJson) return typeof raw === 'string' ? raw : extJsonStringify(raw);
	return raw;
}

export function useCollaborativeForm(opts: CollaborativeFormOpts) {
	let channel = $state<PresenceChannel | null>(null);

	/** Conflicts keyed by field — remote deltas withheld from tainted fields. */
	let conflicts = $state<Record<string, FieldConflict>>({});
	/** Fields merged in the last MERGED_BADGE_MS — transient success badge. */
	const mergedAt = $state<Record<string, number>>({});
	/** Latches true on the first foreign change; reload/remount resets it. */
	let isStale = $state(false);
	/** Display name of the last foreign saver (for the status chip). */
	let lastMergerName = $state<string | null>(null);
	let tick = $state(Date.now());
	/** Header-readable status — registered only while the channel is live. */
	let status = $state<CollabStatus | null>(null);

	let badgeTimer: ReturnType<typeof setInterval> | null = null;
	if (browser) {
		// Single ticking clock for badge expiry — cheaper than per-field timers.
		badgeTimer = setInterval(() => {
			tick = Date.now();
			syncStatus();
		}, 1_000);
	}

	/** Push local merge/conflict/stale state into the header-readable status. */
	function syncStatus() {
		if (!status) return;
		status.conflictCount = Object.keys(conflicts).length;
		status.conflictFields = Object.keys(conflicts);
		status.isStale = isStale;
		status.mergerName = lastMergerName;
		status.recentlyMergedCount = Object.values(mergedAt).filter(
			(t) => Date.now() - t < MERGED_BADGE_MS,
		).length;
	}

	async function handleEntityChanged(marker: EntityChangedMarker) {
		if (marker.entity_uuid !== opts.uuid) return;
		// Self-save echo — the PUT response already realigned the version.
		if (Number(marker.version) <= Number(opts.getRecordVersion())) return;

		// Self = same user AND same tab session. A save from ANOTHER tab of the
		// same user is foreign: it merges + surfaces conflicts/chip like any
		// other writer (markers without changed_by_session — e.g. from services
		// or older clients — degrade to the user_uuid rule).
		const isSelf =
			marker.changed_by === opts.actorUuid() &&
			(marker.changed_by_session === undefined ||
				marker.changed_by_session === channel?.sessionId);
		opts.setRecordVersion(marker.version);

		let row: AuditPageRow | null = null;
		try {
			const page = await apiFetchExt<{ data: AuditPageRow[] }>(
				`${entityApiBase(opts.entity)}/${opts.uuid}/audit?page=1&limit=1`,
			);
			row = page.data[0] ?? null;
		} catch {
			// Diff unavailable — still flag stale; merging is best-effort.
		}
		if (!row) {
			if (!isSelf) {
				isStale = true;
				syncStatus();
			}
			return;
		}

		const outcome = mergeDelta({
			delta: row.delta ?? {},
			isTainted: opts.isTainted,
			getField: opts.getField,
			setField: opts.setField,
			untaint: opts.untaint,
			toFormValue: (f, raw) => defaultToFormValue(opts.columnOf(f), raw),
		});

		if (isSelf) return;
		isStale = true;
		// Same user, other tab — surface "you — other tab" instead of the
		// user's own name so the duplicate session is obvious.
		lastMergerName =
			row.changed_by === opts.actorUuid()
				? get(t)('app.collaboration.you_other_tab')
				: (row.changed_by_display_name ?? row.changed_by);
		if (outcome.merged.length) {
			const now = Date.now();
			for (const f of outcome.merged) mergedAt[f] = now;
		}
		conflicts = { ...conflicts, ...outcome.conflicts };
		syncStatus();
	}

	// Activation gate — the channel lives only while `enabled()` is true.
	// `$effect` cleanup releases the share (registry refcounts; the last
	// release defers the real close so `{#key}` remounts reuse it).
	$effect(() => {
		if (!browser || !opts.enabled()) {
			channel = null;
			return;
		}
		const ch = untrack(() => acquirePresenceChannel(opts.entity, opts.uuid));
		channel = ch;
		const reg = untrack(() => registerCollabStatus(opts.entity, opts.uuid));
		reg.status.resolve = (f, c) => api.resolveConflict(f, c);
		status = reg.status;
		const unsubscribe = ch.onEntityChanged((m) => void handleEntityChanged(m));
		return () => {
			unsubscribe();
			reg.unregister();
			status = null;
			releasePresenceChannel(ch);
			channel = null;
		};
	});

	onDestroy(() => {
		if (badgeTimer) clearInterval(badgeTimer);
	});

	const api = {
		get channel() {
			return channel;
		},
		get conflicts() {
			return conflicts;
		},
		get conflictCount() {
			return Object.keys(conflicts).length;
		},
		get isStale() {
			return isStale;
		},
		get lastMergerName() {
			return lastMergerName;
		},
		/** Field merged within the badge window (reads `tick` for reactivity). */
		isMergedField(field: string): boolean {
			const t = mergedAt[field];
			return t !== undefined && tick - t < MERGED_BADGE_MS;
		},
		/**
		 * Display names of the OTHER sessions live-editing this field right
		 * now (my other tab resolves to "you — other tab"). Empty = nobody.
		 */
		fieldEditorNames(field: string): string[] {
			// Prune stale editors — a dead tab that never sent LEAVE would
			// otherwise keep "N users editing" forever (hash TTL dies only
			// when EVERYONE stops heartbeating; same rule as the avatar
			// stack's `orderPresenceStack`).
			return (channel?.editors ?? [])
				.filter(
					(e) =>
						e.session_id !== channel?.sessionId &&
						e.field === field &&
						tick - Number(e.last_seen_at) <= PRESENCE_STALE_MS,
				)
				.map((e) =>
					e.user_uuid === opts.actorUuid()
						? get(t)('app.collaboration.you_other_tab')
						: e.user_name,
				);
		},
		/**
		 * Resolve a conflict — 'use_remote' applies the withheld value and
		 * untaints; 'keep_mine' just drops the conflict (the user's draft
		 * already holds the field).
		 */
		resolveConflict(field: string, choice: 'use_remote' | 'keep_mine') {
			const c = conflicts[field];
			if (!c) return;
			if (choice === 'use_remote') {
				opts.setField(field, c.remote);
				opts.untaint(field);
			}
			const next = { ...conflicts };
			delete next[field];
			conflicts = next;
			syncStatus();
		},
		/** Field currently locked by an unresolved conflict (readonly + red). */
		isConflicted(field: string): boolean {
			return field in conflicts;
		},
		/**
		 * Inject foreign conflicts from a non-collab delta source — the
		 * draft restore replays tainted edits over a stale base the same
		 * way (local = applied draft value, remote = fresh server value).
		 * Resolution goes through `resolveConflict` identically: keep_mine
		 * keeps the already-applied local, use_remote writes remote.
		 */
		addConflicts(entries: Record<string, FieldConflict>) {
			if (!Object.keys(entries).length) return;
			conflicts = { ...conflicts, ...entries };
			syncStatus();
		},
		/**
		 * Optimistic-lock conflict (PUT → 409 ERR01): the save was rejected —
		 * someone else committed first. Fetch the FRESH record (not the audit
		 * delta — the marker may not have landed yet), realign the lock, then
		 * replay the delta logic against it: untouched fields take the new
		 * values, tainted fields become conflicts for manual resolution.
		 * After resolution the user just saves again — version is current.
		 */
		async handleVersionConflict() {
			const fresh = await apiFetchExt<Record<string, unknown>>(
				`${entityApiBase(opts.entity)}/${opts.uuid}`,
			).catch(() => null);
			if (!fresh) return; // record unreadable — keep the conflict surface minimal
			if (
				typeof fresh.version === 'number' ||
				typeof fresh.version === 'bigint'
			) {
				opts.setRecordVersion(fresh.version);
			}
			const newConflicts: Record<string, FieldConflict> = {};
			for (const [key, remoteRaw] of Object.entries(fresh)) {
				if (key === 'version' || key === 'uuid' || key === 'id') continue;
				const remote = defaultToFormValue(opts.columnOf(key), remoteRaw);
				if (opts.isTainted(key)) {
					if (remote !== opts.getField(key)) {
						newConflicts[key] = {
							local: opts.getField(key),
							remote,
							base: undefined,
						};
					}
				} else if (opts.getField(key) !== undefined && remote !== opts.getField(key)) {
					// Untouched + declared on the form (undefined ⇒ not a form
					// field — system columns never merge) → adopt the fresh
					// value silently.
					opts.setField(key, remote);
					opts.untaint(key);
					mergedAt[key] = Date.now();
				}
			}
			if (Object.keys(newConflicts).length) {
				conflicts = { ...conflicts, ...newConflicts };
			}
			isStale = true;
			syncStatus();
		},
	};
	return api;
}
