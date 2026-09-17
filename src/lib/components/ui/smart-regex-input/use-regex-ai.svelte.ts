/**
 * useRegexAi — composable managing the Transformers.js engine lifecycle for
 * the SmartRegexInput AI chat panel.
 *
 * The model runs entirely in-browser via WebGPU inside a Web Worker
 * (regex-ai-worker.ts). The worker handles model loading, streaming
 * generation, and KV cache management off the main thread.
 *
 * The model_id + dtype are passed in as parameters — loaded from the
 * `ai_assistant_model` configuration row and the `ai_models` entity.
 * The model is lazy-loaded into VRAM only when the brain CTA is clicked.
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

/**
 * Maximum number of user+assistant turns to send to the model. When exceeded,
 * the oldest turns are dropped (FIFO). The system prompt is ALWAYS kept.
 *
 * Token budget estimation:
 * - System prompt: ~427 tokens
 * - 6 turns (12 messages): ~600 tokens
 * - Response budget: ~256 tokens
 * - Total: ~1283 tokens (well within 4096)
 *
 * When the sliding window drops messages, the KV cache is invalidated
 * (the prompt prefix no longer matches the cached sequence).
 */
const MAX_HISTORY_TURNS = 6;

/** A single chat message in the AI conversation. */
export interface ChatMessage {
  uuid: string;
  role: 'user' | 'assistant';
  /** Full content sent to / received from the model (for KV cache prefix matching). */
  content: string;
  /** Original user text for UI display (when content has injected prefixes). */
  display_content?: string;
  /** When present, the assistant is offering 1-3 regex choices. */
  choices?: RegexChoice[];
}

/** A regex option offered by the AI. */
export interface RegexChoice {
  /** The regex pattern (without flags). */
  pattern: string;
  /** Suggested flags (may be empty). */
  flags: string;
  /** Human-readable description of what the regex validates. */
  description: string;
}

/** A single part of a regex breakdown. */
export interface RegexPart {
  /** The regex fragment (e.g. "^", "[a-z]", "{3,5}", "$"). */
  fragment: string;
  /** Translation key for what this fragment matches (e.g. "app.smart.regex.explainer.start"). */
  meaning_key: string;
  /** Optional params for the translation key (e.g. { content: "a-z" }). */
  meaning_params?: Record<string, string | number>;
}

/** Worker message types (subset relevant to the composable). */
type WorkerMessage =
  | { type: 'boot'; worker_nonce: string }
  | { type: 'webgpu'; available: boolean }
  | { type: 'load_phase'; phase: 'downloading' | 'vram'; worker_nonce: string }
  | { type: 'load_progress'; progress?: number; file?: string | null; stage?: string; total_files?: number; completed_files?: number; file_progress?: Record<string, number> }
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
    }
  | { type: 'load_error'; error: string; model_id?: string }
  | { type: 'stream'; token: string }
  | { type: 'stream_complete'; text: string; model_id?: string; dtype?: string }
  | { type: 'stream_error'; error: string; model_id?: string }
  | { type: 'interrupted' }
  | { type: 'reset_complete' }
  | { type: 'dispose_complete'; disposed_model_id?: string; worker_nonce?: string }
  | { type: 'status'; worker_nonce: string; loaded_model_id: string | null; dtype: string | null; pipeline_alive: boolean; is_generating: boolean; loaded_files?: string[] }
  | { type: 'measure'; data: any };

