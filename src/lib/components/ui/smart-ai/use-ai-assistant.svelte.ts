/**
 * useAiAssistant — generic composable managing the Transformers.js engine
 * lifecycle for browser-local AI assistant chat panels.
 *
 * The model runs entirely in-browser via WebGPU inside a Web Worker
 * ($lib/ai/ai-worker.ts). The worker handles model loading, streaming
 * generation, and KV cache management off the main thread.
 *
 * Assistant-specific behavior is injected via `AiAssistantHooks`:
 * - `build_system_prompt` — the assistant's system prompt
 * - `transform_user_content` — inject reminders/context into the model input
 * - `process_response` — parse raw output into choices, or run a
 *   validate-and-repair loop via `regenerate()`
 *
 * The model_id + dtype are passed in as parameters — loaded from the
 * `ai_assistant_model` configuration row and the `ai_models` entity.
 * The model is lazy-loaded into VRAM only when the assistant CTA is clicked.
 * VRAM is released when the panel closes (worker.dispose()).
 *
 * Follows the composable state exposure pattern (mandatory AGENTS.md rule):
 * - Consolidated `_state` object (underscore = internal)
 * - Exposed via `get state(): DeepReadonly<typeof _state>`
 * - Mutations only through exposed mutator functions
 * - `$derived` values exposed via individual getters
 */
import type { DeepReadonly } from '$lib/types/deep-readonly';
import { useAiModels } from '$lib/composables/useAiModels.svelte';
import { apiFetch } from '$lib/api';
import { useAiCerebellum } from '$lib/composables/useAiCerebellum.svelte';
import { resolveEffectiveParams, type EffectiveAiParams } from '$lib/ai/ai-cerebellum';
import type { AiCerebellum } from '$lib/api-types';
import type {
  AiAssistantHooks,
  ChatMessage,
} from './ai-assistant.types';

/**
 * Maximum number of user+assistant turns to send to the model. When exceeded,
 * the oldest turns are dropped (FIFO). The system prompt is ALWAYS kept.
 *
 * When the sliding window drops messages, the KV cache is invalidated
 * (the prompt prefix no longer matches the cached sequence).
 */
const MAX_HISTORY_TURNS = 6;

/** Worker message types (subset relevant to the composable). */
type WorkerMessage =
  | { type: 'boot'; worker_nonce: string }
  | { type: 'webgpu'; available: boolean }
  | { type: 'load_phase'; phase: 'downloading' | 'vram'; worker_nonce: string }
  | { type: 'load_progress'; progress?: number; file?: string | null; stage?: string; total_files?: number; completed_files?: number; file_progress?: Record<string, number> }
  | { type: 'download_bytes'; bytes: number }
  | { type: 'load_started'; seq: number; model_id: string; repo_id: string; dtype: string; device: string; worker_nonce: string }
  | {
      type: 'load_complete';
      model_id: string;
      repo_id?: string;
      dtype?: string;
      device?: string;
      cached?: boolean;
      worker_nonce: string;
      files?: string[];
      model_config?: Record<string, any>;
      fingerprint?: string;
      warmup_ms?: number;
      vram_bytes?: number | null;
    }
  | { type: 'load_error'; error: string; model_id?: string }
  | { type: 'stream'; token: string }
  | { type: 'stream_complete'; text: string; model_id?: string; dtype?: string }
  | { type: 'stream_error'; error: string; model_id?: string }
  | { type: 'interrupted' }
  | { type: 'reset_complete' }
  | { type: 'dispose_complete'; disposed_model_id?: string; worker_nonce?: string }
  | { type: 'status'; worker_nonce: string; loaded_model_id: string | null; dtype: string | null; pipeline_alive: boolean; is_generating: boolean; loaded_files?: string[] }
  | { type: 'measure'; data: any }
  | { type: 'debug'; step?: string; [key: string]: unknown };

