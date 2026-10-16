import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ai_models: {
    ensureLoaded: vi.fn(async () => undefined),
    getModelByModelId: vi.fn(),
    getCatalogModelByModelId: vi.fn(),
  },
  api_fetch: vi.fn(),
}));

vi.mock('$lib/composables/useAiModels.svelte', () => ({
  useAiModels: () => mocks.ai_models,
}));
vi.mock('$lib/api', () => ({ apiFetch: mocks.api_fetch }));

import { useAiAssistant } from '$lib/components/ui/smart-ai/use-ai-assistant.svelte';

type WorkerMessage = { type: string; [key: string]: unknown };
type WorkerEvent = { data: unknown; message?: string };
type GenerationResult = { text: string } | { error: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class FakeWorker {
  readonly generated_messages: Array<WorkerMessage> = [];
  max_concurrent_generations = 0;
  private active_generations = 0;
  private readonly listeners = new Map<string, Set<(event: WorkerEvent) => void>>();
  private readonly results: GenerationResult[];

  constructor(results: GenerationResult[]) {
    this.results = [...results];
  }

  addEventListener(type: string, listener: (event: WorkerEvent) => void): void {
    const group = this.listeners.get(type) ?? new Set();
    group.add(listener);
    this.listeners.set(type, group);
  }

  removeEventListener(type: string, listener: (event: WorkerEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(message: WorkerMessage): void {
    if (message.type === 'check') {
      queueMicrotask(() => this.emit('message', { type: 'webgpu', available: true }));
      return;
    }
    if (message.type === 'load') {
      queueMicrotask(() =>
        this.emit('message', {
          type: 'load_complete',
          model_id: message.model_id,
          dtype: message.dtype,
          device: 'webgpu',
          worker_nonce: 'test-worker',
          vram_bytes: null,
        }),
      );
      return;
    }
    if (message.type === 'invalidate_cache' || message.type === 'reset') return;
    if (message.type === 'dispose') {
      queueMicrotask(() => this.emit('message', { type: 'dispose_complete' }));
      return;
    }
    if (message.type !== 'generate') return;

    this.generated_messages.push(message);
    this.active_generations++;
    this.max_concurrent_generations = Math.max(
      this.max_concurrent_generations,
      this.active_generations,
    );
    const result = this.results.shift() ?? { text: 'generated answer' };
    queueMicrotask(() => {
      if ('error' in result) {
        this.emit('message', { type: 'stream_error', error: result.error });
      } else {
        this.emit('message', { type: 'stream', token: result.text });
        this.emit('message', { type: 'stream_complete', text: result.text });
      }
      this.emit('message', { type: 'generation_idle' });
      this.active_generations--;
    });
  }

  terminate(): void {}

  private emit(type: string, data: unknown): void {
    if (type !== 'message') return;
    const event: WorkerEvent = { data };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const MODEL_ID = 'test/model#q4f16';

function createAssistant(
  worker: FakeWorker,
  hooks: Parameters<typeof useAiAssistant>[1],
) {
  class WorkerStub {
    constructor() {
      return worker as unknown as WorkerStub;
    }
  }
  vi.stubGlobal('Worker', WorkerStub);
  return useAiAssistant(MODEL_ID, hooks);
}

async function loadAssistant(ai: ReturnType<typeof useAiAssistant>): Promise<void> {
  await ai.init();
  expect(ai.state.is_ready).toBe(true);
}

describe('useAiAssistant serialized turn/preflight lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ai_models.getModelByModelId.mockReturnValue({
      model_id: 'test/model',
      dtype: 'q4f16',
      temperature: 0,
      top_p: 0.9,
      max_tokens: 64,
      repetition_penalty: 1.1,
      enable_thinking: false,
      execution_config: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the turn busy while a serialized preflight runs, then sends the transformed content', async () => {
    const worker = new FakeWorker([
      { text: '{"query":"admin users","keywords":["admin","user"]}' },
      { text: 'Grounded answer.' },
    ]);
    const transform_started = deferred<void>();
    const release_transform = deferred<void>();
    let ai!: ReturnType<typeof useAiAssistant>;
    ai = createAssistant(worker, {
      build_system_prompt: () => 'guide system prompt',
      transform_user_content: async (text, ctx) => {
        transform_started.resolve();
        const rewrite = await ctx.generate_preflight('rewrite prompt', text, {
          max_new_tokens: 128,
          temperature: 0,
        });
        await release_transform.promise;
        return `DOCUMENTATION EXCERPTS for ${rewrite}\n\nUSER QUESTION: ${text}`;
      },
    });
    await loadAssistant(ai);

    const sending = ai.sendMessage('come rendo admin un utente?');
    await transform_started.promise;
    await vi.waitFor(() => expect(worker.generated_messages).toHaveLength(1));
    expect(ai.state.is_streaming).toBe(true);
    expect(ai.state.ai_status).toBe('thinking');
    expect(ai.state.messages).toHaveLength(1);
    expect(ai.state.messages[0].display_content).toBe('come rendo admin un utente?');
    expect(worker.max_concurrent_generations).toBe(1);

    release_transform.resolve();
    await sending;

    expect(worker.generated_messages).toHaveLength(2);
    expect(worker.max_concurrent_generations).toBe(1);
    expect(worker.generated_messages[1].messages).toEqual([
      { role: 'system', content: 'guide system prompt' },
      {
        role: 'user',
        content:
          'DOCUMENTATION EXCERPTS for {"query":"admin users","keywords":["admin","user"]}\n\nUSER QUESTION: come rendo admin un utente?',
      },
    ]);
    expect(ai.state.is_streaming).toBe(false);
    expect(ai.state.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(ai.state.messages[1].content).toBe('Grounded answer.');
    await ai.dispose();
  });

  it('keeps synchronous transforms and structured choices unchanged', async () => {
    const worker = new FakeWorker([{ text: 'candidate' }]);
    const ai = createAssistant(worker, {
      build_system_prompt: () => 'system',
      transform_user_content: (text) => `Current value: ${text}`,
      process_response: (content) => ({ content, choices: [{ value: content }] }),
    });
    await loadAssistant(ai);

    await ai.sendMessage('change it');

    expect(worker.generated_messages).toHaveLength(1);
    expect(worker.generated_messages[0].messages).toEqual([
      { role: 'system', content: 'system' },
      { role: 'user', content: 'Current value: change it' },
    ]);
    expect(ai.state.messages[1].choices).toEqual([{ value: 'candidate' }]);
    expect(ai.state.pending_choices).toEqual([{ value: 'candidate' }]);
    expect(ai.state.is_streaming).toBe(false);
    await ai.dispose();
  });

  it('uses exact raw model output in the next turn after rendering a parsed answer', async () => {
    const raw_model_output = '{"answer_markdown":"**Visible answer**","actions":[]}';
    const worker = new FakeWorker([{ text: raw_model_output }, { text: 'Next answer.' }]);
    const ai = createAssistant(worker, {
      build_system_prompt: () => 'system',
      process_response: (raw) => ({
        content: '**Visible answer**',
        model_content: raw,
      }),
    });
    await loadAssistant(ai);

    await ai.sendMessage('first question');
    await ai.sendMessage('second question');

    expect(ai.state.messages[1].content).toBe('**Visible answer**');
    expect(ai.state.messages[1].model_content).toBe(raw_model_output);
    expect(worker.generated_messages[1].messages).toEqual([
      { role: 'system', content: 'system' },
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: raw_model_output },
      { role: 'user', content: 'second question' },
    ]);
    await ai.dispose();
  });

  it('retains the user message and skips final generation when async preflight fails', async () => {
    const worker = new FakeWorker([]);
    const ai = createAssistant(worker, {
      build_system_prompt: () => 'system',
      transform_user_content: async () => {
        throw new Error('documentation search failed');
      },
    });
    await loadAssistant(ai);

    await ai.sendMessage('question');

    expect(worker.generated_messages).toHaveLength(0);
    expect(ai.state.messages).toHaveLength(1);
    expect(ai.state.messages[0].content).toBe('question');
    expect(ai.state.error).toBe('documentation search failed');
    expect(ai.state.is_streaming).toBe(false);
    await ai.dispose();
  });

  it('appends a deterministic local response without invoking the model', async () => {
    const worker = new FakeWorker([]);
    const ai = createAssistant(worker, {
      build_system_prompt: () => 'system',
      transform_user_content: async () => ({
        kind: 'local_response',
        response: { content: 'Non lo so.' },
      }),
    });
    await loadAssistant(ai);

    await ai.sendMessage('question outside the indexed docs');

    expect(worker.generated_messages).toHaveLength(0);
    expect(ai.state.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(ai.state.messages[1].content).toBe('Non lo so.');
    expect(ai.state.is_streaming).toBe(false);
    await ai.dispose();
  });

  it('continues to reject public one-off generation while a user turn is busy', async () => {
    const worker = new FakeWorker([{ text: 'final answer' }]);
    const transform_started = deferred<void>();
    const release_transform = deferred<void>();
    const ai = createAssistant(worker, {
      build_system_prompt: () => 'system',
      transform_user_content: async (text) => {
        transform_started.resolve();
        await release_transform.promise;
        return text;
      },
    });
    await loadAssistant(ai);

    const sending = ai.sendMessage('question');
    await transform_started.promise;
    expect(await ai.generateOneOff('one-off system', 'must not overlap')).toBe('');
    expect(worker.generated_messages).toHaveLength(0);

    release_transform.resolve();
    await sending;
    expect(worker.generated_messages).toHaveLength(1);
    expect(worker.max_concurrent_generations).toBe(1);
    await ai.dispose();
  });
});
