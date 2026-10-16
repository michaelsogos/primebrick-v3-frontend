/**
 * useModuleTranslations — route-aware translation loader.
 *
 * Called from `(app)/+layout.svelte`. Loads translations for the current
 * module + language on route change and language change.
 *
 * - Stale-while-revalidate: paints localStorage dict instantly (5-min TTL),
 *   then always fetches — apiFetch sends If-None-Match, so an unchanged dict
 *   costs a 304 and a changed dict updates localStorage on the spot
 * - In-memory dedup per session with TTL (LOADED_MODULES Map)
 * - Public pages use fetchPublicTranslations instead (no auth)
 * - ETag: apiFetch sends If-None-Match and handles 304 transparently
 */

import { browser } from '$app/environment';
import { page } from '$app/state';
import { get, type Unsubscriber } from 'svelte/store';
import { uiLang, getCachedModuleDict, setCachedModuleDict } from './store.svelte';
import { mergeModuleDict, getFallbackDict } from './index';
import type { UiLang } from './languages';
import { shellNav } from '$lib/shell/modules-shell.svelte';
import { fetchModuleTranslations, fetchPublicTranslations } from '$lib/api';
import { onConnectivityRestored } from '$lib/app-connectivity-events';

const LOADED_TTL_MS = 60 * 60 * 1000; // 1 hour — same as i18n localStorage TTL
const LOADED_MODULES = new Map<string, number>(); // cacheKey → loaded_at epoch

/** Check if a module was loaded recently (within TTL). */
function isLoadedFresh(cacheKey: string): boolean {
  const loadedAt = LOADED_MODULES.get(cacheKey);
  if (!loadedAt) return false;
  if (Date.now() - loadedAt > LOADED_TTL_MS) {
    LOADED_MODULES.delete(cacheKey); // stale → allow refetch
    return false;
  }
  return true;
}

async function ensureModuleTranslations(moduleId: string, lang: UiLang): Promise<void> {
  const cacheKey = `${moduleId}:${lang}`;
  if (isLoadedFresh(cacheKey)) return;

  // Instant paint from localStorage, then ALWAYS revalidate with the BE:
  // apiFetch sends If-None-Match (pb:etag store) — a 304 means the dict is
  // unchanged, a 200 returns the fresh dict and updates both caches.
  // This makes F5 always converge to the latest server-side translations,
  // regardless of the localStorage TTL.
  const cached = getCachedModuleDict(moduleId, lang);
  if (cached) {
    mergeModuleDict(lang, cached.dict);
  }

  try {
    const dict = await fetchModuleTranslations(moduleId, lang);
    mergeModuleDict(lang, dict);
    setCachedModuleDict(moduleId, lang, dict);
    LOADED_MODULES.set(cacheKey, Date.now());
  } catch (e) {
    // Never silent: a failed fetch leaves raw keys on screen until the next
    // navigation — always log it. `cached` only decides severity.
    const log = cached ? console.warn : console.error;
    log(`[i18n] Failed to load translations for module ${moduleId}, lang ${lang}:`, e);
  }
}

/** Load public translations (for login/welcome/MCP consent pages). */
export async function loadPublicTranslations(lang: UiLang): Promise<void> {
  const cacheKey = `app:${lang}`;
  if (isLoadedFresh(cacheKey)) return;

  const cached = getCachedModuleDict('app', lang);
  if (cached) {
    mergeModuleDict(lang, cached.dict);
  }

  // Always revalidate — same ETag flow as ensureModuleTranslations.
  try {
    const dict = await fetchPublicTranslations(lang);
    mergeModuleDict(lang, dict);
    setCachedModuleDict('app', lang, dict);
    LOADED_MODULES.set(cacheKey, Date.now());
  } catch (e) {
    console.error(`[i18n] Public translations fetch failed, using fallback:`, e);
    const fallback = getFallbackDict();
    mergeModuleDict(lang, fallback);
    // Don't cache the fallback — let the next attempt try the API again
  }
}

/** Load translations for a specific module (authenticated pages). */
export async function loadModuleTranslations(moduleId: string, lang: UiLang): Promise<void> {
  return ensureModuleTranslations(moduleId, lang);
}

/**
 * Reactive route-aware loader. Must be called from a component's script block
 * (uses `$effect` which requires a component context).
 * Watches route + language changes and loads translations reactively.
 * Returns a cleanup function.
 */
export function useModuleTranslations(): { stop: () => void } {
  let unsubLang: Unsubscriber | null = null;
  let unsubConnectivity: (() => void) | null = null;

  function reloadFor(lang: UiLang) {
    const path = page.url.pathname;
    const moduleId = shellNav.resolveModuleFromRoute(path);
    const modules = new Set(['app', 'custom']);
    if (moduleId) modules.add(moduleId);
    for (const id of modules) {
      // Reset the in-memory cache for this module so the (new language or
      // recovered) fetch is not deduped away.
      LOADED_MODULES.delete(`${id}:${lang}`);
      void ensureModuleTranslations(id, lang);
    }
  }

  if (browser) {
    // Watch route changes via Svelte 5's reactive `page` object.
    // `$effect` tracks `page.url.pathname` reactively.
    $effect(() => {
      const path = page.url.pathname;
      const moduleId = shellNav.resolveModuleFromRoute(path);
      const lang = get(uiLang);
      if (moduleId) {
        void ensureModuleTranslations(moduleId, lang);
      }
    });

    // Watch language changes — when the user switches language, reload the
    // bootstrap dicts (app + custom) plus the current route module's
    // translations for the new language.
    unsubLang = uiLang.subscribe(($lang) => reloadFor($lang));

    // If a dict fetch failed because the backend was unreachable, the merged
    // dict is missing keys and nothing would refetch while the user stays on
    // the page. On connectivity recovery, re-run the bootstrap loads.
    unsubConnectivity = onConnectivityRestored(() => reloadFor(get(uiLang)));
  }

  function stop() {
    unsubLang?.();
    unsubConnectivity?.();
  }

  return { stop };
}
