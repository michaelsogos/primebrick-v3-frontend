/**
 * SW manager for the SmartRegexInput AI model pre-download.
 *
 * Registers the service worker on app load and provides utilities for
 * checking if the WebLLM model is already cached in the browser.
 *
 * The model itself is cached by WebLLM's internal mechanism (IndexedDB/Cache API)
 * and by our Service Worker (Cache API for huggingface.co responses).
 * Both work together: the SW caches the HTTP responses, and WebLLM caches
 * the parsed model weights in IndexedDB for fast loading.
 */

const SW_PATH = '/sw-regex-ai.js';
const MODEL_ID = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';

let sw_registered = false;

/**
 * Register the SmartRegexInput service worker.
 * Called on app load to enable background model caching.
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
    // just without the background pre-download caching.
    sw_registered = false;
  }
}

/**
 * Check if the WebLLM model is already cached in the browser.
 * Uses WebLLM's built-in cache check (IndexedDB).
 *
 * Returns true if the model is cached and ready for instant loading.
 */
export async function isModelCached(): Promise<boolean> {
  try {
    const webllm = await import('@mlc-ai/web-llm');
    return await webllm.hasModelInCache(MODEL_ID);
  } catch {
    return false;
  }
}

/**
 * Get the model ID used by the SmartRegexInput AI assistant.
 */
export function getModelId(): string {
  return MODEL_ID;
}
