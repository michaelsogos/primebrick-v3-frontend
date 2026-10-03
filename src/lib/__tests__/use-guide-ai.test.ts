import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  search_docs: vi.fn(),
  routes_census: vi.fn(),
  hooks: null as unknown,
  ai: {
    state: { is_ready: true, is_streaming: false },
    tunings: [],
    selected_tuning: null,
    effective_params: {},
    download_mbs: 0,
    download_mbps: 0,
    setTuning: vi.fn(),
    init: vi.fn(),
    switchModel: vi.fn(),
    sendMessage: vi.fn(),
    applyChoice: vi.fn(),
    resolveChoice: vi.fn(),
    addLocalAssistantMessage: vi.fn(),
    addLocalUserMessage: vi.fn(),
    setError: vi.fn(),
    generateOneOff: vi.fn(),
    clearConversation: vi.fn(),
    interrupt: vi.fn(),
    cancelLoad: vi.fn(),
    dispose: vi.fn(async () => undefined),
  },
}));

vi.mock('$app/state', () => ({ page: { url: { pathname: '/system/settings/users' } } }));
vi.mock('$lib/i18n', () => ({
  t: {
    subscribe: (callback: (translate: (key: string) => string) => void) => {
      callback(() => 'Non lo so: la documentazione non contiene informazioni sufficienti.');
      return () => undefined;
    },
  },
}));
vi.mock('$lib/api', () => ({
  searchDocs: mocks.search_docs,
  fetchRoutesCensus: mocks.routes_census,
}));
vi.mock('$lib/shell/modules-shell.svelte', () => ({
  shellNav: { resolveModuleFromRoute: () => null, modules: [] },
}));
vi.mock('$lib/components/ui/smart-ai/use-ai-assistant.svelte', () => ({
  useAiAssistant: (_model_id: string, hooks: unknown) => {
    mocks.hooks = hooks;
    return mocks.ai;
  },
}));

import { useGuideAi } from '$lib/components/ui/smart-guide/use-guide-ai.svelte';

interface EmbedWorkerEvent {
  data: {
    type: string;
    seq?: number;
    embedding?: number[];
  };
}

class EmbedWorkerStub {
  private readonly listeners = new Map<string, Set<(event: EmbedWorkerEvent) => void>>();

