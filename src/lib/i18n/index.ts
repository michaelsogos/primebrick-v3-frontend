import { derived, writable, type Readable } from 'svelte/store';
import { uiLang } from './store.svelte';
import { DEFAULT_LANG, type UiLang } from './languages';

import enGBFallback from './messages/en-GB-fallback.json';

/** Flat dict — keys are full dot-paths, values are translated strings. */
type Dict = Record<string, string>;

// Merged dict store — modules add their translations via mergeModuleDict.
// The dict is flat (same shape as the BE's jsonb_object_agg response).
const _mergedDicts = writable<Record<UiLang, Dict>>({} as Record<UiLang, Dict>);

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

export const t: Readable<(key: string, params?: Record<string, any>) => string> = derived(
  dict,
  ($dict) =>
    (key: string, params?: Record<string, any>) => {
      const template = $dict[key] ?? key; // direct property access — no getPath needed
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
