import { derived, type Readable } from 'svelte/store';
import { uiLang } from './store.svelte';
import type { UiLang } from './languages';

import enGB from './messages/en-GB.json';
import itIT from './messages/it-IT.json';
import frFR from './messages/fr-FR.json';
import esES from './messages/es-ES.json';
import deDE from './messages/de-DE.json';
import ptPT from './messages/pt-PT.json';

type Dict = Record<string, unknown>;

const DICTS: Record<UiLang, Dict> = {
  'en-GB': enGB,
  /** Same strings as UK English; locale tag drives `Intl` (US formatting). */
  'en-US': enGB,
  'it-IT': itIT,
  'fr-FR': frFR,
  'es-ES': esES,
  'de-DE': deDE,
  'pt-PT': ptPT
};

function getPath(obj: Dict, path: string): string | undefined {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

function interpolate(template: string, params: Record<string, any>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match;
  });
}

export const dict = derived(uiLang, ($uiLang) => DICTS[$uiLang]);

/**
 * Recursively walks a dictionary object and returns all dot-path keys
 * that point to string leaf values. Used to enumerate i18n keys for
 * ComboSelect selectors (e.g. label_key, description_key fields).
 */
export function flattenDictKeys(obj: Dict, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') {
      keys.push(path);
    } else if (v && typeof v === 'object') {
      keys.push(...flattenDictKeys(v as Dict, path));
    }
  }
  return keys;
}

export const t: Readable<(key: string, params?: Record<string, any>) => string> = derived(
  dict,
  ($dict) =>
    (key: string, params?: Record<string, any>) => {
      const template = getPath($dict, key) ?? getPath(enGB as Dict, key) ?? key;
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
