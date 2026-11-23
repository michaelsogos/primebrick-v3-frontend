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

/**
 * The ONE `format:"i18n_key"` suggestion formula — shared by the form
 * surface (baseline seed), the field dispatcher (assigned-value tracking)
 * and dict cells. With a `translation_key` the suggestion is namespaced
 * `custom.entities.<tk>.rows.<slug>` — `''` when no code/name exists yet
 * (nothing to slug). Without it the broad fallback is
 * `custom.entities.<slug>` with `my_custom_code` as the empty leaf.
 */
export function i18nKeySuggestionFor(
  translationKey: string | null | undefined,
  codeOrName: unknown,
): string {
  if (translationKey) return suggestedKeyFor(translationKey, codeOrName);
  const slug = slugifyKey(toDisplayString(codeOrName)) || 'my_custom_code';
  return `custom.entities.${slug}`;
}
