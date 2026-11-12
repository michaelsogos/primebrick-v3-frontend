/**
 * mt-worker.ts — POC dedicated seq2seq MT worker (Xenova/m2m100_418M).
 *
 * OFF-STANDARD BY DESIGN (POC): model id, per-component dtype and the
 * message protocol are hardcoded — no ai_models row, no cerebellum, no
 * engine abstraction. If the POC proves the quality, this graduates to
 * the canonical path (cerebellum + ai_models + first-class transformers.js
 * translation pipeline). See ai-plans/translation-editor-sheet-redesign.md.
 *
 * Protocol (POC-minimal):
 *   → {type:'load'}                                  warm the pipeline
 *   ← {type:'progress', file, progress}              download progress (0..100)
 *   ← {type:'ready', device}                         'webgpu' | 'wasm'
 *   ← {type:'warn', message}                         non-fatal (webgpu→wasm retry)
 *   → {type:'translate', seq, text, src_lang, tgt_lang}
 *   ← {type:'result', seq, text}                     translation_text
 *   → {type:'unload'}                                dispose the pipeline
 *   ← {type:'error', seq?, message}                  any failure
 *
 * m2m100 lang codes are plain ISO ('en', 'it', 'fr', 'de', 'es', 'pt') —
 * the pipeline validates them against the model's language_codes.
 */
import {
  pipeline,
  type ProgressInfo,
  type TranslationPipeline,
} from '@primebrick/ui/vendor/transformers';

const MODEL_ID = 'Xenova/m2m100_418M';
/** Per-component dtype — seq2seq wants encoder + merged-decoder flavors. */
const DTYPE = {
  encoder_model: 'q4f16',
  decoder_model_merged: 'q4f16',
} as const;

let translator: TranslationPipeline | null = null;
let device_used = '';

function post(message: Record<string, unknown>): void {
  self.postMessage(message);
}

async function loadPipeline(device: 'webgpu' | 'wasm'): Promise<void> {
  translator = await pipeline('translation', MODEL_ID, {
    dtype: DTYPE,
    device,
    progress_callback: (p: ProgressInfo) => {
      if (p.status === 'progress') {
        post({ type: 'progress', file: p.file, progress: p.progress });
      }
    },
  });
  device_used = device;
}

type InMsg =
  | { type: 'load'; device?: 'webgpu' | 'wasm' }
  | { type: 'translate'; seq: number; text: string; src_lang: string; tgt_lang: string }
  | { type: 'unload' };

self.addEventListener('message', async (event: MessageEvent<InMsg>) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case 'load': {
        // POC pinned to WASM: seq2seq decoders on WebGPU empirically corrupt
        // short outputs (same bug family as upstream NLLB issue #1286 — node
        // probe: 'private'→'privato' on CPU vs 'priv' observed on WebGPU).
        // UI labels are a few words — wasm latency is a non-issue.
        const device = msg.device ?? 'wasm';
        await loadPipeline(device);
        post({ type: 'ready', device: device_used });
        break;
      }
      case 'translate': {
        if (!translator) throw new Error('MT model not loaded');
        const out = await translator(msg.text, {
          src_lang: msg.src_lang,
          tgt_lang: msg.tgt_lang,
        });
        post({ type: 'result', seq: msg.seq, text: out[0]?.translation_text ?? '' });
        break;
      }
      case 'unload': {
        await translator?.dispose();
        translator = null;
        post({ type: 'unloaded' });
        break;
      }
    }
  } catch (err) {
    post({
      type: 'error',
      seq: msg.type === 'translate' ? msg.seq : undefined,
      message: err instanceof Error ? err.message : String(err),
    });
  }
});
