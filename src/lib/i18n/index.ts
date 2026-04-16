import { derived, type Readable } from 'svelte/store';
import { uiLang } from './store.svelte';
import type { UiLang } from './languages';

import en from './messages/en.json';
import it from './messages/it.json';
import fr from './messages/fr.json';
import es from './messages/es.json';
import de from './messages/de.json';
import pt from './messages/pt.json';

type Dict = Record<string, unknown>;

const DICTS: Record<UiLang, Dict> = { en, it, fr, es, de, pt };

function getPath(obj: Dict, path: string): string | undefined {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export const dict = derived(uiLang, ($uiLang) => DICTS[$uiLang]);

export const t: Readable<(key: string) => string> = derived(
  dict,
  ($dict) =>
    (key: string) =>
      getPath($dict, key) ?? getPath(en as Dict, key) ?? key
);