export function useAiAssistant<TChoice = unknown>(
  model_id: string,
  hooks: AiAssistantHooks<TChoice>,
  options?: { assistant_key?: string },
) {
  const aiModels = useAiModels();
  const cerebellum = options?.assistant_key
    ? useAiCerebellum(options.assistant_key)
    : null;

  const _state = $state({
    /** The Transformers.js model ID currently loaded (or being loaded). */
    model_id,
    is_loading_model: false,
    load_progress: 0,
    /** Current load phase: 'downloading' (file fetch) or 'vram' (session+warmup). */
    load_phase: 'idle' as 'idle' | 'downloading' | 'vram',
    /** VRAM load progress (0-100), time-based estimate capped at 95%. */
    vram_progress: 0,
    /** Elapsed milliseconds in the VRAM phase (for display). */
    vram_elapsed_ms: 0,
    /** Per-file download progress (0-100), keyed by file path. */
    file_progress: {} as Record<string, number>,
    /** Total number of files being downloaded. */
    total_files: 0,
    /** Number of files that completed download. */
    completed_files: 0,
    /** Name of the file currently being downloaded (for display). */
    current_file: null as string | null,
    /** Slowest file (lowest progress) for display: { name, progress }. */
    slowest_file: null as { name: string; progress: number } | null,
    /**
     * Live-network byte samples `{ t, bytes }` (cumulative per load) for the
     * download speed meter — capped ring buffer, ~4 samples/s from the worker.
     */
    byte_samples: [] as { t: number; bytes: number }[],
    is_ready: false,
    is_streaming: false,
    /** 'thinking' while model reasoning, 'generating' while producing final output. */
    ai_status: 'idle' as 'idle' | 'thinking' | 'generating',
    messages: [] as ChatMessage<TChoice>[],
    streaming_text: '',
    error: null as string | null,
    pending_choices: null as TChoice[] | null,
    webgpu_available: false,
    /** Empirical measurements from the worker (load time, TPS, cache bytes). */
    measurements: null as Record<string, any> | null,
    /**
     * Identity of the model ACTUALLY resident in VRAM, reported back by the
     * worker at load_complete (files fetched, ONNX config, probe output).
     * Distinct from `model_id` which is only what we ASKED to load.
     */
    loaded_info: null as {
      model_id: string;
      dtype: string;
      device: string;
      files: string[];
      model_config: Record<string, any> | null;
      fingerprint: string;
      warmup_ms: number;
      vram_bytes: number | null;
      worker_nonce: string;
    } | null,
    /** Nonce of the live worker — changes when the worker is recreated. */
    worker_nonce: null as string | null,
    /**
     * Selected cerebellum tuning uuid — null means "model defaults".
     * Auto-set to this assistant's dedicated tuning for the active model
     * on model load/switch (the (assistant, model) pair is unique — at most
     * one enabled row); stays null when the assistant has no tuning.
     */
    selected_tuning_uuid: null as string | null,
  });

  /**
   * System prompt sent on the last turn. The KV cache reuses the prompt's
   * token prefix blindly — any mid-conversation change (e.g. an assistant
   * embedding live JSON state) must invalidate the cache, otherwise the
   * model keeps reading the STALE system prompt from cached KV.
   */
  let last_system_prompt: string | null = null;

  /** Active model entity (catalog defaults — before tuning resolution). */
  const model_params = $derived(aiModels.getModelByModelId(_state.model_id));

  /** Enabled cerebellum tunings for the active model+assistant. */
  const tunings = $derived(
    cerebellum && _state.model_id ? cerebellum.getTuningsForModel(_state.model_id) : [],
  );

  /** Selected cerebellum tuning — null = pure model defaults. */
  const selected_tuning = $derived(
    _state.selected_tuning_uuid
      ? (tunings.find((t) => t.uuid === _state.selected_tuning_uuid) ?? null)
      : null,
  );

  /** Effective generation params: model defaults overridden by the tuning. */
  const effective_params: EffectiveAiParams = $derived(
    resolveEffectiveParams(model_params, selected_tuning),
  );

  /** Select a tuning by uuid (null = back to model defaults). */
  function setTuning(uuid: string | null): void {
    _state.selected_tuning_uuid = uuid;
  }

  /** Live download throughput in MB/s — 3s sliding window over byte samples. */
  function downloadMbs(): number {
    const w = _state.byte_samples;
    if (w.length < 2) return 0;
    const newest = w[w.length - 1];
    const cutoff = newest.t - 3000;
    let oldest = w[0];
    for (const s of w) {
      if (s.t >= cutoff) {
        oldest = s;
        break;
      }
    }
    const dt = newest.t - oldest.t;
    return dt > 0 ? ((newest.bytes - oldest.bytes) / dt) * 1000 / 1e6 : 0;
  }

  // Web Worker instance (lazy-created on init)
  let worker: Worker | null = null;
  /** Resolvers for one-shot worker messages (load_complete, reset_complete, etc.). */
  let pending_load_resolver: (() => void) | null = null;
  let pending_load_rejecter: ((err: Error) => void) | null = null;
  let pending_load_timeout_id: ReturnType<typeof setTimeout> | null = null;
  /** One-shot resolver for the worker's `webgpu` check answer. */
  let pending_webgpu_resolver: ((available: boolean) => void) | null = null;

  /** VRAM phase timer: tracks elapsed time for time-based progress estimate. */
  let vram_start_time = 0;
  let vram_interval_id: ReturnType<typeof setInterval> | null = null;

  /**
   * Create the Web Worker. Vite handles `new Worker(new URL(...))` natively.
   * The worker file is the shared src/lib/ai/ai-worker.ts.
   */
  function createWorker(): Worker {
    const w = new Worker(new URL('$lib/ai/ai-worker.ts', import.meta.url), {
      type: 'module',
    });
    w.addEventListener('message', handleWorkerMessage);
    w.addEventListener('error', (e) => {
      _state.error = `Worker error: ${e.message}`;
    });
    return w;
  }

  /**
   * Handle messages from the worker.
   */
  function handleWorkerMessage(event: MessageEvent) {
    const msg = event.data as WorkerMessage;
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'boot': {
        // A worker announced itself — the nonce proves freshness after
        // terminate() (a dead worker can never post a new nonce).
        _state.worker_nonce = msg.worker_nonce;
        break;
      }
      case 'webgpu': {
        _state.webgpu_available = msg.available;
        if (pending_webgpu_resolver) {
          pending_webgpu_resolver(msg.available);
          pending_webgpu_resolver = null;
        }
        break;
      }
      case 'load_phase': {
        _state.load_phase = msg.phase;
        if (msg.phase === 'vram') {
          // Download complete — force progress to 100% for the bar
          _state.load_progress = 100;
          // Start time-based VRAM progress estimate (only if not already running).
          if (vram_start_time === 0) {
            vram_start_time = Date.now();
            _state.vram_progress = 0;
            _state.vram_elapsed_ms = 0;
            if (vram_interval_id) clearInterval(vram_interval_id);
            const vram_tick = () => {
              const elapsed = Date.now() - vram_start_time;
              _state.vram_elapsed_ms = elapsed;
              // Stepped time-based progress: rescale 100% as elapsed grows.
              // 0-5s: 100%=5s | 5-10s: 100%=10s | >10s: 100%=20s
              const scale = elapsed <= 5000 ? 5000 : elapsed <= 10000 ? 10000 : 20000;
              // Cap at 95% — never reach 100% until load_complete arrives.
              _state.vram_progress = Math.min(95, Math.round((elapsed / scale) * 100));
            };
            vram_tick(); // fire immediately so elapsed is never 0.0s
            vram_interval_id = setInterval(vram_tick, 100);
          }
        }
        break;
      }
      case 'load_progress': {
        // transformers.js sends progress as 0-100 (NOT 0-1 like WebLLM).
        if (msg.file_progress) {
          _state.file_progress = { ...msg.file_progress };
        }
        if (typeof msg.total_files === 'number') _state.total_files = msg.total_files;
        if (typeof msg.completed_files === 'number') _state.completed_files = msg.completed_files;
        if (msg.file) _state.current_file = msg.file;

        // Aggregate progress: average of all file progresses (0-100)
        if (_state.total_files > 0 && _state.file_progress) {
          const sum = Object.values(_state.file_progress).reduce((a, b) => a + b, 0);
          _state.load_progress = Math.round(sum / _state.total_files);
          // Find slowest file (lowest progress) for display.
          let slowest: { name: string; progress: number } | null = null;
          for (const [f, p] of Object.entries(_state.file_progress)) {
            if (!slowest || p < slowest.progress) slowest = { name: f, progress: p };
          }
          _state.slowest_file = slowest;
        } else if (typeof msg.progress === 'number') {
          _state.load_progress = Math.min(100, Math.max(0, Math.round(msg.progress)));
        }
        break;
      }
      case 'download_bytes': {
        _state.byte_samples.push({ t: performance.now(), bytes: msg.bytes });
        if (_state.byte_samples.length > 120) _state.byte_samples.shift();
        break;
      }
      case 'load_complete': {
        // Stop VRAM timer. Keep the last vram_elapsed_ms from the interval
        // as the final value — don't recalculate (cached models would show 0.0s).
        if (vram_interval_id) { clearInterval(vram_interval_id); vram_interval_id = null; }
        if (vram_start_time > 0) {
          _state.vram_progress = 100;
          vram_start_time = 0;
        }
        _state.file_progress = {};
        _state.total_files = 0;
        _state.completed_files = 0;
        _state.current_file = null;
        _state.slowest_file = null;
        // Verify the worker loaded the model we actually asked for.
        if (msg.model_id && msg.model_id !== _state.model_id) {
          _state.is_loading_model = false;
          _state.load_phase = 'idle';
          _state.is_ready = false;
          _state.error = `model_mismatch: loaded ${msg.model_id}, expected ${_state.model_id}`;
          if (pending_load_rejecter) {
            pending_load_rejecter(new Error(_state.error));
            pending_load_resolver = null;
            pending_load_rejecter = null;
          }
          break;
        }
        _state.is_ready = true;
        _state.loaded_info = {
          model_id: msg.model_id ?? _state.model_id,
          dtype: msg.dtype ?? '',
          device: msg.device ?? '',
          files: msg.files ?? [],
          model_config: msg.model_config ?? null,
          fingerprint: msg.fingerprint ?? '',
          warmup_ms: msg.warmup_ms ?? 0,
          vram_bytes: msg.vram_bytes ?? null,
          worker_nonce: msg.worker_nonce,
        };
        // Persist the measured VRAM footprint — GPUBuffer tracking in the
        // worker gives the real allocated bytes, stored as vram_mb.
        if (msg.vram_bytes && msg.vram_bytes > 0) void persistVram(msg.vram_bytes);
        if (pending_load_resolver) {
          pending_load_resolver();
          pending_load_resolver = null;
          pending_load_rejecter = null;
        }
        if (pending_load_timeout_id) { clearTimeout(pending_load_timeout_id); pending_load_timeout_id = null; }
        // Keep the 100% bar visible briefly before switching to chat.
        setTimeout(() => {
          _state.is_loading_model = false;
          _state.load_phase = 'idle';
        }, 300);
        break;
      }
      case 'load_error': {
        if (vram_interval_id) { clearInterval(vram_interval_id); vram_interval_id = null; }
        vram_start_time = 0;
        _state.is_loading_model = false;
        _state.load_phase = 'idle';
        _state.file_progress = {};
        _state.total_files = 0;
        _state.completed_files = 0;
        _state.current_file = null;
        _state.slowest_file = null;
        _state.loaded_info = null;
        _state.error = msg.error;
        if (pending_load_rejecter) {
          pending_load_rejecter(new Error(msg.error));
          pending_load_resolver = null;
          pending_load_rejecter = null;
        }
        if (pending_load_timeout_id) { clearTimeout(pending_load_timeout_id); pending_load_timeout_id = null; }
        break;
      }
      case 'stream': {
        _state.streaming_text += msg.token;
        if (_state.ai_status === 'thinking') {
          _state.ai_status = 'generating';
        }
        break;
      }
      case 'stream_complete': {
        _state.is_streaming = false;
        _state.ai_status = 'idle';
        break;
      }
      case 'stream_error': {
        _state.is_streaming = false;
        _state.ai_status = 'idle';
        _state.error = msg.error;
        break;
      }
      case 'interrupted': {
        _state.is_streaming = false;
        _state.ai_status = 'idle';
        break;
      }
      case 'reset_complete': {
        // KV cache cleared in worker
        break;
      }
      case 'dispose_complete': {
        _state.is_ready = false;
        _state.is_loading_model = false;
        _state.load_progress = 0;
        _state.load_phase = 'idle';
        _state.file_progress = {};
        _state.total_files = 0;
        _state.completed_files = 0;
        _state.current_file = null;
        _state.slowest_file = null;
        _state.loaded_info = null;
        break;
      }
      case 'measure': {
        _state.measurements = msg.data;
        break;
      }
      case 'debug': {
        console.debug('[ai-worker]', msg.step, msg);
        break;
      }
      default: {
        // Ignore unknown messages
      }
    }
  }

  /**
   * Send a message to the worker.
   */
  function postToWorker(message: Record<string, any>): void {
    if (!worker) return;
    worker.postMessage(message);
  }

  /**
   * Terminate the worker and free ALL its resources.
   * Posts a dispose message and waits for dispose_complete before
   * terminating — this gives the worker time to release ONNX sessions and
   * WebGPU buffers. worker.terminate() then destroys the worker context
   * as a final cleanup.
   */
  async function destroyWorker(): Promise<void> {
    if (!worker) return;

    const workerRef = worker;
    worker = null;
    pending_load_resolver = null;
    pending_load_rejecter = null;
    pending_webgpu_resolver = null;

    // Deterministic shutdown: post dispose and wait for dispose_complete.
    // No timeout — the worker MUST complete disposeModel() (which calls
    // session.release() on all ONNX sessions) before we terminate.
    await new Promise<void>((resolve) => {
      let resolved = false;
      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        workerRef.removeEventListener('message', msgHandler);
        workerRef.removeEventListener('error', errHandler);
        resolve();
      };
      const msgHandler = (e: MessageEvent) => {
        if (e.data?.type === 'dispose_complete') {
          cleanup();
        }
      };
      const errHandler = (e: ErrorEvent) => {
        console.warn('[destroyWorker] worker error during dispose:', e.message);
        cleanup();
      };
      workerRef.addEventListener('message', msgHandler);
      workerRef.addEventListener('error', errHandler);
      try {
        workerRef.postMessage({ type: 'dispose' });
      } catch (e) {
        console.warn('[destroyWorker] postMessage failed:', e);
        cleanup();
        return;
      }
    });

    // Now terminate the worker context as final cleanup.
    try { workerRef.terminate(); } catch { /* already dead */ }
  }

  /**
   * Initialize the AI engine. Called when the assistant panel opens.
   * Creates the worker, checks WebGPU, then loads the model.
   */
  async function init(force = false): Promise<void> {
    if (!force && (_state.is_ready || _state.is_loading_model)) return;

    if (!worker) {
      worker = createWorker();
    }

    // Check WebGPU availability — wait for the worker's `webgpu` answer.
    // Deterministic handshake: `webgpu_available` starts false and a `false`
    // answer is indistinguishable from "no answer", so we await the message
    // itself. A dead worker (no answer within 10s) is treated as unavailable.
    postToWorker({ type: 'check' });
    const webgpuAvailable = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        pending_webgpu_resolver = null;
        resolve(false);
      }, 10_000);
      pending_webgpu_resolver = (available) => {
        clearTimeout(timeout);
        resolve(available);
      };
    });

    if (!webgpuAvailable) {
      _state.error = 'webgpu_required';
      return;
    }

    _state.is_loading_model = true;
    _state.error = null;

    // Load cerebellum tunings for this assistant, then auto-select the
    // dedicated tuning for the active model (unique per (assistant, model)
    // pair). No tuning for this pair → null → pure model defaults.
    if (cerebellum) {
      await cerebellum.ensureLoaded();
      if (!_state.selected_tuning_uuid) {
        const dedicated = cerebellum.getTuningsForModel(_state.model_id)[0];
        if (dedicated) _state.selected_tuning_uuid = dedicated.uuid;
      }
    }

    const modelParams = aiModels.getModelByModelId(_state.model_id);
    const dtype = modelParams?.dtype ?? 'q4f16';
    const kvCacheReuse = effective_params.execution_config?.kv_cache_reuse ?? false;

    if (pending_load_timeout_id) { clearTimeout(pending_load_timeout_id); pending_load_timeout_id = null; }
    await new Promise<void>((resolve, reject) => {
      pending_load_resolver = resolve;
      pending_load_rejecter = reject;
      postToWorker({
        type: 'load',
        model_id: _state.model_id,
        dtype,
        kv_cache_reuse: kvCacheReuse,
      });
      // Timeout after 8 minutes (model download can be slow)
      pending_load_timeout_id = setTimeout(() => {
        if (pending_load_rejecter) {
          pending_load_rejecter(new Error('Model load timeout (8 min)'));
          pending_load_resolver = null;
          pending_load_rejecter = null;
          pending_load_timeout_id = null;
        }
      }, 480_000);
    }).catch((err) => {
      _state.is_loading_model = false;
      _state.error = err instanceof Error ? err.message : 'Failed to load AI model';
      throw err;
    });
  }

  /**
   * Persist the worker-measured VRAM footprint (GPUBuffer tracking) onto the
   * ai_models row. Best-effort: admin-only endpoint — a non-admin session or a
   * stale version simply skips the write; the panel keeps working either way.
   */
  async function persistVram(vram_bytes: number): Promise<void> {
    const vram_mb = Math.round(vram_bytes / (1024 * 1024));
    const row = aiModels.getModelByModelId(_state.model_id);
    if (!row?.uuid || row.version == null || row.vram_mb === vram_mb) return;
    try {
      const res = await apiFetch(`/api/v1/entities/ai_model/${row.uuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: { vram_mb, version: row.version } }),
      });
      if (res.ok) aiModels.invalidate();
    } catch { /* measurement persistence is best-effort */ }
  }

  /**
   * Measure VRAM proxy: JS heap + Cache API bytes + GPU adapter info.
   * WebGPU does NOT expose direct VRAM usage via standard APIs.
   */
  async function measureVram(label: string): Promise<{
    label: string;
    timestamp: number;
    js_heap_mb: number | null;
    cache_bytes: number | null;
    gpu_adapter: string | null;
  }> {
    const timestamp = Date.now();

    let js_heap_mb: number | null = null;
    try {
      if (typeof performance !== 'undefined' && 'measureUserAgentSpecificMemory' in performance) {
        const result = await (performance as any).measureUserAgentSpecificMemory();
        js_heap_mb = result.bytes / (1024 * 1024);
      } else if ((performance as any).memory) {
        js_heap_mb = (performance as any).memory.usedJSHeapSize / (1024 * 1024);
      }
    } catch { /* noop */ }

    let cache_bytes: number | null = null;
    try {
      if (typeof caches !== 'undefined') {
        const names = await caches.keys();
        let total = 0;
        for (const name of names) {
          if (!name.includes('transformers') && !name.includes('onnx') && !name.includes('hf')) continue;
          const cache = await caches.open(name);
          const keys = await cache.keys();
          for (const key of keys) {
            const resp = await cache.match(key);
            if (resp) {
              const blob = await resp.blob();
              total += blob.size;
            }
          }
        }
        cache_bytes = total;
      }
    } catch { /* noop */ }

    let gpu_adapter: string | null = null;
    try {
      if (typeof navigator !== 'undefined' && navigator.gpu) {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          const info = (adapter as any).info ?? (await (adapter as any).requestAdapterInfo?.());
          gpu_adapter = `${info?.vendor ?? ''} ${info?.architecture ?? ''}`.trim() || 'unknown';
        }
      }
    } catch { /* noop */ }

    const measurement = { label, timestamp, js_heap_mb, cache_bytes, gpu_adapter };
    console.log('[VRAM]', label, measurement);
    return measurement;
  }

  /**
   * Switch to a different model at runtime — worker-per-model approach.
   * Frees VRAM deterministically (GPUDevice dies with the worker) without
   * losing page state.
   */
  async function switchModel(new_model_id: string): Promise<void> {
    if (new_model_id === _state.model_id && _state.is_ready) return;
    if (!new_model_id) return;

    const vram_before = await measureVram('before_switch');

    await destroyWorker();

    const vram_after_destroy = await measureVram('after_destroy');

    // Reset state for new model — keep is_loading_model=true so the
    // loading frame stays visible during the switch.
    _state.model_id = new_model_id;
    _state.is_ready = false;
    _state.is_loading_model = true;
    _state.load_progress = 0;
    _state.load_phase = 'downloading';
    _state.file_progress = {};
    _state.total_files = 0;
    _state.completed_files = 0;
    _state.current_file = null;
    _state.loaded_info = null;
    _state.worker_nonce = null;
    _state.byte_samples = [];
    _state.messages = [];
    _state.pending_choices = null;
    _state.streaming_text = '';
    _state.error = null;
    _state.measurements = null;
    _state.selected_tuning_uuid = null;
    last_system_prompt = null;

    await init(true);

    const vram_after_load = await measureVram('after_new_load');

    const heap_net = vram_before.js_heap_mb != null && vram_after_load.js_heap_mb != null
      ? vram_after_load.js_heap_mb - vram_before.js_heap_mb : null;
    if (heap_net != null && heap_net > 50) {
      console.warn('[VRAM] Net heap grew > 50MB after switch — possible leak!');
    }
    void vram_after_destroy;
  }

  /**
   * Run one generation round against the worker and resolve with the
   * accumulated streamed text. Caller is responsible for is_streaming.
   */
  function runGeneration(
    modelMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  ): Promise<string> {
    postToWorker({
      type: 'generate',
      messages: modelMessages,
      params: {
        max_new_tokens: effective_params.max_tokens,
        temperature: effective_params.temperature,
        top_p: effective_params.top_p,
        repetition_penalty: effective_params.repetition_penalty,
        do_sample: effective_params.temperature > 0,
        enable_thinking: effective_params.enable_thinking,
      },
    });

    return new Promise<string>((resolve) => {
      const check = () => {
        if (!_state.is_streaming) resolve(_state.streaming_text);
        else setTimeout(check, 50);
      };
      setTimeout(check, 50);
    });
  }

  /**
   * Send a user message to the LLM and stream the response.
   * The assistant's hooks shape the prompt and post-process the output.
   */
  async function sendMessage(text: string): Promise<void> {
    if (!worker || _state.is_streaming || !text.trim()) return;
    if (!_state.is_ready) return;

    _state.is_streaming = true;
    _state.streaming_text = '';
    _state.error = null;
    _state.pending_choices = null;
    _state.ai_status = 'thinking';

    try {
      const systemPrompt = hooks.build_system_prompt();

      // The system prompt is the FIRST block of the rendered prompt — if it
      // changed since the last turn (e.g. current_json mutated after an
      // apply), the cached KV prefix no longer matches and MUST be dropped.
      // The worker does blind prefix slicing: a stale system prompt would be
      // served silently from cache and the model would never see the new
      // state.
      if (systemPrompt !== last_system_prompt) {
        postToWorker({ type: 'invalidate_cache' });
        last_system_prompt = systemPrompt;
      }

      const execConfig = effective_params.execution_config;
      const useSlidingWindow = execConfig?.sliding_window ?? true;
      const maxHistoryTurns = execConfig?.max_history_turns ?? MAX_HISTORY_TURNS;

      // Assistant hook: transform the raw user text into model content
      // (context injection, reminders, modify-vs-new intent handling).
      const userContentForModel = hooks.transform_user_content
        ? hooks.transform_user_content(text, {
            messages: _state.messages,
            exec_config: execConfig,
          })
        : text;

      const userMessage: ChatMessage<TChoice> = {
        uuid: crypto.randomUUID(),
        role: 'user',
        content: userContentForModel,
        display_content: text,
      };
      _state.messages = [..._state.messages, userMessage];

      // Build messages array with sliding window. Keep the system prompt always,
      // then keep only the last maxHistoryTurns user+assistant pairs.
      const conversationMessages = _state.messages.filter(
        (m) => m.role === 'user' || m.role === 'assistant',
      );

      const totalTurns = Math.floor(conversationMessages.length / 2);
      let droppedTurns = 0;
      let windowedMessages = conversationMessages;

      if (useSlidingWindow && totalTurns > maxHistoryTurns) {
        droppedTurns = totalTurns - maxHistoryTurns;
        windowedMessages = conversationMessages.slice(droppedTurns * 2);
      }

      const modelMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];
      for (const m of windowedMessages) {
        if (m.role === 'user') {
          modelMessages.push({ role: 'user', content: m.content });
        } else if (m.role === 'assistant') {
          modelMessages.push({ role: 'assistant', content: m.content });
        }
      }

      // If the sliding window dropped messages, invalidate the KV cache.
      if (droppedTurns > 0) {
        postToWorker({ type: 'invalidate_cache' });
      }

      _state.is_streaming = true;
      _state.streaming_text = '';
      const responseText = await runGeneration(modelMessages);

      /**
       * regenerate(): sends another generation round with an appended repair
       * user message — used by validate-and-repair loops in process_response.
       */
      const regenerate = async (extra_user_content: string): Promise<string> => {
        _state.is_streaming = true;
        _state.ai_status = 'generating';
        _state.streaming_text = '';
        const repairMessages = [
          ...modelMessages,
          { role: 'assistant' as const, content: responseText },
          { role: 'user' as const, content: extra_user_content },
        ];
        return runGeneration(repairMessages);
      };

      const processed = hooks.process_response
        ? await hooks.process_response(responseText, regenerate)
        : { content: responseText, choices: null };

      const choices = processed.choices ?? null;
      if (choices && choices.length > 0) {
        _state.pending_choices = choices;
      }

      // Store the RAW model response as the assistant message content.
      // This is critical for KV cache prefix reuse: the next turn must pass
      // the exact same tokenized assistant content as part of the conversation
      // prefix.
      const assistantMessage: ChatMessage<TChoice> = {
        uuid: crypto.randomUUID(),
        role: 'assistant',
        content: processed.content,
        display_content: processed.display_content,
        choices: choices ?? undefined,
        sources: processed.sources,
      };
      _state.messages = [..._state.messages, assistantMessage];
    } catch (err) {
      _state.error = err instanceof Error ? err.message : 'Failed to generate response';
    } finally {
      _state.is_streaming = false;
      _state.streaming_text = '';
      _state.ai_status = 'idle';
    }
  }

  /**
   * Apply a chosen option — resolves and returns it; caller decides what to do.
   */
  function applyChoice(index: number, message_uuid?: string): TChoice | null {
    if (message_uuid) {
      const msg = _state.messages.find((m) => m.uuid === message_uuid);
      if (!msg || !msg.choices || index < 0 || index >= msg.choices.length) return null;
      return msg.choices[index];
    }
    if (!_state.pending_choices || index < 0 || index >= _state.pending_choices.length) {
      return null;
    }
    const choice = _state.pending_choices[index];
    _state.pending_choices = null;
    return choice;
  }

  /**
   * Resolve a choices-bearing message (apply/discard). Marks the message so
   * the UI can collapse its CTAs into a status label, and optionally
   * CONDENSES the assistant content for future turns: the verbose raw output
   * (e.g. a JSON document) is replaced by a compact summary so the context
   * stays small across refinements.
   *
   * Condensing mutates history → the KV cache prefix is invalidated
   * (same mechanism the sliding window uses), so nothing breaks.
   */
  function resolveChoice(
    message_uuid: string,
    resolution: 'applied' | 'discarded',
    opts?: { index?: number; condensed_content?: string },
  ): void {
    const idx = _state.messages.findIndex((m) => m.uuid === message_uuid);
    if (idx === -1) return;
    const msg = _state.messages[idx];
    const next = [..._state.messages];
    next[idx] = {
      ...msg,
      resolution,
      resolution_index: opts?.index,
      content: opts?.condensed_content ?? msg.content,
    };
    _state.messages = next;
    _state.pending_choices = null;
    if (opts?.condensed_content !== undefined) {
      postToWorker({ type: 'invalidate_cache' });
    }
  }

  /**
   * Run a one-off generation (no history, custom prompt) — e.g. example
   * generation. Returns the raw streamed text.
   */
  async function generateOneOff(
    system_prompt: string,
    user_prompt: string,
    params?: { max_new_tokens?: number; temperature?: number; top_p?: number; repetition_penalty?: number },
  ): Promise<string> {
    // A one-off while another generation is in flight hits the worker's
    // `is_generating` guard → stream_error → _state.error (the panel shows
    // a hard error). Bail early instead of poisoning the UI state.
    if (!worker || !_state.is_ready || _state.is_streaming) return '';

    _state.is_streaming = true;
    _state.streaming_text = '';
    try {
      postToWorker({
        type: 'generate',
        messages: [
          { role: 'system', content: system_prompt },
          { role: 'user', content: user_prompt },
        ],
        params: {
          max_new_tokens: params?.max_new_tokens ?? 256,
          temperature: params?.temperature ?? 0.5,
          top_p: params?.top_p ?? 0.9,
          repetition_penalty: params?.repetition_penalty ?? 1.1,
          do_sample: (params?.temperature ?? 0.5) > 0,
          enable_thinking: effective_params.enable_thinking,
        },
      });

      await new Promise<void>((resolve) => {
        const check = () => {
          if (!_state.is_streaming) resolve();
          else setTimeout(check, 50);
        };
        setTimeout(check, 50);
      });
      return _state.streaming_text;
    } finally {
      _state.is_streaming = false;
      _state.streaming_text = '';
      // The one-off overwrote past_key_values with its own prompt's KV.
      // The next conversation turn does blind prefix slicing on the SAME
      // system prompt (no invalidate trigger) — a stale prefix would be
      // served silently. Force a full re-prefill.
      postToWorker({ type: 'invalidate_cache' });
    }
  }

  /**
   * Append a LOCAL assistant message (no generation) — used by assistants
   * for deterministic, schema-driven choice cards that must not consume a
   * model turn. The message participates in history like a model answer.
   */
  function addLocalAssistantMessage(content: string, choices?: TChoice[] | null): void {
    const msg: ChatMessage<TChoice> = {
      uuid: crypto.randomUUID(),
      role: 'assistant',
      content,
      choices: choices ?? undefined,
    };
    _state.messages = [..._state.messages, msg];
    if (choices && choices.length > 0) {
      _state.pending_choices = choices;
    }
  }

  /**
   * Append a LOCAL user message (no generation) — used when a flow consumes
   * chat input outside a model turn (e.g. the key_picker free-text path),
   * so the typed text still appears in the conversation.
   */
  function addLocalUserMessage(content: string): void {
    const msg: ChatMessage<TChoice> = {
      uuid: crypto.randomUUID(),
      role: 'user',
      content,
    };
    _state.messages = [..._state.messages, msg];
  }

  /**
   * Clear the conversation and reset KV cache.
   */
  async function clearConversation(): Promise<void> {
    postToWorker({ type: 'reset' });
    _state.messages = [];
    _state.pending_choices = null;
    _state.streaming_text = '';
    _state.error = null;
    last_system_prompt = null;
  }

  /**
   * Interrupt the current generation.
   */
  function interrupt(): void {
    postToWorker({ type: 'interrupt' });
  }

  /**
   * Cancel an in-progress model load (download or VRAM phase).
   * Destroys the worker (which aborts the fetch/pipeline), then sets
   * a user-facing error so the chat frame stays visible with the
   * model selector enabled — the user can pick a different model.
   */
  async function cancelLoad(): Promise<void> {
    pending_load_resolver = null;
    pending_load_rejecter = null;
    if (vram_interval_id) { clearInterval(vram_interval_id); vram_interval_id = null; }
    vram_start_time = 0;
    await destroyWorker();
    _state.is_loading_model = false;
    _state.load_phase = 'idle';
    _state.load_progress = 0;
    _state.file_progress = {};
    _state.total_files = 0;
    _state.completed_files = 0;
    _state.current_file = null;
    _state.slowest_file = null;
    _state.is_ready = false;
    _state.error = 'Annullato dall\'utente';
  }

  /**
   * Unload the model and release VRAM. Called when the panel closes.
   */
  async function dispose(): Promise<void> {
    await destroyWorker();
    _state.is_ready = false;
    _state.is_loading_model = false;
    _state.load_progress = 0;
    _state.load_phase = 'idle';
    _state.file_progress = {};
    _state.total_files = 0;
    _state.completed_files = 0;
    _state.current_file = null;
    _state.slowest_file = null;
    _state.messages = [];
    _state.pending_choices = null;
    _state.streaming_text = '';
    _state.measurements = null;
  }

  return {
    get state(): DeepReadonly<typeof _state> {
      return _state as DeepReadonly<typeof _state>;
    },
    /** Enabled cerebellum tunings for the active model+assistant. */
    get tunings(): DeepReadonly<AiCerebellum[]> {
      return tunings as DeepReadonly<AiCerebellum[]>;
    },
    /** Selected tuning (null = model defaults). */
    get selected_tuning(): AiCerebellum | null {
      return selected_tuning;
    },
    /** Effective generation params after tuning resolution. */
    get effective_params(): EffectiveAiParams {
      return effective_params;
    },
    /** Live download throughput in MB/s — 3s sliding window over byte samples. */
    get download_mbs(): number {
      return downloadMbs();
    },
    /** Live download throughput in Mbps (megabits/s). */
    get download_mbps(): number {
      return downloadMbs() * 8;
    },
    setTuning,
    init,
    switchModel,
    sendMessage,
    applyChoice,
    resolveChoice,
    generateOneOff,
    addLocalAssistantMessage,
    addLocalUserMessage,
    clearConversation,
    interrupt,
    cancelLoad,
    dispose,
  };
}
