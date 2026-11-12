/**
 * mt-translator.ts — POC lifecycle module for the dedicated MT worker
 * (`mt-worker.ts`, Xenova/m2m100_418M).
 *
 * OFF-STANDARD BY DESIGN (POC): a module-level singleton — the worker and
 * its loaded pipeline live for the page lifetime so reopening the sheet
 * reuses the warm model. Graduates to the canonical composable/cerebellum
 * path if the POC proves out.
 *
 * Same-language pairs short-circuit to a verbatim copy (en-GB↔en-US) —
 * identical to the browser-Translator contract.
 */
import MtWorker from './mt-worker.ts?worker';
import { toMtLang } from './browser-translator';

export type MtStatus = 'idle' | 'loading' | 'ready' | 'error';

type OutMsg =
  | { type: 'progress'; file: string; progress: number }
  | { type: 'ready'; device: 'webgpu' | 'wasm' }
  | { type: 'warn'; message: string }
  | { type: 'result'; seq: number; text: string }
  | { type: 'error'; seq?: number; message: string }
  | { type: 'unloaded' };

let worker: Worker | null = null;
let status: MtStatus = 'idle';
let device = '';
let seq = 0;
let loadPromise: Promise<void> | null = null;
let progressCb: ((fraction: number, file: string) => void) | null = null;
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>();
const listeners = new Set<(s: MtStatus) => void>();

/** The powered engine can always attempt a run — ONNX/WASM is the floor. */
export function mtSupported(): boolean {
  return typeof Worker !== 'undefined';
}
export function mtStatus(): MtStatus {
  return status;
}
/** Which backend the loaded pipeline runs on ('' until ready). */
export function mtDevice(): string {
  return device;
}
export function onMtStatus(cb: (s: MtStatus) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function setStatus(s: MtStatus): void {
  status = s;
  for (const cb of listeners) cb(s);
}

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new MtWorker();
  worker.onmessage = (e: MessageEvent<OutMsg>) => {
    const msg = e.data;
    switch (msg.type) {
      case 'progress':
        progressCb?.(Math.min(1, msg.progress / 100), msg.file);
        break;
      case 'ready':
        device = msg.device;
        setStatus('ready');
        break;
      case 'warn':
        console.warn('[mt-worker]', msg.message);
        break;
      case 'result': {
        const p = pending.get(msg.seq);
        if (p) {
          pending.delete(msg.seq);
          p.resolve(msg.text);
        }
        break;
      }
      case 'error':
        if (msg.seq != null && pending.has(msg.seq)) {
          pending.get(msg.seq)!.reject(new Error(msg.message));
          pending.delete(msg.seq);
        } else {
          setStatus('error');
          console.error('[mt-worker]', msg.message);
        }
        break;
      case 'unloaded':
        setStatus('idle');
        device = '';
        break;
    }
  };
  return worker;
}

/**
 * Warm the pipeline. Progress is per-file (0..1 fraction + file name) —
 * transformers.js reports each ONNX member independently.
 */
export function mtEnsureLoaded(
  onProgress?: (fraction: number, file: string) => void,
): Promise<void> {
  if (status === 'ready') return Promise.resolve();
  if (loadPromise) {
    progressCb = onProgress ?? progressCb;
    return loadPromise;
  }
  const w = ensureWorker();
  progressCb = onProgress ?? null;
  setStatus('loading');
  loadPromise = new Promise<void>((resolve, reject) => {
    const unsub = onMtStatus((s) => {
      if (s === 'ready') {
        unsub();
        loadPromise = null;
        resolve();
      } else if (s === 'error') {
        unsub();
        loadPromise = null;
        reject(new Error('MT model load failed'));
      }
    });
  });
  w.postMessage({ type: 'load' });
  return loadPromise;
}

/**
 * Translate `text` from `src_tag` to `tgt_tag` (UiLang tags — normalized
 * to m2m100 ISO codes internally). Loads the model on first use.
 */
export async function translateMt(
  text: string,
  src_tag: string,
  tgt_tag: string,
  onProgress?: (fraction: number, file: string) => void,
): Promise<string> {
  const src_lang = toMtLang(src_tag);
  const tgt_lang = toMtLang(tgt_tag);
  if (!text.trim() || src_lang === tgt_lang) return text;
  await mtEnsureLoaded(onProgress);
  progressCb = onProgress ?? null;
  const w = ensureWorker();
  const id = ++seq;
  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ type: 'translate', seq: id, text, src_lang, tgt_lang });
  });
}
