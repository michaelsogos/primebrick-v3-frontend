import { derived, writable, type Readable, type Writable } from 'svelte/store';
import { uiLang } from './store.svelte';
import { DEFAULT_LANG, type UiLang } from './languages';

import enGBFallback from './messages/en-GB-fallback.json';

/** Flat dict — keys are full dot-paths, values are translated strings. */
type Dict = Record<string, string>;

/**
 * Core dictionary modules — the ONLY non-service translation namespaces.
 *
 *   - `app`    — public/shared app vocabulary (public.translations), the
 *                only dict with a static en-GB fallback file.
 *   - `custom` — customer-owned overrides (custom.translations).
 *   - `system` — shared platform vocabulary (system.translations):
 *                system.entities.* labels and shared chrome strings.
 *
 * Every authenticated page needs all three; service-owned module pages add
 * their own `<module>` dict on top (resolved from the route). Single source
 * for the bootstrap loader, the route-aware reloader and the translations
 * admin module list — never redeclare this literal.
 */
export const CORE_DICT_MODULES = ['app', 'custom', 'system'] as const;

// Merged dict store — modules add their translations via mergeModuleDict.
// The dict is flat (same shape as the BE's jsonb_object_agg response).
// globalThis singleton: editing this module (or en-GB-fallback.json) during
// `vite dev` creates a second module instance (?t= URL) — a plain writable
// would split-brain (loader writes one store, components read the other).
declare global {
  var __pb_i18n_merged: Writable<Record<UiLang, Dict>> | undefined;
}
const _mergedDicts: Writable<Record<UiLang, Dict>> =
  (globalThis.__pb_i18n_merged ??= writable({} as Record<UiLang, Dict>));

/** Merge a partial dict (from API or fallback) into the i18n store for a language. */
export function mergeModuleDict(lang: UiLang, partial: Dict): void {
  _mergedDicts.update((dicts) => ({
    ...dicts,
    [lang]: { ...dicts[lang] ?? {}, ...partial }, // flat merge — no deepMerge needed
  }));
}

/** Get the fallback dict (English, public-page keys only). Used when BE is unreachable. */
export function getFallbackDict(): Dict {
  return enGBFallback as Dict;
}

function interpolate(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match;
  });
}

export const dict = derived([uiLang, _mergedDicts], ([$lang, $dicts]) => ({
  // app.* EN floor — the generated static dict, always present. Any `app.*`
  // key missing in the fetched dicts still renders English instead of the
  // raw key (this is what keeps the chrome readable when the BE is down).
  ...(enGBFallback as Dict),
  // Fetched en-GB dicts override the static floor (fresher, cache + API).
  ...($dicts[DEFAULT_LANG] ?? {}),
  // The current language always wins per key.
  ...($dicts[$lang] ?? {}),
}));



/**
 * Returns all i18n keys from the current locale's flat dict.
 * The dict is already flat (dot-path keys → string values), so this
 * just returns Object.keys(). Used by ComboSelect selectors for
 * label_key, description_key, and error_label_key fields.
 */
export function getDictKeys(d: Record<string, unknown>): string[] {
  return Object.keys(d);
}

export const t: Readable<(key: string, params?: Record<string, unknown>) => string> = derived(
  dict,
  ($dict) =>
    (key: string, params?: Record<string, unknown>) => {
      // The dict already carries the layered fallback chain (static app.* EN
      // floor → fetched en-GB → current lang). A raw key therefore means the
      // key is missing in EVERY layer — the missing-translation detector
      // stays intact for keys that don't exist anywhere.
      const template = $dict[key] ?? key;
      return params ? interpolate(template, params) : template;
    }
);

export { formatUiDate,
  formatUiDateTime,
  formatUiDateTimeInTimeZone,
  formatListCellValue,
  uiLocaleTag } from '@primebrick/ui';
export { uiLangRegionSuffix, orderLangEntriesByBrowser } from './languages';
