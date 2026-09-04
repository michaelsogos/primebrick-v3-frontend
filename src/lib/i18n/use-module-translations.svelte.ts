/**
 * useModuleTranslations — route-aware translation loader.
 *
 * Called from `(app)/+layout.svelte`. Loads translations for the current
 * module + language on route change and language change.
 *
 * - Cache-first: checks localStorage (5-minute TTL)
 * - Falls back to API: GET /api/v1/translations/:module/:language
 * - In-memory dedup per session (LOADED_MODULES set)
 * - Public pages use fetchPublicTranslations instead (no auth)
 */

import { browser } from '$app/environment';
import { page } from '$app/state';
import { get, type Unsubscriber } from 'svelte/store';
import { uiLang, getCachedModuleDict, setCachedModuleDict } from './store.svelte';
import { mergeModuleDict, getFallbackDict } from './index';
import type { UiLang } from './languages';
import { shellNav } from '$lib/shell/modules-shell.svelte';
import { fetchModuleTranslations, fetchPublicTranslations } from '$lib/api';

const LOADED_MODULES = new Set<string>(); // in-memory dedup per session

async function ensureModuleTranslations(moduleId: string, lang: UiLang): Promise<void> {
  const cacheKey = `${moduleId}:${lang}`;
  if (LOADED_MODULES.has(cacheKey)) return;

  // Check localStorage
  const cached = getCachedModuleDict(moduleId, lang);
  if (cached) {
    mergeModuleDict(lang, cached.dict);
    LOADED_MODULES.add(cacheKey);
    return;
  }

  // Fetch from API
  try {
    const dict = await fetchModuleTranslations(moduleId, lang);
    mergeModuleDict(lang, dict);
    setCachedModuleDict(moduleId, lang, dict);
    LOADED_MODULES.add(cacheKey);
  } catch (e) {
    console.error(`[i18n] Failed to load translations for module ${moduleId}, lang ${lang}:`, e);
  }
}

/** Load public translations (for login/welcome/MCP consent pages). */
export async function loadPublicTranslations(lang: UiLang): Promise<void> {
  const cacheKey = `app:${lang}`;
  if (LOADED_MODULES.has(cacheKey)) return;

  const cached = getCachedModuleDict('app', lang);
  if (cached) {
    mergeModuleDict(lang, cached.dict);
    LOADED_MODULES.add(cacheKey);
    return;
  }

  try {
    const dict = await fetchPublicTranslations(lang);
    mergeModuleDict(lang, dict);
    setCachedModuleDict('app', lang, dict);
    LOADED_MODULES.add(cacheKey);
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

    // Watch language changes — when the user switches language, reload
    // the current module's translations for the new language.
    unsubLang = uiLang.subscribe(($lang) => {
      const path = page.url.pathname;
      const moduleId = shellNav.resolveModuleFromRoute(path);
      if (moduleId) {
        // Reset the in-memory cache for this module so the new language loads
        LOADED_MODULES.delete(`${moduleId}:${$lang}`);
        void ensureModuleTranslations(moduleId, $lang);
      }
    });
  }

  function stop() {
    unsubLang?.();
  }

  return { stop };
}
