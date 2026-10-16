/**
 * ai-worker.ts — Web Worker for Transformers.js model loading + inference.
 *
 * Single text-generation pipeline path. The `kv_cache_reuse` flag (from BE
 * execution_config) decides whether a DynamicCache is created and passed as
 * `past_key_values`:
 *   - kv_cache_reuse=true  — KV cache reuse across turns (empirically verified
 *                            per model; unsafe ONNX exports crash on multi-token
 *                            prefill with cache, so they run with false).
 *   - kv_cache_reuse=false — full re-prefill every turn; no cache object is ever
 *                            created and no past_key_values reaches generate().
 *
 * Runs entirely off the main thread. WebGPU-only (no WASM/CPU fallback).
 */
import {
  env,
  TextStreamer,
  InterruptableStoppingCriteria,
  pipeline,
  DynamicCache,
} from '@huggingface/transformers';
import { resumableFetch, setByteReporter } from './resumable-fetch';

// ─── TEMP: WebGPU kernel profiling instrumentation ───────────────────────
// Collects per-kernel GPU execution time via onnxruntime-web's
// env.webgpu.profiling.ondata. Aggregated per generation and posted with
// 'profile_stats' at stream end — used to attribute decode latency between
// GPU kernel time and JS/dispatch/logits overhead. TEMPORARY (speed probe).
const prof = {
  kernels: 0,
  total_ns: 0,
  kernelRuns: 0,
  fwd_calls: 0,
  fwd_ms: 0,
  top: new Map<string, { n: number; ns: number }>(),
};
function profReset() {
  prof.kernels = 0;
  prof.total_ns = 0;
  prof.kernelRuns = 0;
  prof.fwd_calls = 0;
  prof.fwd_ms = 0;
  prof.top.clear();
}
let profInstalled = false;
function profInstall(): boolean {
  if (profInstalled) return true;
  try {
    const ortEnv = (env as unknown as { backends?: { onnx?: { webgpu?: { profiling?: unknown } } } }).backends?.onnx;
    if (ortEnv?.webgpu) {
      ortEnv.webgpu.profiling = {
        mode: 'default',
        ondata: (d: { kernelName?: string; programName?: string; startTime?: number; endTime?: number }) => {
          const dt = (d.endTime ?? 0) - (d.startTime ?? 0);
          prof.kernels++;
          prof.total_ns += dt;
          const k = `${d.kernelName ?? '?'}|${d.programName ?? '?'}`;
          const e = prof.top.get(k) ?? { n: 0, ns: 0 };
          e.n++;
          e.ns += dt;
          prof.top.set(k, e);
        },
      };
      profInstalled = true;
    } else {
      post({ type: 'debug', step: 'prof_env', keys: ortEnv ? Object.keys(ortEnv) : null });
    }
  } catch (e) { post({ type: 'debug', step: 'prof_env', err: String(e) }); }
  return profInstalled;
}

// ─── Types ───────────────────────────────────────────────────────────────

type Role = 'system' | 'user' | 'assistant' | 'tool';
interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
}

type DType = 'auto' | 'fp32' | 'fp16' | 'q8' | 'int8' | 'uint8' | 'q4' | 'q4f16' | 'bnb4' | 'q2' | 'q2f16' | 'q1' | 'q1f16';

interface GenerateParams {
  max_new_tokens: number;
  temperature: number;
  top_p: number;
  repetition_penalty: number;
  do_sample?: boolean;
  enable_thinking?: boolean;
  /** Agentic loop: tool schemas forwarded to the chat template. */
  tools?: unknown[];
}

interface LoadPayload {
  model_id: string;
  dtype: string;
  device?: string;
  kv_cache_reuse?: boolean;
  /** ORT session options from cerebellum execution_config.ort_session_options
   *  (snake_case keys → camelized before hitting InferenceSession.create). */
  session_options?: Record<string, unknown>;
  /** env.wasm.numThreads override — pthread workers share the wasm heap and
   *  are a known source of `table index is out of bounds` traps on big
   *  prefills; forcing 1 removes the concurrent-allocator path entirely. */
  wasm_num_threads?: number;
}

interface GeneratePayload {
  messages: ChatMessage[];
  params: GenerateParams;
}

interface MeasurementData {
  model_id: string;
  dtype: string;
  load_time_ms: number;
  warmup_time_ms: number;
  generation_time_ms: number;
  tokens_generated: number;
  tokens_per_second: number;
  first_token_latency_ms: number;
  kv_cache_speedup: number | null;
  kv_cache_hit_tokens: number;
  kv_cache_miss_tokens: number;
  kv_cache_hit_ratio: number;
  kv_cache_seq_length: number;
  prompt_token_count: number;
  cache_bytes: number | null;
  memory_usage_bytes: number | null;
  vram_bytes: number | null;
}

// ─── State ──────────────────────────────────────────────────────────────

const worker_nonce: string = crypto.randomUUID();

