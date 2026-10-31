/**
 * Presence avatar stack — pure ordering/cap/ring logic for `PresenceAvatars`.
 *
 * Unified stack spec (see ai-plans/collaboration-visual-merge §6.4):
 * - self always rightmost; zero others → render nothing
 * - others leftward: editors first (most recent activity first), then readers
 *   (most recent `last_seen_at` first)
 * - cap: max 4 others visible + `+N` pill; total badges ≤ 6 incl. self
 * - rings: EDITING live → warning gradient; EDITED (`edited_at` within 5 min
 *   AND after the viewer's own mount) → primary gradient; else plain
 */
import type { PresenceEntry } from '@primebrick/ui';

/** Window for the EDITED ring — mirrors the server-side changed-marker TTL. */
export const EDITED_WINDOW_MS = 300_000;
/**
 * Client-side staleness window — mirrors the server-side presence TTL.
 * Entries whose `last_seen_at` is older than this are dropped from the
 * stack: a dead tab that never sent LEAVE would otherwise stay visible
 * forever (hash TTL only dies when EVERYONE stops heartbeating).
 */
export const PRESENCE_STALE_MS = 30_000;

export type PresenceRing = 'editing' | 'edited' | 'none';

/**
 * All present SESSIONS except the viewer's own tab, display-order: most
 * active first. "Others" means other sessions — another tab of the same
 * user (same `user_uuid`, different `session_id`) IS an other and renders
 * in the stack so the viewer sees their own duplicate session.
 */
export function orderPresenceStack(
  readers: readonly PresenceEntry[],
  editors: readonly PresenceEntry[],
  selfUuid: string | undefined,
  selfSessionId?: string,
  now?: number,
): PresenceEntry[] {
  const notSelf = (e: PresenceEntry) =>
    e.session_id ? e.session_id !== selfSessionId : e.user_uuid !== selfUuid;
  const fresh =
    now === undefined
      ? () => true
      : (e: PresenceEntry) => now - Number(e.last_seen_at) <= PRESENCE_STALE_MS;
  // extJson revives integers as bigint — bigint−bigint is fine for the
  // comparator, but coerce defensively for mixed payloads (snapshots).
  const byRecency = (a: PresenceEntry, b: PresenceEntry) =>
    Number(b.last_seen_at) - Number(a.last_seen_at);
  return [...editors.filter(notSelf).filter(fresh)].sort(byRecency).concat(
    [...readers.filter(notSelf).filter(fresh)].sort(byRecency),
  );
}

/**
 * The visible slice — max 4 others (self + 4 + `+N` pill = 6 badges).
 * Hidden users are always the tail (least-recently-active readers).
 */
export function capPresenceStack(ordered: readonly PresenceEntry[], max = 4) {
  const visible = ordered.slice(0, max);
  return { visible, hiddenCount: Math.max(0, ordered.length - max) };
}

/**
 * Ring for one entry: live EDITING beats past EDITED.
 * `myMountAt` — the viewer's own channel-mount timestamp: an edit only counts
 * when it happened after the viewer entered the page.
 */
export function presenceRing(
  entry: PresenceEntry,
  now: number,
  myMountAt: number,
): PresenceRing {
  if (entry.status === 'EDITING') return 'editing';
  // SSE payloads are extJson — integers arrive as bigint; arithmetic with
  // `now` (number) would throw. Coerce once at the comparison site.
  const editedAt = entry.edited_at === undefined ? undefined : Number(entry.edited_at);
  if (
    editedAt !== undefined &&
    editedAt > myMountAt &&
    now - editedAt < EDITED_WINDOW_MS
  ) {
    return 'edited';
  }
  return 'none';
}
