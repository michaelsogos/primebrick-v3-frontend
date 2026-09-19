/**
 * pending-translations — session-scoped queue of translation rows to be
 * created ATOMICALLY with the owning entity's save.
 *
 * Producers (assistant key_picker, future translation helpers) queue
 * `{ key → { language → value } }` entries instead of inserting rows
 * immediately. The form's save handler flushes them via `takeAll()` into the
 * `{ entity, translations }` write payload — so no orphan rows can exist:
 * if the user discards the candidate, closes the sheet, or abandons the
 * form, the queue is dropped and nothing reaches the DB.
 *
 * Scope: one pending queue per app session (module singleton). The owning
 * page MUST call `clearPendingTranslations()` on destroy/cancel.
 */

import type { PendingTranslationRow } from '$lib/api-types';

export type { PendingTranslationRow };

const pending = $state(new Map<string, Record<string, string>>());

/** Queue (or merge into) translations for a key. Later values win per lang. */
export function addPendingTranslation(key: string, translations: Record<string, string>): void {
  const existing = pending.get(key) ?? {};
  pending.set(key, { ...existing, ...translations });
}

/** Drop a key's pending translations (e.g. candidate discarded). */
export function dropPendingTranslation(key: string): void {
  pending.delete(key);
}

/** True if a key has queued translations. */
export function hasPendingTranslation(key: string): boolean {
  return pending.has(key);
}

/** Read queued translations for a key (for preview displays). */
export function getPendingTranslation(key: string): Record<string, string> | undefined {
  return pending.get(key);
}

/**
 * Drain the queue into the write payload shape.
 * Rows are emitted as `{ key, language, value }[]` — the caller appends them
 * as `translations` in the `{ entity, translations }` body.
 */
export function takePendingTranslations(): PendingTranslationRow[] {
  const rows: PendingTranslationRow[] = [];
  for (const [key, langs] of pending) {
    for (const [language, value] of Object.entries(langs)) {
      rows.push({ key, language, value });
    }
  }
  pending.clear();
  return rows;
}

/** Peek without draining (for counts/debug). */
export function pendingTranslationCount(): number {
  let n = 0;
  for (const langs of pending.values()) n += Object.keys(langs).length;
  return n;
}

/** Drop the whole queue — on page destroy/cancel (nothing reaches the DB). */
export function clearPendingTranslations(): void {
  pending.clear();
}
