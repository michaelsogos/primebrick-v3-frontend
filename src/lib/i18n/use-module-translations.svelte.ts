/**
 * useModuleTranslations — route-aware translation loader.
 *
 * Called from `(app)/+layout.svelte`. Loads translations for the current
 * module + language on route change and language change.
 *
 * - Last-known-good: paints localStorage dict instantly (no TTL — entries
 *   survive until a fresher dict replaces them, never expire for age),
 *   then always fetches — apiFetch sends If-None-Match, so an unchanged dict
 *   costs a 304 and a changed dict updates localStorage on the spot
 * - In-memory dedup per session with TTL (LOADED_MODULES Map)
 * - Public pages use fetchPublicTranslations instead (no auth)
 * - ETag: apiFetch sends If-None-Match and handles 304 transparently
 */

import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { browser } from '$app/environment';
import { page } from '$app/state';
import { get, type Unsubscriber } from 'svelte/store';
import { uiLang, getCachedModuleDict, setCachedModuleDict } from './store.svelte';
import { mergeModuleDict, getFallbackDict, CORE_DICT_MODULES } from './index';
import { DEFAULT_LANG, type UiLang } from './languages';
import { shellNav } from '$lib/shell/modules-shell.svelte';
import { fetchModuleTranslations, fetchPublicTranslations, fetchTranslationsFind } from '$lib/api';
import { onConnectivityRestored } from '$lib/app-connectivity-events';
import { pushNotification } from '$lib/errors/app-errors';

const LOADED_TTL_MS = 60 * 60 * 1000; // 1 hour — same as i18n localStorage TTL
const LOADED_MODULES = new SvelteMap<string, number>(); // cacheKey → loaded_at epoch

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

async function ensureModuleTranslations(
  moduleId: string,
  lang: UiLang,
  opts?: { bestEffort?: boolean },
): Promise<void> {
  const cacheKey = `${moduleId}:${lang}`;
  if (isLoadedFresh(cacheKey)) return;

  // Instant paint from localStorage, then ALWAYS revalidate with the BE:
  // apiFetch sends If-None-Match (pb:etag store) — a 304 means the dict is
  // unchanged, a 200 returns the fresh dict and updates both caches.
  // localStorage entries have no TTL: last-known-good paints instantly and
  // survives until a fresher dict replaces it.
  const cached = getCachedModuleDict(moduleId, lang);
  if (cached) {
    mergeModuleDict(lang, cached.dict);
  }
  // EN floor: any cached en-GB dict for this module layers under the lang
  // dict — keys missing in `lang` (or the whole dict, when the lang fetch
  // fails) still render English instead of raw keys.
  if (lang !== DEFAULT_LANG) {
    const enCached = getCachedModuleDict(moduleId, DEFAULT_LANG);
    if (enCached) mergeModuleDict(DEFAULT_LANG, enCached.dict);
  }

  try {
    const dict = await fetchModuleTranslations(moduleId, lang);
    mergeModuleDict(lang, dict);
    setCachedModuleDict(moduleId, lang, dict);
    LOADED_MODULES.set(cacheKey, Date.now());
  } catch (e) {
    if (opts?.bestEffort) {
      // Census contributors are peripheral enrichers (callable/emit labels
      // on a foreign module's page): a dead service must not scream — the
      // option degrades to its raw key and the failure is deduped for the
      // TTL so an offline service is not hammered on every effect run.
      LOADED_MODULES.set(cacheKey, Date.now());
      console.debug(`[i18n] module ${moduleId} dict unavailable (${lang}) — raw keys`, e);
      return;
    }
    // Never silent, never blocking: a failed dict fetch surfaces as a
    // non-blocking notification (toast + errors-panel card) — raw keys stay
    // visible but the failure is explicit and the user can navigate/retry.
    // Severity: HIGH when there is no cached dict (raw keys guaranteed),
    // MEDIUM when a cached dict still covers the UI (stale but working).
    const log = cached ? console.warn : console.error;
    log(`[i18n] Failed to load translations for module ${moduleId}, lang ${lang}:`, e);
    pushNotification({
      impact: cached ? 'MEDIUM' : 'HIGH',
      message: `Failed to load translations for module '${moduleId}' (${lang})`,
      scope: 'i18n',
      detail: String(e),
    });
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
export async function loadModuleTranslations(
  moduleId: string,
  lang: UiLang,
  opts?: { bestEffort?: boolean },
): Promise<void> {
  return ensureModuleTranslations(moduleId, lang, opts);
}

const FIND_MATCHES_CAP = 64; // BE wire bound — larger sets are chunked.

/**
 * loadTranslationsByKeys — targeted enrichment through `findTranslations`,
 * the ONE governed cross-domain translation read. Callers pass the exact
 * keys (or `ns.*` subtree prefixes) they are about to render — the shell
 * never downloads a whole foreign dictionary. One request returns every
 * language's rows, so the en-GB floor layers in for free; rows merge into
 * the flat dict store and the matches-signature dedups for LOADED_TTL_MS.
 */
export async function loadTranslationsByKeys(matches: string[]): Promise<void> {
  const unique = [...new Set(matches.filter(Boolean))].sort();
  if (!unique.length) return;
  const cacheKey = `keys:${unique.join(',')}`;
  if (isLoadedFresh(cacheKey)) return;
  try {
    for (let i = 0; i < unique.length; i += FIND_MATCHES_CAP) {
      const rows = await fetchTranslationsFind(unique.slice(i, i + FIND_MATCHES_CAP));
      const byLang = new Map<string, Record<string, string>>();
      for (const row of rows) {
        const dict = byLang.get(row.language) ?? {};
        dict[row.key] = row.value;
        byLang.set(row.language, dict);
      }
      for (const [language, dict] of byLang) {
        mergeModuleDict(language as UiLang, dict);
      }
    }
    LOADED_MODULES.set(cacheKey, Date.now());
  } catch (e) {
    // Same contract as ensureModuleTranslations — never silent, never
    // blocking: labels degrade to their fallback (raw key / registry name)
    // and the failure is deduped for the TTL so a hiccup is not hammered.
    LOADED_MODULES.set(cacheKey, Date.now());
    console.warn(`[i18n] findTranslations fetch failed — labels fall back to raw keys`, e);
    pushNotification({
      impact: 'MEDIUM',
      message: 'Failed to load module labels',
      scope: 'i18n',
      detail: String(e),
    });
  }
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
    // Dict module, not module id — virtual siblings translate under the
    // declaring service's schema (translations_module contract).
    const moduleId = shellNav.resolveDictModuleFromRoute(path);
    // 'system' is the shared platform dictionary (entity labels
    // system.entities.*, shared chrome strings) — NOT settings-owned; every
    // module page needs it (a service-owned page under module `job` still
    // renders system.* keys). CORE_DICT_MODULES is the single source.
    const modules = new SvelteSet<string>(CORE_DICT_MODULES);
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
      const moduleId = shellNav.resolveDictModuleFromRoute(path);
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