let current_model_id: string | null = null;
let current_dtype: string | null = null;
let current_device: string = 'webgpu';
let current_kv_cache_reuse: boolean = false;
let tokenizer: any = null;
let model: any = null;
let pipeline_generator: any = null;
let is_generating = false;
let current_stopping: any = null;
let load_seq = 0;
let load_in_flight = false;
let loaded_files: string[] = [];
let file_progress: Record<string, number> = {};
let total_files = 0;
let completed_files = 0;
// Cumulative live-network bytes for the download speed meter — reset per
// load; reported throttled (~4 msg/s) via `download_bytes` messages.
let net_bytes = 0;
let last_byte_tick = 0;

let past_key_values: DynamicCache | null = null;
let cache_valid = false;
// The rendered prompt the live DynamicCache was built on. KV reuse is only
// sound for strict append-only continuations (agent tool-loop rounds append
// assistant/tool messages to the SAME trajectory). Any other divergence —
// different stage, system prompt, or tool set — must reset the cache:
// transformers.js blind-prefix slicing decodes the new prompt against a
// mismatched prefix, which produces progressive token-soup corruption and
// unbounded cache growth.
let last_prompt: string | null = null;
// Divergence-swapped caches awaiting a safe dispose point.
const retired_caches: DynamicCache[] = [];
let cache_len_before_gen = 0;
let prev_gen_time_ms: number | null = null;

// ─── VRAM tracking ──────────────────────────────────────────────────────
// WebGPU exposes no VRAM-usage API, but every tensor ONNX Runtime allocates
// lives in a GPUBuffer. Wrapping createBuffer/destroy gives the REAL model
// VRAM footprint — live allocated bytes attributed to this worker.
let vram_tracked_bytes = 0;
let vram_tracking_installed = false;

function installVramTracking(): void {
  if (vram_tracking_installed) return;
  const GPUDeviceCtor = (self as any).GPUDevice;
  const GPUBufferCtor = (self as any).GPUBuffer;
  if (!GPUDeviceCtor?.prototype?.createBuffer || !GPUBufferCtor?.prototype?.destroy) return;
  const sizes = new WeakMap<GPUBuffer, number>();
  const origCreate = GPUDeviceCtor.prototype.createBuffer;
  GPUDeviceCtor.prototype.createBuffer = function (this: GPUDevice, desc: GPUBufferDescriptor) {
    const buf = origCreate.call(this, desc);
    const size = Number(desc.size) || 0;
    sizes.set(buf, size);
    vram_tracked_bytes += size;
    return buf;
  };
  const origDestroy = GPUBufferCtor.prototype.destroy;
  GPUBufferCtor.prototype.destroy = function (this: GPUBuffer) {
    const size = sizes.get(this);
    if (size != null) {
      sizes.delete(this);
      vram_tracked_bytes = Math.max(0, vram_tracked_bytes - size);
    }
    return origDestroy.call(this);
  };
  vram_tracking_installed = true;
}

const STOP_STRINGS = ['[END_OF_TEXT]', '<|im_end|>', '<|im_start|>'];

// ─── Helpers ────────────────────────────────────────────────────────────

function post(message: Record<string, any>): void {
  self.postMessage(message);
}

/** Dtype → ONNX file suffix, mirroring transformers.js DEFAULT_DTYPE_SUFFIX_MAPPING. */
const DTYPE_SUFFIX: Record<string, string> = {
  fp32: '',
  fp16: '_fp16',
  int8: '_int8',
  uint8: '_uint8',
  q8: '_quantized',
  q4: '_q4',
  q2: '_q2',
  q1: '_q1',
  q4f16: '_q4f16',
  q2f16: '_q2f16',
  q1f16: '_q1f16',
  bnb4: '_bnb4',
};

interface RepoFiles {
  external_data: Record<string, number> | null;
  /** Base name for the `model` session when the default `model{suffix}.onnx`
   *  is absent — legacy repos ship `decoder_model_merged{suffix}.onnx`
   *  (e.g. openai-community/gpt2 fp32). Passed as `model_file_name`. */
  model_file_name: string | null;
}

async function inspectRepoFiles(repo_id: string, dtype: string): Promise<RepoFiles> {
  const empty: RepoFiles = { external_data: null, model_file_name: null };
  try {
    const res = await fetch(`https://huggingface.co/api/models/${repo_id}`);
    if (!res.ok) return empty;
    const { siblings } = (await res.json()) as { siblings?: { rfilename: string }[] };
    const names = new Set((siblings ?? []).map((f) => f.rfilename));
    const map: Record<string, number> = {};
    for (const name of names) {
      const m = /^onnx\/(.+\.onnx)_data(?:_\d+)?$/.exec(name);
      if (m) map[m[1]] = (map[m[1]] ?? 0) + 1;
    }
    const suffix = DTYPE_SUFFIX[dtype] ?? '';
    let model_file_name: string | null = null;
    if (!names.has(`onnx/model${suffix}.onnx`)) {
      for (const base of ['decoder_model_merged', 'decoder_model']) {
        if (names.has(`onnx/${base}${suffix}.onnx`)) {
          model_file_name = base;
          break;
        }
      }
    }
    return { external_data: Object.keys(map).length > 0 ? map : null, model_file_name };
  } catch {
    return empty;
  }
}