/** Build the system prompt for the LLM. */
function buildSystemPrompt(): string {
  return `/no_think
You are a regex generator. Convert the user's natural language request into JavaScript regex patterns.

RULES:
1. Output ONLY valid JSON: {"patterns":[{"pattern":"...","flags":""}]}
2. Anchor with ^ and $.
3. No markdown, no explanation, just JSON.
4. If the user message starts with "Current regex:", MODIFY that regex. Add new characters INSIDE the existing character class brackets [...]. Keep all existing characters.
5. If the user says "cancel", "annulla", "reset", or "instead", IGNORE the previous regex and generate a fresh one.
6. "punto" means dot (.), "virgola" means comma (,), "punto e virgola" means dot AND comma (. and ,), "puntoevirgola" or ";" means semicolon (;). "lettere" means letters, "numeri" means numbers.
7. Use ONLY ASCII characters (U+0020 to U+007E) in regex patterns. NEVER use Unicode look-alikes: use - (U+002D HYPHEN-MINUS) for "trattino"/"dash"/"minus", NEVER the Unicode minus sign (U+2212) or en-dash (U+2013) or em-dash (U+2014). Use ' (U+0027 APOSTROPHE) for apostrophe, NEVER the Unicode right single quote (U+2019). Use " (U+0022 QUOTATION MARK) for quotes, NEVER the Unicode left/right double quotes (U+201C/U+201D).

Examples:

User: any word
{"patterns":[{"pattern":"^\\w+$","flags":""}]}

User: email address
{"patterns":[{"pattern":"^[\\w.]+@[\\w.]+\\.[a-z]{2,}$","flags":"i"}]}

User: numero di 3-5 cifre
{"patterns":[{"pattern":"^\\d{3,5}$","flags":""}]}

User: lettere e numeri
{"patterns":[{"pattern":"^[a-zA-Z0-9]+$","flags":""}]}

User: Current regex: ^[a-z]+$
aggiungi numeri
{"patterns":[{"pattern":"^[a-z0-9]+$","flags":""}]}

User: Current regex: ^[a-zA-Z0-9.,]+$
aggiungi underscore e trattino
{"patterns":[{"pattern":"^[a-zA-Z0-9.,_-]+$","flags":""}]}`;
}

/**
 * Detect whether the user wants to MODIFY the existing regex or generate
 * a NEW one. This prevents the "Current regex:" prefix from being injected
 * for completely new requests (e.g., "validare un numero di telefono"
 * after a previous email regex).
 *
 * Modify intent keywords (Italian + English):
 *   "aggiungi", "aggiungiamo", "rimuovi", "togli", "modifica", "change",
 *   "add", "remove", "keep", "mantieni"
 *
 * New regex intent keywords (Italian + English):
 *   "validare", "validate", "crea", "create", "genera", "generate",
 *   "nuovo", "new", "email", "phone", "telefono", "partita iva",
 *   "codice fiscale"
 *
 * If ambiguous → default to NEW regex (safer — the model can still
 * reference history via the conversation).
 */
function detectIntent(text: string): 'modify' | 'new' {
  const lower = text.toLowerCase().trim();

  // New regex intent — explicit creation/validation keywords
  const newKeywords = [
    'validare', 'validate', 'crea', 'create', 'genera', 'generate',
    'nuovo', 'new', 'email', 'phone', 'telefono', 'partita iva',
    'codice fiscale', 'nuova', 'nuove',
  ];
  for (const kw of newKeywords) {
    if (lower.includes(kw)) return 'new';
  }

  // Modify intent — explicit modification keywords
  const modifyKeywords = [
    'aggiungi', 'aggiungiamo', 'rimuovi', 'togli', 'modifica',
    'change', 'add', 'remove', 'keep', 'mantieni', 'aggiungere',
    'rimuovere', 'modificare',
  ];
  for (const kw of modifyKeywords) {
    if (lower.includes(kw)) return 'modify';
  }

  // Ambiguous — default to new regex (safer)
  return 'new';
}

