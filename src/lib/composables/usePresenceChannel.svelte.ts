/**
 * usePresenceChannel — per-entity collaboration presence channel.
 *
 * Thin lifecycle wrapper over `acquirePresenceChannel` — the channel itself
 * is shared per `entity:uuid` across every consumer on the page (PageHeader
 * avatars, useCollaborativeForm), so a page never opens two SSE streams or
 * counts the same tab twice. Acquisition happens at init; release on
 * destroy (the registry defers the real close a tick, so `{#key}` remounts
 * reuse the live channel).
 *
 * Wire types come from `@primebrick/core` (via `@primebrick/ui`).
 */
import { onDestroy } from 'svelte';
import { browser } from '$app/environment';
import {
	acquirePresenceChannel,
	releasePresenceChannel,
	type PresenceChannel,
} from '$lib/collaboration/presence-channel-registry.svelte';

const SSR_CHANNEL: PresenceChannel = {
	entity: '',
	uuid: '',
	mountedAt: 0,
	sessionId: '',
	readers: [],
	editors: [],
	changed: null,
	currentVersion: 0,
	sendEditing: () => {},
	sendReading: () => {},
	onEntityChanged: () => () => {},
};

export function usePresenceChannel(opts: {
	entity: string;
	uuid: string;
	/** Optional — the entity `version` the page loaded (staleness detection). */
	getLoadedVersion?: () => number | undefined;
}): PresenceChannel {
	if (!browser) return SSR_CHANNEL;
	const channel = acquirePresenceChannel(opts.entity, opts.uuid, opts.getLoadedVersion);
	onDestroy(() => releasePresenceChannel(channel));
	return channel;
}
