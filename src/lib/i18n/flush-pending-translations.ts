/**
 * flush-pending-translations — shared drain+persist helper for the
 * pending-translation queue. Any host page calls it inside its own save
 * handler so translation writes stay atomic with the entity save UX.
 *
 * Wire contract (gateway route `/api/v1/entities/translation[...]`):
 * - rows WITH `{ uuid, version }` → `PUT` update (optimistic-concurrency
 *   CAS — a stale version fails the write, exactly as DAL prescribes);
 * - rows WITHOUT identity → `POST` create.
 *
 * Conflict contract — NEVER silent, NEVER merged:
 * any failure (409 ERR01/ERR04/ERR05 included) requeues the row under the
 * same owner and is returned to the caller, which MUST surface it through
 * its governed notification path. The user's pending text is preserved —
 * resync happens only when the translation sheet is reopened with a fresh
 * read model and the user decides how to proceed.
 */

import { createTranslation, updateTranslation } from '$lib/api';
import type { PendingTranslationRow } from '$lib/api-types';
import {
  addPendingTranslation,
  takePendingTranslations,
} from './pending-translations.svelte';

/**
 * Drain `owner`'s queue and persist each row through the gateway.
 * Returns the rows that FAILED (and were requeued) — `[]` on full success.
 */
export async function flushPendingTranslations(owner: string): Promise<PendingTranslationRow[]> {
  const drained = takePendingTranslations(owner);
  if (drained.length === 0) return [];
  const failed: PendingTranslationRow[] = [];
  for (const pt of drained) {
    const module = pt.key.split('.')[0];
    try {
      if (pt.uuid != null && pt.version != null) {
        await updateTranslation(module, pt.uuid, { value: pt.value, version: pt.version });
      } else {
        await createTranslation(module, { key: pt.key, language: pt.language, value: pt.value });
      }
    } catch {
      failed.push(pt);
    }
  }
  for (const pt of failed) {
    addPendingTranslation(owner, pt.key, {
      [pt.language]: { value: pt.value, uuid: pt.uuid, version: pt.version },
    });
  }
  return failed;
}
