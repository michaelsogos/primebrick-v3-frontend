import { derived, writable, type Readable, type Writable } from 'svelte/store';
import { uiLang } from './store.svelte';
import { DEFAULT_LANG, type UiLang } from './languages';

import enGBFallback from './messages/en-GB-fallback.json';

/** Flat dict — keys are full dot-paths, values are translated strings. */
type Dict = Record<string, string>;

// Merged dict store — modules add their translations via mergeModuleDict.
// The dict is flat (same shape as the BE's jsonb_object_agg response).
// globalThis singleton: editing this module (or en-GB-fallback.json) during
// `vite dev` creates a second module instance (?t= URL) — a plain writable
// would split-brain (loader writes one store, components read the other).
const _mergedDicts: Writable<Record<UiLang, Dict>> =
  ((globalThis as any).__pb_i18n_merged ??= writable({} as Record<UiLang, Dict>));

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

function interpolate(template: string, params: Record<string, any>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match;
  });
}

export const dict = derived([uiLang, _mergedDicts], ([$lang, $dicts]) =>
  $dicts[$lang] ?? $dicts[DEFAULT_LANG] ?? {}
);



/**
 * Returns all i18n keys from the current locale's flat dict.
 * The dict is already flat (dot-path keys → string values), so this
 * just returns Object.keys(). Used by ComboSelect selectors for
 * label_key, description_key, and error_label_key fields.
 */
export function getDictKeys(d: Record<string, unknown>): string[] {
  return Object.keys(d);
}

export const t: Readable<(key: string, params?: Record<string, any>) => string> = derived(
  dict,
  ($dict) =>
    (key: string, params?: Record<string, any>) => {
      // 1. Try current language dict (from BE)
      // 2. Return the raw key if nothing found — no en-GB fallback for app.* keys.
      //    This makes missing translations visible (raw key) instead of silently
      //    showing English, which causes "half English, half Italian" pages.
      //    The en-GB fallback is only used when the BE is unreachable (see
      //    use-module-translations.svelte.ts → loadPublicTranslations catch block).
      const template = $dict[key] ?? key;
      return params ? interpolate(template, params) : template;
    }
);

export {
  formatUiDate,
  formatUiDateTime,
  formatUiDateTimeInTimeZone,
  formatListCellValue,
  uiLocaleTag
} from './date-format';
export { uiLangRegionSuffix, orderLangEntriesByBrowser } from './languages';
