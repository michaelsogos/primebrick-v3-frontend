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

export type PresenceRing = 'editing' | 'edited' | 'none';

/** All present users except the viewer, display-order: most active first. */
export function orderPresenceStack(
  readers: readonly PresenceEntry[],
  editors: readonly PresenceEntry[],
  selfUuid: string | undefined,
): PresenceEntry[] {
  const notSelf = (e: PresenceEntry) => e.user_uuid !== selfUuid;
  const byRecency = (a: PresenceEntry, b: PresenceEntry) => b.last_seen_at - a.last_seen_at;
  return [...editors.filter(notSelf)].sort(byRecency).concat(
    [...readers.filter(notSelf)].sort(byRecency),
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
  if (
    entry.edited_at !== undefined &&
    entry.edited_at > myMountAt &&
    now - entry.edited_at < EDITED_WINDOW_MS
  ) {
    return 'edited';
  }
  return 'none';
}
