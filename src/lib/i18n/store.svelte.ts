import { browser } from '$app/environment';
import { DEFAULT_LANG, normalizeLang, type UiLang } from './languages';
import { writable } from 'svelte/store';

const STORAGE_KEY = 'pb.lang';
const I18N_CACHE_PREFIX = 'pb:i18n:';
const I18N_TTL_MS = 5 * 60 * 1000; // 5 minutes — user-facing freshness window

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

// --- Per-module dict cache in localStorage (5-minute TTL) ---

export interface CachedI18nModule {
  dict: Record<string, string>;
  cached_at: number; // epoch ms
}

export function getCachedModuleDict(moduleId: string, lang: UiLang): CachedI18nModule | null {
  if (!browser) return null;
  const raw = localStorage.getItem(`${I18N_CACHE_PREFIX}${moduleId}:${lang}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedI18nModule;
    if (Date.now() - parsed.cached_at > I18N_TTL_MS) return null; // stale
    return parsed;
  } catch {
    return null;
  }
}

export function setCachedModuleDict(moduleId: string, lang: UiLang, dict: Record<string, string>): void {
  if (!browser) return;
  const entry: CachedI18nModule = { dict, cached_at: Date.now() };
  localStorage.setItem(`${I18N_CACHE_PREFIX}${moduleId}:${lang}`, JSON.stringify(entry));
}

