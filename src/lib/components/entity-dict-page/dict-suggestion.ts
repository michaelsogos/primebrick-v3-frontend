/**
 * dict-suggestion — the label_key convention suggestion, shared between
 * `TranslationKeyCell` (placeholder) and `EntityDictPage.saveAll` (commit).
 *
 * Convention: `custom.entities.<tk>.rows.<slug(code)>` — `custom.*` is the
 * only user-writable namespace; the slug derives from the row's immutable
 * `code` so the suggestion tracks the identity the row already carries.
 */
import { toDisplayString } from '@primebrick/ui';

export function slugifyKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function suggestedKeyFor(translationKey: string, code: unknown): string {
  const slug = slugifyKey(toDisplayString(code));
  return slug ? `custom.entities.${translationKey}.rows.${slug}` : '';
}
