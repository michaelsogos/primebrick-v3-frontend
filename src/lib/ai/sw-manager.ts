/**
 * SW manager for the SmartRegexInput AI model cache.
 *
 * The Service Worker layer is RETIRED: Transformers.js already caches model
 * files via the Cache API (env.useBrowserCache → 'transformers-cache'), and
 * the old SW ('transformers-models-v1') duplicated every downloaded byte.
 *
 * registerRegexAiSw() now performs a one-time cleanup: it unregisters any
 * existing /sw-regex-ai.js registration and deletes the redundant SW-owned
 * stores. The updated sw-regex-ai.js also self-cleans on activate, so
 * clients that still run the old SW converge on the next navigation.
 */

const SW_PATH = '/sw-regex-ai.js';
const SW_OWNED_CACHE_PREFIXES = ['transformers-models-', 'webllm-models-'];

let sw_cleaned = false;

/**
 * Unregister the legacy model-cache service worker and delete its stores.
 * Called on app load. Safe to call multiple times — only runs once.
 */
export async function registerRegexAiSw(): Promise<void> {
  if (sw_cleaned) return;
  if (typeof navigator === 'undefined' || typeof caches === 'undefined') return;
  sw_cleaned = true;

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs
          .filter((reg) => reg.active?.scriptURL.endsWith(SW_PATH))
          .map((reg) => reg.unregister()),
      );
    }
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => SW_OWNED_CACHE_PREFIXES.some((p) => name.startsWith(p)))
        .map((name) => caches.delete(name)),
    );
  } catch {
    // Cleanup failure is non-fatal — Transformers.js caching works regardless.
  }
}

/**
 * Check if a specific Transformers.js model is already cached in the browser.
 * Scans the Cache API for entries matching the model_id.
 */
export async function isModelCached(model_id: string): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      if (!name.includes('transformers') && !name.includes('onnx') && !name.includes('hf')) {
        continue;
      }
      const cache = await caches.open(name);
      const keys = await cache.keys();
      for (const req of keys) {
        if (req.url.includes(model_id.split('#')[0])) {
          return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}
