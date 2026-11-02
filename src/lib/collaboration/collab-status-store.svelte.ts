/**
 * collab-status-store — render-ready collaboration status shared between
 * the form that OWNS the merge (`useCollaborativeForm`, inside
 * EntityFormPage) and the header presence zone (`PresenceStatusChip`).
 *
 * The form writes; the header reads. No reverse dependency — PageHeader
 * never touches superforms, the form never renders header chrome. Keys
 * match the channel registry (`entity:uuid`) so a record page has at most
 * one live status.
 */
import { SvelteMap } from 'svelte/reactivity';

export interface CollabStatus {
	/** Number of fields currently in conflict (tainted + remotely changed). */
	conflictCount: number;
	/** Field keys in conflict — popover listing. */
	conflictFields: string[];
	/** Latched stale — record no longer canonical (reload/remount resets). */
	isStale: boolean;
	/** Display name of the last foreign saver (chip text). */
	mergerName: string | null;
	/** Fields silently merged recently (transient count for the chip). */
	recentlyMergedCount: number;
	/** Resolve a conflict — owned by the form, invoked by the popover. */
	resolve?: (field: string, choice: 'use_remote' | 'keep_mine') => void;
}

const statuses = new SvelteMap<string, { status: CollabStatus; refs: number }>();

function keyOf(entity: string, uuid: string) {
	return `${entity}:${uuid}`;
}

/**
 * Register the status object for `entity:uuid`. The composable mutates the
 * returned `status` in place (it's `$state`-proxied); `unregister()` drops
 * it (the chip disappears). Refcounted like the channel — the form's
 * `{#key}` remount must not flicker the chip.
 */
export function registerCollabStatus(entity: string, uuid: string): {
	status: CollabStatus;
	unregister: () => void;
} {
	const key = keyOf(entity, uuid);
	let entry = statuses.get(key);
	if (!entry) {
		// `$state` only initializes a variable declaration — never an object
		// literal property (state_invalid_placement).
		const status = $state<CollabStatus>({
			conflictCount: 0,
			conflictFields: [],
			isStale: false,
			mergerName: null,
			recentlyMergedCount: 0,
		});
		entry = { status, refs: 0 };
		statuses.set(key, entry);
	}
	entry.refs++;
	return {
		status: entry.status,
		unregister: () => {
			const e = statuses.get(key);
			if (!e) return;
			if (--e.refs <= 0) statuses.delete(key);
		},
	};
}

/** Header-side read — `undefined` when no collaborative form is live. */
export function getCollabStatus(
	entity: string | undefined,
	uuid: string | undefined,
): CollabStatus | undefined {
	if (!entity || !uuid) return undefined;
	return statuses.get(keyOf(entity, uuid))?.status;
}
