import { browser } from '$app/environment';
import { DEFAULT_LANG, normalizeLang, type UiLang } from './languages';
import { writable } from 'svelte/store';

const STORAGE_KEY = 'pb.lang';

function detectBrowserLang(): UiLang {
  if (!browser) return DEFAULT_LANG;
  const primary = normalizeLang(navigator.language);
  if (primary) return primary;
  for (const lang of navigator.languages ?? []) {
    const n = normalizeLang(lang);
    if (n) return n;
  }
  return DEFAULT_LANG;
}

function readStoredLang(): UiLang | null {
  if (!browser) return null;
  return normalizeLang(sessionStorage.getItem(STORAGE_KEY));
}

let initial: UiLang = DEFAULT_LANG;
if (browser) initial = readStoredLang() ?? detectBrowserLang();

export const uiLang = writable<UiLang>(initial);

export function setUiLang(next: UiLang) {
  uiLang.set(next);
  if (browser) sessionStorage.setItem(STORAGE_KEY, next);
}