// ─── WebGPU check ───────────────────────────────────────────────────────

async function checkWebGpu(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false;
  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

// ─── Model loading ──────────────────────────────────────────────────────

async function loadModel(payload: LoadPayload): Promise<void> {
  const { model_id, dtype } = payload;
  const repo_id = model_id.split('#')[0];
  const device = payload.device ?? 'webgpu';
  const kv_cache_reuse = payload.kv_cache_reuse ?? false;
  const seq = ++load_seq;

  if (load_in_flight) {
    post({ type: 'load_error', model_id, seq, worker_nonce, error: 'load_in_progress' });
    return;
  }

  post({ type: 'load_started', seq, model_id, repo_id, dtype, device, worker_nonce });

  // Fast path: same model already loaded
  if (current_model_id === model_id && (pipeline_generator || model)) {
    current_kv_cache_reuse = kv_cache_reuse;
    post({ type: 'load_complete', seq, model_id, repo_id, dtype: current_dtype, device: current_device, cached: true, worker_nonce });
    return;
  }

  // Switching models — dispose old one first
  if (current_model_id && current_model_id !== model_id) {
    await disposeModel();
    post({ type: 'debug', step: 'dispose_wait_start' });
    await new Promise((r) => setTimeout(r, 3000));
    post({ type: 'debug', step: 'dispose_wait_done' });
  }

  load_in_flight = true;
  loaded_files = [];
  file_progress = {};
  total_files = 0;
  completed_files = 0;
  net_bytes = 0;
  last_byte_tick = 0;
  const loadStart = performance.now();

  try {
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    // WASM thread pool cap from cerebellum — must be set BEFORE the ONNX
    // session is created (the thread pool spawns at session init).
    const onnxEnv = (env as unknown as { backends?: { onnx?: { wasm?: { numThreads?: number } } } }).backends?.onnx;
    if (onnxEnv?.wasm && typeof payload.wasm_num_threads === 'number' && payload.wasm_num_threads > 0) {
      onnxEnv.wasm.numThreads = Math.floor(payload.wasm_num_threads);
    }
    const sessionOptions =
      payload.session_options && typeof payload.session_options === 'object'
        ? Object.fromEntries(
            Object.entries(payload.session_options).map(([k, v]) => [
              k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
              v,
            ]),
          )
        : undefined;
    // Install GPUBuffer tracking BEFORE the ONNX session allocates weights —
    // the captured byte total at load_complete is the model's real VRAM size.
    installVramTracking();
    // Resumable downloads: env.fetch is the documented hook (env.js) used by
    // getFile for every remote file. Our wrapper persists 64MB shards to the
    // 'hf-resumable' cache while streaming and resumes interrupted downloads
    // via HTTP Range — transformers sees a plain 200 response.
    env.fetch = resumableFetch;
    // Report cumulative live-network bytes ~4×/s for the speed meter —
    // cache-replayed shards are not counted (see resumable-fetch.ts).
    setByteReporter((n) => {
      net_bytes += n;
      const now = performance.now();
      if (now - last_byte_tick >= 250) {
        last_byte_tick = now;
        post({ type: 'download_bytes', bytes: net_bytes });
      }
    });

    const { external_data, model_file_name } = await inspectRepoFiles(repo_id, dtype);
    post({ type: 'load_phase', phase: 'downloading', worker_nonce });

    let download_complete_notified = false;
    const completed_file_set = new Set<string>();
    const progress_callback = (p: any) => {
      const file = typeof p?.file === 'string' ? p.file : null;
      if (file && (file.endsWith('.onnx') || file.includes('.onnx_data')) && !loaded_files.includes(file)) {
        loaded_files.push(file);
      }
      if (p.status === 'initiate' && file) {
        if (!(file in file_progress)) {
          total_files += 1;
          file_progress[file] = 0;
        }
        post({ type: 'load_progress', stage: 'initiate', file, total_files, completed_files, file_progress: { ...file_progress } });
      } else if (p.status === 'progress' && typeof p.progress === 'number' && file) {
        file_progress[file] = Math.min(100, Math.max(file_progress[file] ?? 0, p.progress));
        post({ type: 'load_progress', progress: p.progress, file, total_files, completed_files, file_progress: { ...file_progress } });
      } else if (p.status === 'done' && file) {
        file_progress[file] = 100;
        if (!completed_file_set.has(file)) {
          completed_file_set.add(file);
          completed_files += 1;
        }
        post({ type: 'load_progress', stage: 'done', file, total_files, completed_files, file_progress: { ...file_progress } });
        // All files downloaded → switch to VRAM phase immediately.
        // pipeline()/from_pretrained() is still running (creating ONNX session),
        // but the download is done. The UI must show the VRAM loading frame
        // during this gap, not a frozen 100% download bar.
        if (!download_complete_notified && total_files > 0 && completed_files >= total_files) {
          download_complete_notified = true;
          // Final byte count — the last chunks may have fallen under the
          // 250ms throttle, so flush the total before switching phase.
          post({ type: 'download_bytes', bytes: net_bytes });
          post({ type: 'load_phase', phase: 'vram', worker_nonce });
        }
      }
    };

    const load_kwargs = {
      dtype: dtype as any,
      device: device as any,
      ...(external_data ? { use_external_data_format: external_data } : {}),
      ...(model_file_name ? { model_file_name } : {}),
      ...(sessionOptions ? { session_options: sessionOptions } : {}),
      progress_callback,
    };

    const pl = pipeline('text-generation', repo_id, load_kwargs);
    // TEMP: install WebGPU kernel profiling as soon as initONNX populates
    // env.backends.onnx — must be set BEFORE the session is created or the
    // backend's queryType is already baked to "none".
    const profPoll = setInterval(() => {
      if (profInstall()) clearInterval(profPoll);
    }, 5);
    pipeline_generator = await pl;
    clearInterval(profPoll);
    // TEMP: wrap model.forward — total GPU session time per decode step
    // (ORT run + logits materialization). gen_wall - fwd = JS/dispatch cost.
    const mdl: any = pipeline_generator?.model;
    if (mdl?.forward && !mdl.__fwd_wrapped) {
      const orig = mdl.forward.bind(mdl);
      mdl.forward = async (...args: any[]) => {
        const t0 = performance.now();
        try {
          return await orig(...args);
        } finally {
          prof.fwd_calls++;
          prof.fwd_ms += performance.now() - t0;
        }
      };
      mdl.__fwd_wrapped = true;
    }
    tokenizer = pipeline_generator.tokenizer;
    model = pipeline_generator.model;

    if (seq !== load_seq) {
      try {
        await model?.dispose?.();
        await pipeline_generator?.dispose?.();
      } catch { /* noop */ }
      model = null;
      pipeline_generator = null;
      return;
    }

    current_model_id = model_id;
    current_dtype = dtype;
    current_device = device;
    current_kv_cache_reuse = kv_cache_reuse;
    const loadTime = performance.now() - loadStart;

    post({ type: 'load_phase', phase: 'vram', worker_nonce });

    // Warmup + fingerprint probe
    const warmupStart = performance.now();
    let fingerprint = '';
    try {
      if (kv_cache_reuse) {
        const out = await pipeline_generator('The capital of France is', {
          max_new_tokens: 6,
          do_sample: false,
        });
        fingerprint = String(Array.isArray(out) ? out[0]?.generated_text ?? '' : out ?? '').slice(0, 200);
      } else {
        // No-cache models: SKIP warmup. The warmup calls model.generate()
        // which populates internal ORT session state. The subsequent real
        // generation with a different prompt length crashes the ONNX Expand
        // node (attention mask shape mismatch: warmup M×M vs real M×N where
        // M≠N). The fingerprint is not worth the crash risk.
        fingerprint = 'SKIPPED (no-cache model)';
      }
    } catch (e) {
      fingerprint = `PROBE_FAILED: ${e instanceof Error ? e.message : String(e)}`;
    }
    const warmupTime = performance.now() - warmupStart;

    // After warmup, invalidate any residual cache.
    if (!kv_cache_reuse) {
      past_key_values = null;
      cache_valid = false;
    }

    const cfg = model?.config ?? {};
    post({
      type: 'load_complete',
      seq,
      model_id,
      repo_id,
      dtype,
      device,
      worker_nonce,
      files: loaded_files,
      external_data_files: external_data ? Object.keys(external_data) : [],
      model_config: {
        architectures: cfg.architectures ?? null,
        model_type: cfg.model_type ?? null,
        hidden_size: cfg.hidden_size ?? null,
        num_hidden_layers: cfg.num_hidden_layers ?? null,
        vocab_size: cfg.vocab_size ?? null,
        max_position_embeddings: cfg.max_position_embeddings ?? null,
      },
      fingerprint,
      warmup_ms: Math.round(warmupTime),
      vram_bytes: vram_tracked_bytes || null,
    });
    post({
      type: 'measure',
      data: {
        model_id,
        dtype,
        load_time_ms: Math.round(loadTime),
        warmup_time_ms: Math.round(warmupTime),
        generation_time_ms: 0,
        tokens_generated: 0,
        tokens_per_second: 0,
        first_token_latency_ms: 0,
        kv_cache_speedup: null,
        kv_cache_hit_tokens: 0,
        kv_cache_miss_tokens: 0,
        kv_cache_hit_ratio: 0,
        kv_cache_seq_length: 0,
        prompt_token_count: 0,
        cache_bytes: await measureCacheBytes(),
        memory_usage_bytes: await measureMemoryBytes(),
        vram_bytes: vram_tracked_bytes || null,
      },
    });
  } catch (err) {
    if (seq === load_seq) {
      current_model_id = null;
      current_dtype = null;
      model = null;
      tokenizer = null;
      pipeline_generator = null;
    }
    post({ type: 'load_error', seq, model_id, worker_nonce, error: err instanceof Error ? err.message : String(err) });
  } finally {
    load_in_flight = false;
  }
}

// ─── Generation ─────────────────────────────────────────────────────────

async function generate(payload: GeneratePayload): Promise<void> {
  const has_model = !!model && !!pipeline_generator;
  if (!has_model || !tokenizer) {
    post({ type: 'stream_error', model_id: current_model_id, error: 'Model not loaded' });
    post({ type: 'generation_idle' });
    return;
  }
  if (is_generating) {
    post({ type: 'stream_error', model_id: current_model_id, error: 'Already generating' });
    return;
  }

  is_generating = true;
  const genStart = performance.now();
  let firstTokenTime = 0;
  let tokenCount = 0;
  let fullText = '';

  post({ type: 'debug', step: 'gen_enter', model_id: current_model_id, kv_cache_reuse: current_kv_cache_reuse, num_messages: payload.messages?.length });

  try {
    // Qwen3 dialect: enable_thinking=false only renders an empty
    // <think></think> block — this export ignores it and opens a fresh
    // <think> anyway. The /no_think directive in the last user message is
    // the documented suppression for hybrid-thinking Qwen3 checkpoints.
    //
    // KV-reuse alignment: transformers.js slices the new input_ids purely by
    // LENGTH (decoder_prepare_inputs_for_generation case 2/3 — no token-id
    // comparison). Everything the cache absorbed must re-render byte-identical:
    //   - /no_think belongs on EVERY user message, not just the last — the
    //     previous turn's user message carried it when its KV was written;
    //   - the empty <think></think> generation-tail block must NOT be
    //     injected: history assistant messages re-render without it (the
    //     Qwen3 template strips think from non-last messages), so the cache
    //     stream diverged by ~8 tokens per assistant boundary (observed:
    //     cache_len > prompt_len → positional misalignment → ỉ/+=
    //     /<tool_response> artifacts + double prefills). With suppress_tokens
    //     banning the think-tag ids, the tail is just 'assistant\n' — which
    //     is exactly what history re-renders.
    const noThink =
      payload.params.enable_thinking === false && /qwen3/i.test(current_model_id ?? '');
    const messages = noThink
      ? payload.messages.map((m) =>
          m.role === 'user'
            ? { ...m, content: m.content + '\n/no_think' }
            : m,
        )
      : payload.messages;

    // Render the chat template
    let prompt: string;
    try {
      prompt = tokenizer.apply_chat_template
        ? String(tokenizer.apply_chat_template(messages, {
            add_generation_prompt: true,
            tokenize: false,
            // noThink: omit enable_thinking so the template does NOT inject
            // the empty <think></think> tail — see KV-reuse note above.
            ...(noThink ? {} : { enable_thinking: payload.params.enable_thinking ?? false }),
            // Agentic loop: tool schemas are rendered by the chat template
            // itself (Qwen dialect — XML tool_call instructions in system).
            ...(payload.params.tools ? { tools: payload.params.tools } : {}),
          }))
        : messages.map((m) => `${m.role}: ${m.content}`).join('\n') + '\nassistant:';
    } catch {
      prompt = messages.map((m) => `${m.role}: ${m.content}`).join('\n') + '\nassistant:';
    }
    post({ type: 'debug', step: 'prompt_tail', len: prompt.length, tail: prompt.slice(-150), has_tools: prompt.includes('# Tools'), kv_cache_reuse: current_kv_cache_reuse });

    const cache_len_at_start = cache_valid && past_key_values
      ? past_key_values.get_seq_length()
      : 0;

    // Resolve stop ids
    const eos_ids = new Set<number>();
    if (typeof tokenizer.eos_token_id === 'number') eos_ids.add(tokenizer.eos_token_id);
    try {
      for (const special of ['<|im_end|>', '']) {
        const enc = Array.from(tokenizer.encode(special) ?? []);
        if (enc.length === 1) eos_ids.add(Number(enc[0]));
      }
    } catch { /* noop */ }

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('generation_timeout_90s')), 90_000),
    );
    const interruptable = new InterruptableStoppingCriteria();
    current_stopping = interruptable;

    // Shared streamer
    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text: string) => {
        if (firstTokenTime === 0) firstTokenTime = performance.now() - genStart;
        tokenCount += 1;
        fullText += text;
        post({ type: 'stream', token: text });
        if (STOP_STRINGS.some((s) => fullText.includes(s))) {
          interruptable.interrupt();
        }
      },
    });

    let full_token_count = 0;

    // ─── Unified pipeline generation ───────────────────────────────────
    // Single pipeline() path; `current_kv_cache_reuse` decides whether a
    // shared DynamicCache is created and passed as past_key_values.
    // The library handles input_ids slicing, attention_mask (full length),
    // and position_ids automatically via decoder_prepare_inputs_for_generation
    // and create_position_ids. See transformers.js 4.2.0 PR #1638.
    //
    // CRITICAL (no-cache models): past_key_values must be undefined — never
    // null/stale. If a residual DynamicCache reached model.generate(), the
    // ONNX Expand node crashes on multi-token prefill (LeftShape M×M vs
    // RightShape M×N where M≠N).
    if (current_kv_cache_reuse) {
      // The rendered prompt ends with the generation marker
      // ("<|im_start|>assistant\n..."), which the NEXT prompt replaces rather
      // than extends — comparing full strings would never match. Compare the
      // stem instead: everything up to the trailing assistant generation
      // prompt. Stem-equal means the entire message prefix is identical and
      // the library's own prefix-slicing handles the rest.
      const stemOf = (p: string): string => {
        const i = p.lastIndexOf('<|im_start|>assistant');
        return i === -1 ? p : p.slice(0, i);
      };
      const extends_last =
        !!last_prompt && prompt.length > last_prompt.length && prompt.startsWith(stemOf(last_prompt));
      if (!past_key_values || !extends_last) {
        // Swap without dispose(): releasing KV GPU buffers while OrtRun
        // work may still be queued poisons the WebGPU device ("Invalid
        // Buffer ... previous error"). Retire to a list disposed at the
        // next safe point (reset/dispose).
        if (past_key_values) retired_caches.push(past_key_values);
        past_key_values = new DynamicCache();
        cache_valid = false;
      }
    } else {
      past_key_values = null;
      cache_valid = false;
      last_prompt = null;
    }

    const cache_seq_len_before = past_key_values ? past_key_values.get_seq_length() : 0;

    // Tokenize for measurement only (the pipeline re-tokenizes internally)
    try {
      const tokenized = tokenizer(prompt, { add_special_tokens: false });
      full_token_count = tokenized.input_ids.dims.at(-1) ?? 0;
    } catch { /* keep 0 */ }

    const using_cache = current_kv_cache_reuse && cache_valid && cache_seq_len_before > 0;
    post({ type: 'debug', step: 'kv_cache_pipeline', prompt_token_count: full_token_count, cache_len_before_gen: cache_seq_len_before, using_cache });

    // Hard think-suppression for the Qwen3 dialect: neither the empty
    // <think></think> block nor /no_think are reliable on this ONNX export —
    // ban the think-tag token ids outright via the logits processor so the
    // model physically cannot open a thinking block.
    let suppress_tokens: number[] | undefined;
    if (noThink) {
      suppress_tokens = [];
      for (const s of ['<think>', '</think>']) {
        try {
          const enc = Array.from(tokenizer.encode(s) ?? []);
          if (enc.length === 1) suppress_tokens.push(Number(enc[0]));
        } catch { /* noop */ }
      }
      if (!suppress_tokens.length) suppress_tokens = undefined;
    }

    // Tokenizers without a chat_template (base models like GPT-2) cannot
    // take the messages array — the pipeline would call apply_chat_template
    // and throw. Feed them the rendered plain-text prompt instead.
    const pipeline_input = tokenizer.chat_template ? messages : prompt;
    profInstall();
    profReset();
    const result = await Promise.race([
      pipeline_generator(pipeline_input, {
        max_new_tokens: payload.params.max_new_tokens,
        do_sample: payload.params.do_sample ?? (payload.params.temperature > 0),
        temperature: payload.params.temperature,
        top_p: payload.params.top_p,
        repetition_penalty: payload.params.repetition_penalty,
        eos_token_id: [...eos_ids],
        suppress_tokens,
        // The pipeline re-renders the chat template internally — enable_thinking
        // must travel through tokenizer_kwargs or it is lost (default: thinking on).
        tokenizer_kwargs: {
          ...(noThink ? {} : { enable_thinking: payload.params.enable_thinking }),
          ...(payload.params.tools ? { tools: payload.params.tools } : {}),
        },
        stopping_criteria: interruptable,
        // Always pass past_key_values when kv_cache_reuse is enabled, even on T1
        // with an empty cache. The library's getPastKeyValues() mutates the
        // shared DynamicCache in-place via .update(), populating it. If we
        // pass `undefined` instead, the library creates a NEW internal cache
        // that is discarded — our cache never populates (vicious cycle).
        // `using_cache` only gates whether the cache is READ for slicing,
        // not whether it is PASSED for population.
        past_key_values: current_kv_cache_reuse ? past_key_values : undefined,
        streamer,
      }),
      timeout,
    ]);

    // Extract generated text from pipeline result. Only overwrite the
    // streamed accumulation when the pipeline returns non-empty content —
    // thinking models can yield an assistant message whose `content` is ''
    // while the streamer already collected reasoning + JSON.
    try {
      const genText = Array.isArray(result) ? result[0]?.generated_text : result?.generated_text;
      if (Array.isArray(genText)) {
        const lastMsg = genText[genText.length - 1];
        const content = lastMsg?.role === 'assistant' ? String(lastMsg.content ?? '') : String(genText ?? '');
        if (content) fullText = content;
      } else if (typeof genText === 'string' && genText) {
        fullText = genText;
      }
    } catch { /* keep streamed text */ }

    if (current_kv_cache_reuse) {
      // Update cache state from the shared DynamicCache object.
      // The pipeline mutates past_key_values in-place via DynamicCache.update().
      const cache_seq_len_after = past_key_values ? past_key_values.get_seq_length() : 0;
      cache_valid = cache_seq_len_after > 0;
      last_prompt = prompt;
      post({ type: 'debug', step: 'kv_cache_post_gen', cache_seq_len_before, cache_seq_len_after, cache_valid });
    }

    // Diagnose WHY generation stopped: budget, model EOS, our stop-string
    // interrupt, or timeout. The raw tail (pre-trim) reveals whether the model
    // closed its output cleanly or the text was sliced.
    post({
      type: 'debug',
      step: 'gen_done',
      streamer_interrupted: interruptable.interrupted,
      raw_tail: fullText.slice(-120),
      raw_text: fullText,
      raw_len: fullText.length,
      requested_max_new_tokens: payload.params.max_new_tokens,
      // Reasoning waste: chars emitted before the first structural token
      // (JSON start, tool name, or DONE). 0 = model went straight to output.
      reason_chars: (() => {
        const idx = [fullText.indexOf('{'), fullText.indexOf('docs_search'),
          fullText.indexOf('docs_fetch'), fullText.indexOf('list_routes'),
          fullText.indexOf('DONE')].filter((i) => i >= 0).sort((a, b) => a - b)[0];
        return idx === undefined ? fullText.length : idx;
      })(),
    });

    // Trim stop markers
    for (const s of STOP_STRINGS) {
      const idx = fullText.indexOf(s);
      if (idx !== -1) fullText = fullText.slice(0, idx);
    }
    fullText = fullText.trimEnd();

    // TEMP: post aggregated WebGPU kernel profiling for this generation.
    // gpu_ms = total kernel execution time; the gap vs wall time is
    // JS dispatch + logits download + sampling + framework overhead.
    const topKernels = [...prof.top.entries()]
      .sort((a, b) => b[1].ns - a[1].ns)
      .slice(0, 12)
      .map(([k, v]) => ({ kernel: k, runs: v.n, ms: Math.round(v.ns / 1e6 * 10) / 10 }));
    post({
      type: 'debug',
      step: 'profile_stats',
      kernels: prof.kernels,
      gpu_ms: Math.round(prof.total_ns / 1e6 * 10) / 10,
      fwd_calls: prof.fwd_calls,
      fwd_ms: Math.round(prof.fwd_ms * 10) / 10,
      top_kernels: topKernels,
    });

    const genTime = performance.now() - genStart;
    // tokenCount counts streamer callbacks, not tokens — TextStreamer batches.
    // Re-tokenize the final text for the true generated-token count.
    if (fullText) {
      try { tokenCount = tokenizer.encode(fullText).length; } catch { /* keep callback count */ }
    }
    const tps = tokenCount > 0 ? (tokenCount / genTime) * 1000 : 0;

    // Deterministic KV cache hit measurement
    const cache_hit_tokens = Math.min(cache_len_at_start, full_token_count);
    const cache_miss_tokens = Math.max(0, full_token_count - cache_hit_tokens);
    const cache_hit_ratio = full_token_count > 0
      ? Math.round((cache_hit_tokens / full_token_count) * 1000) / 1000
      : 0;

    cache_len_before_gen = past_key_values ? past_key_values.get_seq_length() : 0;

    post({ type: 'stream_complete', text: fullText, model_id: current_model_id, dtype: current_dtype });
    post({
      type: 'measure',
      data: {
        model_id: current_model_id ?? '',
        dtype: current_dtype ?? '',
        load_time_ms: 0,
        warmup_time_ms: 0,
        generation_time_ms: Math.round(genTime),
        tokens_generated: tokenCount,
        tokens_per_second: Math.round(tps * 10) / 10,
        first_token_latency_ms: Math.round(firstTokenTime),
        kv_cache_speedup: (cache_valid && prev_gen_time_ms && prev_gen_time_ms > 0)
          ? Math.round((prev_gen_time_ms / genTime) * 10) / 10
          : null,
        kv_cache_hit_tokens: cache_hit_tokens,
        kv_cache_miss_tokens: cache_miss_tokens,
        kv_cache_hit_ratio: cache_hit_ratio,
        kv_cache_seq_length: cache_len_before_gen,
        prompt_token_count: full_token_count,
        cache_bytes: await measureCacheBytes(),
        memory_usage_bytes: await measureMemoryBytes(),
        vram_bytes: vram_tracked_bytes || null,
      },
    });
    prev_gen_time_ms = genTime;
  } catch (err) {
    post({
      type: 'stream_error',
      model_id: current_model_id,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
    });
  } finally {
    current_stopping = null;
    is_generating = false;
    post({ type: 'generation_idle' });
  }
}

