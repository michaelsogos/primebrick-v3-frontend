/**
 * pending-translations — session-scoped queue of translation rows to be
 * persisted ATOMICALLY with the owning page's save.
 *
 * Producers (the translation editor sheet, future translation helpers)
 * queue `{ key → { language → entry } }` entries tagged with an `owner`
 * string instead of writing rows immediately. The owning page flushes
 * them through `flushPendingTranslations(owner)` inside its own save —
 * so no orphan rows can exist: if the user discards the page, closes
 * the sheet, or abandons the form, `clearPendingTranslations(owner)`
 * drops the queue and nothing reaches the DB.
 *
 * Ownership is explicit and mandatory: a save drains ONLY the entries
 * that belong to its owner, so a queue opened on page A can never leak
 * into page B's save.
 *
 * An entry carrying `{ uuid, version }` is an UPDATE of an existing row
 * (optimistic-concurrency CAS); entries without identity are CREATEs.
 *
 * Scope: one queue per app session (module singleton).
 */

import { SvelteMap } from 'svelte/reactivity';
import type { PendingTranslationRow } from '$lib/api-types';

export type { PendingTranslationRow };

/** One queued language value for a key. */
export type PendingTranslationEntry = {
  value: string;
  /** Present → update of an existing row; requires `version` (CAS). */
  uuid?: string;
  version?: number;
};

/** language → entry */
type LangMap = Record<string, PendingTranslationEntry>;
/** key → LangMap — plain object replaced wholesale on every write so the
 *  outer SvelteMap stays the only mutation point (reactivity). */
type KeyMap = Record<string, LangMap>;

const pending = new SvelteMap<string, KeyMap>();

/** Queue (or merge into) translations for a key under `owner`. Later values win per lang. */
export function addPendingTranslation(
  owner: string,
  key: string,
  translations: Record<string, PendingTranslationEntry>,
): void {
  const m = pending.get(owner) ?? {};
  pending.set(owner, { ...m, [key]: { ...(m[key] ?? {}), ...translations } });
}

/** Drop a key's pending translations (e.g. candidate discarded). */
export function dropPendingTranslation(owner: string, key: string): void {
  const m = pending.get(owner);
  if (!m) return;
  const { [key]: _dropped, ...rest } = m;
  pending.set(owner, rest);
}

/** True if a key has queued translations under `owner`. */
export function hasPendingTranslation(owner: string, key: string): boolean {
  return key in (pending.get(owner) ?? {});
}

/** Read queued translations for a key (for preview displays). */
export function getPendingTranslation(
  owner: string,
  key: string,
): Record<string, PendingTranslationEntry> | undefined {
  return pending.get(owner)?.[key];
}

/**
 * Drain `owner`'s queue into row shape — ONLY that owner's entries are
 * removed and returned; other owners' queues are untouched.
 * Rows are emitted as `{ key, language, value, uuid?, version? }[]`.
 */
export function takePendingTranslations(owner: string): PendingTranslationRow[] {
  const m = pending.get(owner);
  if (!m) return [];
  const rows: PendingTranslationRow[] = [];
  for (const [key, langs] of Object.entries(m)) {
    for (const [language, entry] of Object.entries(langs)) {
      rows.push({ key, language, ...entry });
    }
  }
  pending.delete(owner);
  return rows;
}

/** Peek without draining (for counts/debug). */
export function pendingTranslationCount(owner?: string): number {
  let n = 0;
  const count = (m: KeyMap) => {
    for (const langs of Object.values(m)) n += Object.keys(langs).length;
  };
  if (owner != null) {
    const m = pending.get(owner);
    if (m) count(m);
  } else {
    for (const m of pending.values()) count(m);
  }
  return n;
}

/** Drop `owner`'s whole queue — on page destroy/cancel (nothing reaches the DB). */
export function clearPendingTranslations(owner: string): void {
  pending.delete(owner);
}