  addEventListener(type: string, listener: (event: EmbedWorkerEvent) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  postMessage(message: { type: string; seq?: number }): void {
    if (message.type !== 'embed') return;
    queueMicrotask(() => {
      for (const listener of this.listeners.get('message') ?? []) {
        listener({
          data: { type: 'embed_result', seq: message.seq, embedding: Array(384).fill(0.25) },
        });
      }
    });
  }

  terminate(): void {}
}

function getTransform() {
  return (mocks.hooks as {
    transform_user_content: (
      text: string,
      context: {
        messages: unknown[];
        exec_config: null;
        generate_preflight: (
          system_prompt: string,
          user_prompt: string,
          params?: { max_new_tokens?: number; temperature?: number; top_p?: number; repetition_penalty?: number },
        ) => Promise<string>;
      },
    ) => Promise<string | { kind: 'local_response'; response: { content: string } }>;
  }).transform_user_content;
}

function getProcessResponse() {
  return (mocks.hooks as {
    process_response: (
      raw: string,
      regenerate: (extra_user_content: string) => Promise<string>,
    ) => Promise<{
      content: string;
      model_content?: string;
      actions?: unknown[];
      sources?: Array<{ path: string }>;
    }>;
  }).process_response;
}

/** Preflight stub: decompose stage gets JSON queries; coverage stage passes. */
function stubPreflight(decomposeJson: string) {
  return vi.fn(async (system_prompt: string) =>
    system_prompt.includes('decompose') ? decomposeJson : '{"sufficient":true}',
  );
}

describe('useGuideAi RAG preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.routes_census.mockResolvedValue([
      { route: '/system/settings/users', kind: 'list', module: 'settings', entity: 'user_profiles' },
      { route: '/system/settings/users/create', kind: 'create', module: 'settings', entity: 'user_profiles' },
    ]);
    mocks.search_docs.mockResolvedValue([
      {
        id: 1,
        repo: 'backend',
        path: 'backend/guide/rbac.mdx',
        title: 'RBAC',
        chunk_idx: 4,
        content: 'Default role administrators has admin privileges. Open /system/settings/users to edit user roles.',
        metadata: {},
        similarity: 0.61,
        keyword_hits: 2,
        score: 0.71,
      },
    ]);
    vi.stubGlobal('Worker', EmbedWorkerStub);
  });

  afterEach(async () => {
    await mocks.ai.dispose();
    vi.unstubAllGlobals();
  });

  it('passes decomposed queries and literal keywords to standard docs search', async () => {
    const guide = useGuideAi('model#q4f16');
    const generate_preflight = stubPreflight(
      '{"queries":["assign administrator role to user"],"keywords":["administrators","user_profile"],"lang":"it"}',
    );

    const transformed = await getTransform()('come rendo admin un utente?', {
      messages: [],
      exec_config: null,
      generate_preflight,
    });

    expect(mocks.search_docs).toHaveBeenCalledOnce();
    expect(mocks.search_docs.mock.calls[0][0]).toMatchObject({
      keywords: ['administrators', 'user_profile'],
      limit: 4,
    });
    expect(mocks.search_docs.mock.calls[0][0].embedding).toHaveLength(384);
    expect(transformed).toContain('Default role administrators');
    await guide.dispose();
  });

  it('selects actions from the census via the regenerate stage', async () => {
    const guide = useGuideAi('model#q4f16');
    await getTransform()('come rendo admin un utente?', {
      messages: [],
      exec_config: null,
      generate_preflight: stubPreflight('{"queries":["make user administrator"],"keywords":["user"]}'),
    });
    const raw = JSON.stringify({
      answer_markdown: 'Open **Users** and assign the administrators role.',
      actions: [],
    });
    const regenerate = vi.fn(async () =>
      JSON.stringify({
        actions: [
          { kind: 'navigate', route: '/system/settings/users', label: 'Apri Utenti' },
          { kind: 'navigate', route: '/not-in-census', label: 'fake' },
        ],
      }),
    );

    const response = await getProcessResponse()(raw, regenerate);

    expect(response.content).toBe('Open **Users** and assign the administrators role.');
    expect(response.model_content).toBe(raw);
    // Only the census-declared route survives; the invented one is dropped.
    expect(response.actions).toEqual([
      { kind: 'navigate', route: '/system/settings/users', label: 'Apri Utenti' },
    ]);
    expect(response.sources?.[0].path).toBe('backend/guide/rbac.mdx');
    await guide.dispose();
  });

  it('returns a deterministic local no-knowledge response without answer generation', async () => {
    mocks.search_docs.mockResolvedValue([]);
    const guide = useGuideAi('model#q4f16');

    const transformed = await getTransform()('domanda fuori documentazione', {
      messages: [],
      exec_config: null,
      generate_preflight: stubPreflight('{"queries":["unknown subject"],"keywords":[]}'),
    });

    expect(transformed).toMatchObject({
      kind: 'local_response',
      response: { content: 'Non lo so: la documentazione non contiene informazioni sufficienti.' },
    });
    expect(mocks.ai.sendMessage).not.toHaveBeenCalled();
    await guide.dispose();
  });

  it('falls back to the raw question when decompose output is malformed', async () => {
    const guide = useGuideAi('model#q4f16');
    const transformed = await getTransform()('domanda in italiano', {
      messages: [],
      exec_config: null,
      generate_preflight: stubPreflight('not-json'),
    });
    // Decompose failure degrades gracefully: the raw text becomes the query.
    expect(mocks.search_docs).toHaveBeenCalledOnce();
    expect(transformed).toContain('Default role administrators');
    await guide.dispose();
  });

  it('fails closed when docs search is unavailable', async () => {
    mocks.search_docs.mockRejectedValueOnce(new Error('HTTP 500'));
    const guide = useGuideAi('model#q4f16');

    await expect(
      getTransform()('come creo un utente?', {
        messages: [],
        exec_config: null,
        generate_preflight: stubPreflight('{"queries":["create user"],"keywords":["user"]}'),
      }),
    ).rejects.toThrow('Documentation retrieval failed: HTTP 500');
    expect(mocks.ai.sendMessage).not.toHaveBeenCalled();
    await guide.dispose();
  });
});