// ─── Interrupt ──────────────────────────────────────────────────────────

function interrupt(): void {
  current_stopping?.interrupt?.();
  post({ type: 'interrupted' });
}

// ─── Reset (clear KV cache + conversation) ──────────────────────────────

async function reset(): Promise<void> {
  if (past_key_values) {
    try {
      await past_key_values.dispose();
    } catch { /* noop */ }
    past_key_values = null;
  }
  while (retired_caches.length) {
    try {
      await retired_caches.pop()!.dispose();
    } catch { /* noop */ }
  }
  cache_valid = false;
  last_prompt = null;
  cache_len_before_gen = 0;
  prev_gen_time_ms = null;
  post({ type: 'reset_complete' });
}

// ─── Dispose ────────────────────────────────────────────────────────────

async function disposeModel(): Promise<void> {
  if (past_key_values) {
    try {
      await past_key_values.dispose();
    } catch { /* noop */ }
    past_key_values = null;
  }
  while (retired_caches.length) {
    try {
      await retired_caches.pop()!.dispose();
    } catch { /* noop */ }
  }
  cache_valid = false;
  last_prompt = null;
  cache_len_before_gen = 0;
  prev_gen_time_ms = null;

  const generator = pipeline_generator;
  const disposed = current_model_id;
  post({ type: 'debug', step: 'dispose_start', model_id: disposed, has_generator: !!generator });
  model = null;
  tokenizer = null;
  pipeline_generator = null;
  current_model_id = null;
  current_dtype = null;
  current_kv_cache_reuse = false;
  is_generating = false;
  try {
    await generator?.dispose?.();
    await model?.dispose?.();
    post({ type: 'debug', step: 'dispose_generator_done', model_id: disposed });
  } catch (e) {
    post({ type: 'debug', step: 'dispose_generator_error', model_id: disposed, error: String(e) });
  }

  post({ type: 'dispose_complete', disposed_model_id: disposed, worker_nonce });
}

