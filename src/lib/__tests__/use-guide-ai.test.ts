import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  search_docs: vi.fn(),
  fetch_doc: vi.fn(),
  module_translations: vi.fn(),
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
vi.mock('$lib/i18n/store.svelte', () => ({
  uiLang: {
    subscribe: (callback: (lang: string) => void) => {
      callback('it');
      return () => undefined;
    },
  },
}));
vi.mock('$lib/api', () => ({
  searchDocs: mocks.search_docs,
  fetchDoc: mocks.fetch_doc,
  fetchModuleTranslations: mocks.module_translations,
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
        generate_agent: (
          messages: Array<{ role: string; content: string }>,
          params?: { tools?: unknown[]; max_new_tokens?: number; temperature?: number },
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

/**
 * Scripted `generate_agent` — the retrieval loop is model-driven: every call
 * pops the next scripted reply. ReAct-classic dialect lines are parsed by
 * `parseToolCalls` (`Action: <tool>` + `Action Input: <json>`); plain text
 * (`DONE` / `NO_MATCH` / JSON) terminates or feeds the answer stages.
 */
function stubAgent(script: string[]) {
  const queue = [...script];
  return vi.fn(async () => queue.shift() ?? 'DONE');
}

const SEARCH_HIT = {
  id: 1,
  repo: 'frontend',
  path: 'frontend/guide/manual/rbac.mdx',
  title: 'RBAC',
  chunk_idx: 4,
  content: 'Default role administrators has admin privileges. Open /system/settings/users to edit user roles.',
  metadata: { entity: 'user_profiles' },
  similarity: 0.95,
  keyword_hits: 2,
  score: 0.96,
};

const FETCHED_DOC = {
  repo: 'frontend',
  path: 'frontend/guide/manual/rbac.mdx',
  title: 'RBAC',
  content: 'Default role administrators has admin privileges. Open /system/settings/users to edit user roles.',
  metadata: { entity: 'user_profiles' },
};

const SUCCESS_SCRIPT = [
  'Action: docs_search\nAction Input: {"query":"assign administrator role to user","keywords":["administrators","user_profile"]}',
  'Action: docs_fetch\nAction Input: {"path":"frontend/guide/manual/rbac.mdx"}',
  'DONE',
  '{"answer_markdown":"Default role administrators has admin privileges."}',
  '{"actions":[{"kind":"navigate","route":"/system/settings/users","label":"Apri Utenti"}]}',
];

function makeCtx(generate_agent: ReturnType<typeof stubAgent>) {
  return {
    messages: [],
    exec_config: null,
    generate_preflight: vi.fn(async () => '{"sufficient":true}'),
    generate_agent,
  };
}

describe('useGuideAi RAG preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.routes_census.mockResolvedValue([
      { route: '/system/settings/users', kind: 'list', module: 'settings', entity: 'user_profiles' },
      { route: '/system/settings/users/create', kind: 'create', module: 'settings', entity: 'user_profiles' },
    ]);
    mocks.search_docs.mockResolvedValue([SEARCH_HIT]);
    mocks.fetch_doc.mockResolvedValue(FETCHED_DOC);
    mocks.module_translations.mockResolvedValue({});
  });

  afterEach(async () => {
    await mocks.ai.dispose();
    vi.unstubAllGlobals();
  });

  it('runs the agent loop: docs_search with keywords, docs_fetch, then final answer', async () => {
    const guide = useGuideAi('model#q4f16');
    const generate_agent = stubAgent(SUCCESS_SCRIPT);

    const transformed = await getTransform()('come rendo admin un utente?', makeCtx(generate_agent));

    expect(mocks.search_docs).toHaveBeenCalledOnce();
    expect(mocks.search_docs.mock.calls[0][0]).toMatchObject({
      query: 'assign administrator role to user',
      keywords: ['administrators', 'user_profile'],
      limit: 12,
      path_prefix: 'frontend/guide/',
    });
    expect(mocks.fetch_doc).toHaveBeenCalledOnce();
    expect(mocks.fetch_doc.mock.calls[0][0]).toMatchObject({ path: 'frontend/guide/manual/rbac.mdx' });
    expect(transformed).toMatchObject({
      kind: 'local_response',
      response: {
        content: 'Default role administrators has admin privileges.',
        actions: [{ kind: 'navigate', route: '/system/settings/users', label: 'Apri Utenti' }],
        sources: [{ path: 'frontend/guide/manual/rbac.mdx' }],
      },
    });
    await guide.dispose();
  });

  it('selects actions from the census via the regenerate stage', async () => {
    const guide = useGuideAi('model#q4f16');
    await getTransform()('come rendo admin un utente?', makeCtx(stubAgent(SUCCESS_SCRIPT)));
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
    expect(response.sources?.[0].path).toBe('frontend/guide/manual/rbac.mdx');
    await guide.dispose();
  });

  it('returns a deterministic local no-knowledge response when the agent finds no coverage', async () => {
    mocks.search_docs.mockResolvedValue([]);
    const guide = useGuideAi('model#q4f16');

    const transformed = await getTransform()(
      'domanda fuori documentazione',
      makeCtx(stubAgent([
        'Action: docs_search\nAction Input: {"query":"unknown subject"}',
        'NO_MATCH',
      ])),
    );

    expect(transformed).toMatchObject({
      kind: 'local_response',
      response: { content: 'Non lo so: la documentazione non contiene informazioni sufficienti.' },
    });
    expect(mocks.ai.sendMessage).not.toHaveBeenCalled();
    await guide.dispose();
  });

  it('falls back to a seed search on the raw question when the agent ends turn 0 without tools', async () => {
    const guide = useGuideAi('model#q4f16');
    // The model emits plain prose immediately — no tool call — so the
    // deterministic seed search on the RAW question must still run.
    const transformed = await getTransform()('domanda in italiano', makeCtx(stubAgent(['DONE'])));

    expect(mocks.search_docs).toHaveBeenCalledOnce();
    // Seed search uses the raw question text, not a decomposed query.
    expect(mocks.search_docs.mock.calls[0][0].query).toBe('domanda in italiano');
    expect(transformed).toMatchObject({
      kind: 'local_response',
      response: { content: 'Non lo so: la documentazione non contiene informazioni sufficienti.' },
    });
    await guide.dispose();
  });

  it('fails closed when docs search is unavailable', async () => {
    mocks.search_docs.mockRejectedValueOnce(new Error('HTTP 500'));
    const guide = useGuideAi('model#q4f16');

    await expect(
      getTransform()(
        'come creo un utente?',
        makeCtx(stubAgent([
          'Action: docs_search\nAction Input: {"query":"create user"}',
        ])),
      ),
    ).rejects.toThrow('Documentation retrieval failed: HTTP 500');
    expect(mocks.ai.sendMessage).not.toHaveBeenCalled();
    await guide.dispose();
  });
});
