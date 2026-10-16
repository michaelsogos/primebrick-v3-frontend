/**
 * SW manager for the SmartRegexInput AI model cache.
 *
 * Registers the service worker on app load. The SW intercepts
 * huggingface.co fetches and caches them via the Cache API
 * (cache-first strategy) for faster re-downloads.
 *
 * Model weights are cached by WebLLM's internal mechanism (IndexedDB)
 * and by the Service Worker (Cache API for huggingface.co responses).
 * Cache cleanup is handled by the `useModelCache` composable.
 */

const SW_PATH = '/sw-regex-ai.js';

let sw_registered = false;

/**
 * Register the SmartRegexInput service worker.
 * Called on app load to enable cache-first HTTP interception for model files.
 * Safe to call multiple times — only registers once.
 */
export async function registerRegexAiSw(): Promise<void> {
  if (sw_registered) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  try {
    await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
    sw_registered = true;
  } catch {
    // SW registration failure is non-fatal — WebLLM will still work,
    // just without the cache-first HTTP interception.
    sw_registered = false;
  }
}

/**
 * Check if a specific WebLLM model is already cached in the browser (IndexedDB).
 *
 * Returns true if the model is cached and ready for instant loading.
 */
export async function isModelCached(model_id: string): Promise<boolean> {
  try {
    const webllm = await import('@mlc-ai/web-llm');
    return await webllm.hasModelInCache(model_id);
  } catch {
    return false;
  }
}