export function useRegexAi(
  model_id: string,
  initial_regex: string = '',
  initial_flags: string = '',
) {
  const aiModels = useAiModels();

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
    is_ready: false,
    is_streaming: false,
    /** 'thinking' while model reasoning, 'generating' while producing final output. */
    ai_status: 'idle' as 'idle' | 'thinking' | 'generating',
    messages: [] as ChatMessage[],
    streaming_text: '',
    error: null as string | null,
    pending_choices: null as RegexChoice[] | null,
    webgpu_available: false,
    /** Empirical measurements from the worker (load time, TPS, cache bytes). */
    measurements: null as Record<string, any> | null,
    /**
     * Identity of the model ACTUALLY resident in VRAM, reported back by the
     * worker at load_complete (files fetched, ONNX config, probe output).
     * Distinct from `model_id` which is only what we ASKED to load — the
     * harness verifies they match via `worker_nonce` + `model_config`.
     */
    loaded_info: null as {
      model_id: string;
      dtype: string;
      device: string;
      files: string[];
      model_config: Record<string, any> | null;
      fingerprint: string;
      warmup_ms: number;
      worker_nonce: string;
    } | null,
    /** Nonce of the live worker — changes when the worker is recreated. */
    worker_nonce: null as string | null,
  });

  // Web Worker instance (lazy-created on init)
  let worker: Worker | null = null;
  /** Resolvers for one-shot worker messages (load_complete, reset_complete, etc.). */
  let pending_load_resolver: (() => void) | null = null;
  let pending_load_rejecter: ((err: Error) => void) | null = null;
  let pending_load_timeout_id: ReturnType<typeof setTimeout> | null = null;

  /** VRAM phase timer: tracks elapsed time for time-based progress estimate. */
  let vram_start_time = 0;
  let vram_interval_id: ReturnType<typeof setInterval> | null = null;

  /**
   * Create the Web Worker. Vite handles `new Worker(new URL(...))` natively.
   * The worker file is in src/lib/ai/regex-ai-worker.ts.
   */
  function createWorker(): Worker {
    const w = new Worker(new URL('$lib/ai/regex-ai-worker.ts', import.meta.url), {
      type: 'module',
    });
    // DEBUG: expose worker for console-driven selftest (temporary)
    (window as any).__regexAiWorker = w;
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
    console.log('[useRegexAi] worker message:', msg.type, msg);

    switch (msg.type) {
      case 'boot': {
        // A worker announced itself — the nonce proves freshness after
        // terminate() (a dead worker can never post a new nonce).
        _state.worker_nonce = msg.worker_nonce;
        break;
      }
      case 'webgpu': {
        _state.webgpu_available = msg.available;
        break;
      }
      case 'load_phase': {
        _state.load_phase = msg.phase;
        if (msg.phase === 'vram') {
          // Download complete — force progress to 100% for the bar
          _state.load_progress = 100;
          // Start time-based VRAM progress estimate (only if not already running).
          // The worker may send load_phase:vram twice (from progress_callback
          // and from the fallback after pipeline() returns). The second call
          // must NOT reset the timer — otherwise the label jumps back to 0.0s.
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
        // Do NOT multiply by 100 — that was the 10000% bug.
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
      case 'load_complete': {
        // Stop VRAM timer. Keep the last vram_elapsed_ms from the interval
        // as the final value — don't recalculate (cached models would show 0.0s).
        // Set progress = 100% (max = last elapsed, so they correspond).
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
        // Verify the worker loaded the model we actually asked for. A
        // mismatch means a stale/foreign pipeline is in VRAM — never mark
        // ready in that case.
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
          worker_nonce: msg.worker_nonce,
        };
        if (pending_load_resolver) {
          pending_load_resolver();
          pending_load_resolver = null;
          pending_load_rejecter = null;
        }
        if (pending_load_timeout_id) { clearTimeout(pending_load_timeout_id); pending_load_timeout_id = null; }
        // Keep the 100% bar visible briefly before switching to chat,
        // so even fast models show the completed progress.
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
        // Final text already accumulated via 'stream' messages
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
        console.log('[useRegexAi] measure', JSON.stringify(msg.data));
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
   * Posts a dispose message and waits (up to 3s) for dispose_complete before
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

    // Deterministic shutdown: post dispose and wait for dispose_complete.
    // No timeout — the worker MUST complete disposeModel() (which calls
    // session.release() on all ONNX sessions) before we terminate.
    // A timeout would kill the worker mid-release, leaking GPU buffers.
    // Safety: if the worker errors/crashes, the error handler resolves.
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
          console.log('[destroyWorker] dispose_complete received');
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
        console.log('[destroyWorker] posting dispose to worker');
        workerRef.postMessage({ type: 'dispose' });
      } catch (e) {
        console.warn('[destroyWorker] postMessage failed:', e);
        cleanup();
        return;
      }
    });

    // Now terminate the worker context as final cleanup.
    console.log('[destroyWorker] terminating worker');
    try { workerRef.terminate(); } catch { /* already dead */ }
  }

  /**
   * Initialize the AI engine. Called when the brain CTA panel opens.
   * Creates the worker, checks WebGPU, then loads the model.
   */
  async function init(force = false): Promise<void> {
    if (!force && (_state.is_ready || _state.is_loading_model)) return;

    // Create worker if not already created
    if (!worker) {
      worker = createWorker();
    }

    // Check WebGPU availability
    postToWorker({ type: 'check' });
    // Wait briefly for the webgpu response (it's async via message)
    await new Promise<void>((resolve) => {
      const check = () => {
        if (_state.webgpu_available !== false || _state.error === 'webgpu_required') {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      // Give the worker a moment to respond
      setTimeout(check, 100);
    });

    if (!_state.webgpu_available) {
      _state.error = 'webgpu_required';
      return;
    }

    _state.is_loading_model = true;
    _state.error = null;

    // Look up dtype + execution_config from the BE entity
    const modelParams = aiModels.getModelByModelId(_state.model_id);
    const dtype = modelParams?.dtype ?? 'q4f16';
    // Read execution_config from BE entity. NULL = safe fallback
    // (no KV cache reuse, sliding window + intent detection).
    const execConfig = modelParams?.execution_config ?? null;
    const kvCacheReuse = execConfig?.kv_cache_reuse ?? false;
    const slidingWindow = execConfig?.sliding_window ?? true;
    const maxHistoryTurns = execConfig?.max_history_turns ?? MAX_HISTORY_TURNS;
    const intentDetection = execConfig?.intent_detection ?? true;

    // Load the model in the worker
    // Cancel any stale timeout from a previous load attempt
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
   * Measure VRAM proxy: JS heap + Cache API bytes + GPU adapter info.
   *
   * WebGPU does NOT expose direct VRAM usage via standard APIs.
   * We use a combined proxy:
   *  - performance.measureUserAgentSpecificMemory() (Chrome/Edge 89+) for JS heap
   *  - Cache API bytes (model files = proxy for VRAM footprint)
   *  - GPU adapter info for context
   *
   * The JS heap delta after destroy is a strong signal: if it drops
   * significantly, the model was released. For TRUE GPU VRAM, the only
   * option is edge://gpu/ (manual, not scriptable).
   */
  async function measureVram(label: string): Promise<{
    label: string;
    timestamp: number;
    js_heap_mb: number | null;
    cache_bytes: number | null;
    gpu_adapter: string | null;
  }> {
    const timestamp = Date.now();

    // 1. JS heap (Chrome/Edge only)
    let js_heap_mb: number | null = null;
    try {
      if (typeof performance !== 'undefined' && 'measureUserAgentSpecificMemory' in performance) {
        const result = await (performance as any).measureUserAgentSpecificMemory();
        js_heap_mb = result.bytes / (1024 * 1024);
      } else if ((performance as any).memory) {
        js_heap_mb = (performance as any).memory.usedJSHeapSize / (1024 * 1024);
      }
    } catch { /* noop */ }

    // 2. Cache API bytes (model files = proxy for VRAM)
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

    // 3. GPU adapter info
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
   *
   * Instead of reloading the page (old approach), we:
   * 1. Destroy the current worker (dispose + terminate) — kills GPUDevice
   * 2. Reset all state for the new model
   * 3. Create a fresh worker + init (loads new model with new GPUDevice)
   *
   * This frees VRAM deterministically (GPUDevice dies with the worker)
   * without losing page state (HMR, navigation, user context).
   *
   * VRAM debug logs show heap before/after destroy and after new load,
   * with delta analysis to detect leaks.
   */
  async function switchModel(new_model_id: string): Promise<void> {
    if (new_model_id === _state.model_id && _state.is_ready) return;
    if (!new_model_id) return;

    // ── VRAM debug: baseline before switch ──
    const vram_before = await measureVram('before_switch');
    const old_model = _state.model_id;

    // 1. Destroy current worker (dispose + terminate) — frees GPUDevice
    await destroyWorker();

    // ── VRAM debug: after destroy, before new load ──
    const vram_after_destroy = await measureVram('after_destroy');

    // 2. Reset state for new model — but keep is_loading_model=true so the
    //    loading frame stays visible during the switch (same UX as initial load).
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
    _state.messages = [];
    _state.pending_choices = null;
    _state.streaming_text = '';
    _state.error = null;
    _state.measurements = null;

    // 3. Create fresh worker + init (loads new model with new GPUDevice).
    //    force=true bypasses the is_loading_model guard since we already
    //    set it true above to keep the loading frame visible.
    await init(true);

    // ── VRAM debug: after new model loaded ──
    const vram_after_load = await measureVram('after_new_load');

    // ── Report deltas ──
    const heap_delta_destroy = vram_before.js_heap_mb != null && vram_after_destroy.js_heap_mb != null
      ? vram_before.js_heap_mb - vram_after_destroy.js_heap_mb : null;
    const heap_delta_load = vram_after_destroy.js_heap_mb != null && vram_after_load.js_heap_mb != null
      ? vram_after_load.js_heap_mb - vram_after_destroy.js_heap_mb : null;
    const heap_net = vram_before.js_heap_mb != null && vram_after_load.js_heap_mb != null
      ? vram_after_load.js_heap_mb - vram_before.js_heap_mb : null;

    console.log('[VRAM] ── SWITCH REPORT ──');
    console.log('[VRAM] old model:', old_model, '→ new model:', new_model_id);
    console.log('[VRAM] JS heap before switch:', vram_before.js_heap_mb?.toFixed(2), 'MB');
    console.log('[VRAM] JS heap after destroy:', vram_after_destroy.js_heap_mb?.toFixed(2), 'MB');
    console.log('[VRAM] JS heap after new load:', vram_after_load.js_heap_mb?.toFixed(2), 'MB');
    console.log('[VRAM] Heap freed by destroy:', heap_delta_destroy?.toFixed(2), 'MB');
    console.log('[VRAM] Heap used by new model:', heap_delta_load?.toFixed(2), 'MB');
    console.log('[VRAM] Net heap delta:', heap_net?.toFixed(2), 'MB');
    console.log('[VRAM] Cache bytes before:', vram_before.cache_bytes);
    console.log('[VRAM] Cache bytes after:', vram_after_load.cache_bytes);
    console.log('[VRAM] GPU adapter:', vram_before.gpu_adapter);

    // Note: JS heap measures MAIN THREAD only, not worker memory.
    // The model lives in the worker — its memory is freed when the worker
    // terminates, but not reflected in main thread heap measurements.
    // The meaningful metric is net_heap_delta: ~0 means no leak.
    if (heap_net != null && heap_net > 50) {
      console.warn('[VRAM] ⚠️ Net heap grew > 50MB after switch — possible leak!');
    }
  }

  /**
   * Send a user message to the LLM and stream the response.
   * Parses the response for regex patterns and sets pending_choices if found.
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
      const systemPrompt = buildSystemPrompt();

      // Find the last regex from previous assistant messages (if any).
      let lastRegex: RegexChoice | null = null;
      for (let i = _state.messages.length - 1; i >= 0; i--) {
        const m = _state.messages[i];
        if (m.role === 'assistant' && m.choices && m.choices.length > 0) {
          lastRegex = m.choices[0];
          break;
        }
      }
      if (!lastRegex && initial_regex) {
        lastRegex = { pattern: initial_regex, flags: initial_flags, description: '' };
      }

      // Build the user content for the model: inject current regex if available.
      const JSON_REMINDER = '\n/no_think\n[Respond ONLY with JSON: {"patterns":[{"pattern":"...","flags":""}]}]';
      let userContentForModel = text + JSON_REMINDER;
      // Only inject "Current regex:" when the user's intent is to MODIFY the
      // existing regex. For new regex requests (e.g., "validare un numero di
      // telefono"), do NOT inject — let the model generate fresh.
      const modelParams = aiModels.getModelByModelId(_state.model_id);
      const execConfig = modelParams?.execution_config ?? null;
      const useIntentDetection = execConfig?.intent_detection ?? true;
      const useSlidingWindow = execConfig?.sliding_window ?? true;
      const maxHistoryTurns = execConfig?.max_history_turns ?? MAX_HISTORY_TURNS;

      if (lastRegex && useIntentDetection) {
        const intent = detectIntent(text);
        if (intent === 'modify') {
          userContentForModel = `Current regex: ${lastRegex.pattern}\n${text}${JSON_REMINDER}`;
        }
        // If intent === 'new', do NOT inject "Current regex:" — the model
        // generates a fresh regex. It can still reference conversation history.
      }

      const userMessage: ChatMessage = {
        uuid: crypto.randomUUID(),
        role: 'user',
        content: userContentForModel,
        display_content: text,
      };
      _state.messages = [..._state.messages, userMessage];

      // Build messages array with sliding window. Keep the system prompt always,
      // then keep only the last maxHistoryTurns user+assistant pairs. When the
      // window drops messages, the KV cache is invalidated (the prompt prefix
      // no longer matches the cached sequence).
      const conversationMessages = _state.messages.filter(
        (m) => m.role === 'user' || m.role === 'assistant',
      );

      // Count turns (user+assistant pairs). Each pair = 2 messages.
      const totalTurns = Math.floor(conversationMessages.length / 2);
      let droppedTurns = 0;
      let windowedMessages = conversationMessages;

      if (useSlidingWindow && totalTurns > maxHistoryTurns) {
        droppedTurns = totalTurns - maxHistoryTurns;
        // Drop oldest messages (FIFO) — keep the last maxHistoryTurns * 2 messages.
        // The current user message (just added) is always included.
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

      // If the sliding window dropped messages, invalidate the KV cache — the
      // prompt prefix changed so the cached sequence no longer matches.
      if (droppedTurns > 0) {
        postToWorker({ type: 'invalidate_cache' });
      }

      // Send generate request to worker (modelParams already looked up above)
      postToWorker({
        type: 'generate',
        messages: modelMessages,
        params: {
          max_new_tokens: modelParams?.max_tokens ?? 256,
          temperature: modelParams?.temperature ?? 0.7,
          top_p: modelParams?.top_p ?? 0.9,
          repetition_penalty: modelParams?.repetition_penalty ?? 1.1,
          do_sample: (modelParams?.temperature ?? 0.7) > 0,
          enable_thinking: modelParams?.enable_thinking ?? false,
        },
      });

      // Wait for stream_complete
      await new Promise<void>((resolve) => {
        const check = () => {
          if (!_state.is_streaming) resolve();
          else setTimeout(check, 50);
        };
        setTimeout(check, 50);
      });

      const responseText = _state.streaming_text;

      // Parse regex patterns from the response
      const choices = parseRegexChoices(responseText);
      if (choices && choices.length > 0) {
        _state.pending_choices = choices;
      }

      // Store the RAW model response as the assistant message content.
      // This is critical for KV cache prefix reuse: the next turn must pass
      // the exact same tokenized assistant content as part of the conversation
      // prefix. Storing a simplified "Regex: <pattern>" string would break the
      // prefix match and force a full prompt reprocess every turn (and with
      // Transformers.js DynamicCache, a mismatched cache produces garbage).
      // The UI uses parseRegexChoices() to extract choices for display, and
      // falls back to showing raw content when parsing fails.
      const assistantMessage: ChatMessage = {
        uuid: crypto.randomUUID(),
        role: 'assistant',
        content: responseText,
        choices: choices ?? undefined,
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
   * Parse the LLM response for regex patterns.
   * Expects JSON: {"patterns": [{"pattern": "...", "flags": "", "description": "..."}, ...]}
   * Handles markdown code fences, "json" prefix, invalid JSON backslashes,
   * and malformed JSON by falling back to regex field extraction.
   */
  function parseRegexChoices(response: string): RegexChoice[] | null {
    // Step 1: Aggressively strip markdown fences and "json" prefix
    let text = response.trim();
    text = text.replace(/^```(?:json)?\s*\n?/i, '');
    text = text.replace(/^json\s*\n/i, '');
    text = text.replace(/\n?```\s*$/i, '').trim();

    // Step 2: Try JSON.parse with backslash sanitization
    const sanitized = text.replace(/\\(?!["\\bfnrtu/])/g, '\\\\');
    try {
      const parsed = JSON.parse(sanitized);
      if (parsed && Array.isArray(parsed.patterns)) {
        return parsed.patterns
          .filter((p: any) => p && typeof p.pattern === 'string')
          .slice(0, 3)
          .map((p: any) => ({
            pattern: p.pattern,
            flags: typeof p.flags === 'string' ? p.flags : '',
            description: typeof p.description === 'string' ? p.description : '',
          }));
      }
    } catch {
      // Not valid JSON — try regex field extraction
    }

    // Step 3: Regex field extraction
    const patternRegex = /"pattern"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    const flagsRegex = /"flags"\s*:\s*"((?:[^"\\]|\\.)*)"/g;

    const patterns: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = patternRegex.exec(text)) !== null) {
      patterns.push(match[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"'));
    }

    if (patterns.length > 0) {
      const flags: string[] = [];
      while ((match = flagsRegex.exec(text)) !== null) {
        flags.push(match[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"'));
      }
      return patterns.slice(0, 3).map((p, i) => ({
        pattern: p,
        flags: flags[i] ?? '',
        description: '',
      }));
    }

    // Step 4: Fallback — extract pattern from "Regex: <pattern>" prefix.
    const regexPrefixMatch = text.match(/^Regex:\s*(.+)$/i);
    if (regexPrefixMatch) {
      const candidate = regexPrefixMatch[1].trim();
      if (candidate.length > 0 && candidate.includes('[')) {
        return [{ pattern: candidate, flags: '', description: '' }];
      }
    }

    // Step 5: Fallback — extract a bare regex-like string from free text.
    const bareRegexMatch = text.match(/\^.*\$|\^\^.*\$|\^[^]*\$/);
    if (bareRegexMatch) {
      const candidate = bareRegexMatch[0].trim();
      if (candidate.length > 2 && candidate.includes('[')) {
        return [{ pattern: candidate, flags: '', description: '' }];
      }
    }

    // Step 6: Final fallback — extract backtick-wrapped patterns
    const backtickMatches = response.match(/`([^`]+)`/g);
    if (backtickMatches && backtickMatches.length > 0) {
      const candidates = backtickMatches
        .map((m) => m.replace(/`/g, '').trim())
        .filter((p) => p.length > 0 && !p.startsWith('{') && !p.includes('"patterns"'));
      if (candidates.length > 0) {
        return candidates.slice(0, 3).map((p) => ({
          pattern: p,
          flags: '',
          description: '',
        }));
      }
    }

    return null;
  }

  /**
   * Apply a chosen regex option.
   */
  function applyChoice(index: number, message_uuid?: string): RegexChoice | null {
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
   * Test a regex pattern against sample values.
   */
  async function testRegex(
    pattern: string,
    flags: string,
    samples: string[],
  ): Promise<{ value: string; passed: boolean }[]> {
    try {
      const regex = new RegExp(pattern, flags);
      return samples.map((value) => ({ value, passed: regex.test(value) }));
    } catch {
      return samples.map((value) => ({ value, passed: false }));
    }
  }

  /**
   * Generate up to 5 positive and 5 negative examples for a regex pattern.
   * Uses the LLM to generate examples via the worker.
   */
  async function generateExamples(
    pattern: string,
    flags: string,
  ): Promise<{ positive: string[]; negative: string[] }> {
    if (!worker || !_state.is_ready) return { positive: [], negative: [] };

    const prompt = `Generate up to 5 positive examples (values that MATCH) and up to 5 negative examples (values that do NOT match) for the regex pattern "${pattern}" with flags "${flags}". Respond as JSON: {"positive": ["..."], "negative": ["..."]}`;

    try {
      // Send a one-off generation to the worker
      _state.is_streaming = true;
      _state.streaming_text = '';
      postToWorker({
        type: 'generate',
        messages: [
          { role: 'system', content: 'You generate regex test examples. Respond with valid JSON only.' },
          { role: 'user', content: prompt },
        ],
        params: {
          max_new_tokens: 256,
          temperature: 0.5,
          top_p: 0.9,
          repetition_penalty: 1.1,
          do_sample: true,
        },
      });

      await new Promise<void>((resolve) => {
        const check = () => {
          if (!_state.is_streaming) resolve();
          else setTimeout(check, 50);
        };
        setTimeout(check, 50);
      });

      const responseText = _state.streaming_text;
      const parsed = JSON.parse(responseText);
      return {
        positive: Array.isArray(parsed.positive) ? parsed.positive.slice(0, 5) : [],
        negative: Array.isArray(parsed.negative) ? parsed.negative.slice(0, 5) : [],
      };
    } catch {
      return { positive: [], negative: [] };
    } finally {
      _state.is_streaming = false;
      _state.streaming_text = '';
    }
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
    // Clear the pending load timeout so it doesn't fire after cancel.
    pending_load_resolver = null;
    pending_load_rejecter = null;
    // Stop the VRAM timer if running.
    if (vram_interval_id) { clearInterval(vram_interval_id); vram_interval_id = null; }
    vram_start_time = 0;
    // Destroy the worker — this aborts any in-flight fetch/pipeline.
    await destroyWorker();
    // Reset load state but keep error visible so the chat frame shows it.
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
    init,
    switchModel,
    sendMessage,
    applyChoice,
    testRegex,
    generateExamples,
    clearConversation,
    interrupt,
    cancelLoad,
    dispose,
  };
}
