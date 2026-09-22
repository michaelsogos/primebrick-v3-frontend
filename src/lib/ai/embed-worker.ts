/**
 * embed-worker.ts — Web Worker for query embeddings (feature-extraction).
 *
 * Separate from ai-worker.ts: the chat model owns WebGPU, this worker runs
 * the embedding model on WASM/CPU — no VRAM contention. Model MUST match
 * the ingestion embedder used by the ai microservice pipeline
 * (Xenova/all-MiniLM-L6-v2, 384-dim, mean-pooled, normalized) — a different
 * model would produce vectors in an incompatible space.
 *
 * Protocol:
 *   → { type: 'embed', seq, text }
 *   ← { type: 'embed_ready' }                      (after first load)
 *   ← { type: 'embed_result', seq, embedding }     (number[])
 *   ← { type: 'embed_error', seq, error }
 */
import { env, pipeline } from '@huggingface/transformers';
import { resumableFetch } from './resumable-fetch';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.fetch = resumableFetch; // sharded, Range-resumable downloads (see resumable-fetch.ts)

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

let extractor: any = null;
let loading: Promise<any> | null = null;

async function getExtractor() {
  if (extractor) return extractor;
  if (!loading) {
    loading = pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8',
      device: 'wasm',
    }).then((p) => {
      extractor = p;
      return p;
    });
  }
  return loading;
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (!msg || msg.type !== 'embed') return;

  try {
    const ext = await getExtractor();
    const out = await ext(msg.text, { pooling: 'mean', normalize: true });
    // out.data is a Float32Array of length 384 — copy to a plain array for
    // structured-clone transfer.
    const embedding = Array.from(out.data as Float32Array);
    (self as any).postMessage({ type: 'embed_result', seq: msg.seq, embedding });
  } catch (err) {
    (self as any).postMessage({
      type: 'embed_error',
      seq: msg.seq,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

// Warm the pipeline in the background as soon as the worker boots — the first
// user question then skips model download/compile latency.
void getExtractor().then(() => {
  (self as any).postMessage({ type: 'embed_ready' });
});