// ─── Measurement helpers ────────────────────────────────────────────────

async function measureCacheBytes(): Promise<number | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cacheNames = await caches.keys();
    let total = 0;
    for (const name of cacheNames) {
      if (!name.includes('transformers') && !name.includes('onnx') && !name.includes('hf')) {
        continue;
      }
      const cache = await caches.open(name);
      const keys = await cache.keys();
      for (const req of keys) {
        const response = await cache.match(req);
        if (response) {
          const blob = await response.blob();
          total += blob.size;
        }
      }
    }
    return total;
  } catch {
    return null;
  }
}

async function measureMemoryBytes(): Promise<number | null> {
  try {
    if (typeof performance !== 'undefined' && 'measureUserAgentSpecificMemory' in performance) {
      const result = await (performance as any).measureUserAgentSpecificMemory();
      return result.bytes;
    }
  } catch {
    // Not available
  }
  return null;
}

// ─── Message handler ────────────────────────────────────────────────────

post({ type: 'boot', worker_nonce });

self.addEventListener('message', async (event: MessageEvent) => {
  const data = event.data;
  if (!data || typeof data.type !== 'string') return;

  switch (data.type) {
    case 'check': {
      const available = await checkWebGpu();
      post({ type: 'webgpu', available });
      break;
    }
    case 'load': {
      await loadModel(data as LoadPayload);
      break;
    }
    case 'generate': {
      await generate(data as GeneratePayload);
      break;
    }
    case 'interrupt': {
      interrupt();
      break;
    }
    case 'reset': {
      await reset();
      break;
    }
    case 'dispose': {
      await disposeModel();
      break;
    }
    case 'invalidate_cache': {
      cache_valid = false;
      last_prompt = null;
      cache_len_before_gen = 0;
      // Also RESET the cache object itself: one-off generations (query
      // rewrites, examples) populate past_key_values with an unrelated
      // prompt. A flag-only invalidate leaves stale entries → generate()
      // passes a non-empty cache → transformers.js slices the new prompt
      // as if the prefix were already computed → shape mismatch crash.
      if (past_key_values) {
        try {
          await past_key_values.dispose();
        } catch { /* noop */ }
        past_key_values = null;
      }
      post({ type: 'cache_invalidated' });
      break;
    }
    case 'status': {
      post({
        type: 'status',
        worker_nonce,
        loaded_model_id: current_model_id,
        dtype: current_dtype,
        device: current_device,
        kv_cache_reuse: current_kv_cache_reuse,
        pipeline_alive: !!pipeline_generator,
        load_in_flight,
        is_generating,
        loaded_files,
      });
      break;
    }
    default: {
      // Unknown message type — ignore
    }
  }
});
