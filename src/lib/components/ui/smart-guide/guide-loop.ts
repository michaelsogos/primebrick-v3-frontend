/**
 * guide-loop — model-driven agentic retrieval loop for the Guide assistant.
 *
 * The MODEL drives retrieval via native chat-template tool calls
 * (`<tool_call>{name,arguments}</tool_call>` — bare-JSON dialect also
 * parsed); this module only executes and feeds results back:
 *
 *   agent turn  — generate_agent(messages, tools) → tool_call? → execute
 *                 (docs_search / docs_fetch / list_routes) → append
 *                 {assistant, tool} messages → repeat until the model
 *                 emits text (bounded by max_agent_turns/max_agent_calls)
 *   (S3 answer  — runs as the MAIN streaming generation on the collected
 *                excerpts, outside this file)
 *   S4 actions  — selection from a deterministic candidate set (route
 *                 census), output validated against the census
 *
 * Tool-call parse failures degrade gracefully — a non-call output ends
 * the loop and the answer composes from whatever evidence was gathered.
 */
import type { TransformContext } from '$lib/components/ui/smart-ai/ai-assistant.types';
import type { AiAction, AiSource } from '$lib/components/ui/smart-ai/ai-assistant.types';
import { searchDocs, fetchRoutesCensus, fetchDoc, type CensusRoute } from '$lib/api';

/** Loop knobs — all overridable per cerebellum tuning via execution_config
 *  keys of the same name; values below are the built-in defaults. The
 *  preflight stages (S0/S2) are deliberately pinned to temperature 0 and
 *  short outputs: they emit closed-space JSON and must stay deterministic
 *  even when the answer generation (S3/S4) is tuned for creativity. */
export interface GuideLoopConfig {
  /** Chunks injected as DOCUMENTATION EXCERPTS into S3. */
  max_context_chunks: number;
  /** Per-chunk excerpt cap in the S3 block. */
  max_chunk_chars: number;
  /** Excerpt preview size shown to the S2 inspect stage — enough to judge
   *  coverage on content, small enough to keep the preflight prompt cheap. */
  inspect_chunk_chars: number;
  /** S2 deepening rounds before giving up. */
  max_retrieval_iterations: number;
  /** Action cap enforced both in the S4 prompt and the validator. */
  max_actions: number;
  /** Preflight (S0/S2) generation temperature — JSON stages stay greedy. */
  preflight_temperature: number;
  /** Preflight (S0/S2) output budget. */
  preflight_max_tokens: number;
  /** S0 query cap — the prompt already says "max 3". */
  max_queries: number;
  /** S0 keyword cap passed to the search boost. */
  max_keywords: number;
  /** Chunks shown to the S2 inspect stage (preview digest). */
  inspect_digest_size: number;
  /** S2 follow-up search cap per iteration. */
  max_searches: number;
  /** Agent-loop generation rounds (each may emit ≤2 tool calls). */
  max_agent_turns: number;
  /** Hard cap on tool executions per user question. */
  max_agent_calls: number;
}

const LOOP_DEFAULTS: GuideLoopConfig = {
  max_context_chunks: 4,
  max_chunk_chars: 1500,
  inspect_chunk_chars: 350,
  max_retrieval_iterations: 2,
  max_actions: 3,
  preflight_temperature: 0,
  preflight_max_tokens: 160,
  max_queries: 3,
  max_keywords: 8,
  inspect_digest_size: 6,
  max_searches: 3,
  max_agent_turns: 4,
  max_agent_calls: 6,
};

function resolveLoopConfig(exec_config: Record<string, any> | null): GuideLoopConfig {
  const num = (key: keyof GuideLoopConfig): number => {
    const v = exec_config?.[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : LOOP_DEFAULTS[key];
  };
  return Object.fromEntries(
    Object.keys(LOOP_DEFAULTS).map((k) => [k, num(k as keyof GuideLoopConfig)]),
  ) as unknown as GuideLoopConfig;
}

/** Lightweight per-stage telemetry — same observability pattern as the
 *  composable's [ai-raw]; captured by the parity e2e spec. */
function stageLog(stage: string, data: Record<string, unknown>): void {
  console.debug(`[guide-loop] ${stage}`, JSON.stringify(data));
}

/** Runs fn and logs its wall time + result under [guide-loop]. */
async function timed<T>(stage: string, fn: () => Promise<T>, extra?: (v: T) => Record<string, unknown>): Promise<T> {
  const t0 = performance.now();
  const value = await fn();
  stageLog(stage, { ms: Math.round(performance.now() - t0), ...(extra?.(value) ?? {}) });
  return value;
}

export interface GuideLoopDeps {
  embed: (text: string) => Promise<number[]>;
}

export interface GuideLoopResult {
  found: boolean;
  block: string;
  sources: AiSource[];
  /** Original user text — reused by the S4 action-selection stage. */
  question: string;
  /** Route candidates offered to the action-selection stage. */
  route_candidates: CensusRoute[];
  /** Cerebellum-resolved action cap for the S4 stage. */
  max_actions: number;
}

interface DocHit {
  repo: string;
  path: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  similarity: number;
  score: number;
  /** Structural hit from doc-graph expansion — bypasses the similarity floor. */
  graph_expanded?: boolean;
  /** Lexical-only recall (strong FTS match) — bypasses the similarity floor. */
  lexical_match?: boolean;
}

const AGENT_SYSTEM = `/no_think
You are the Primebrick documentation research agent. The user asked a
question about the application. Your ONLY job is to GATHER evidence —
another agent writes the final answer from what you collect.

You must be empirical and deep-dive before concluding. A single search
result is almost never enough evidence.

Mandatory workflow — follow the sequence EXACTLY:
1. FIRST response: a docs_search call. The query argument MUST be in
   English — translate the question's intent, never pass the user's words
   verbatim (the docs are English).
2. SECOND response: a docs_fetch call on the most relevant doc path from
   the search results. This step is REQUIRED — excerpts alone are never
   enough evidence. If the first search returned only irrelevant paths,
   call docs_search again with a different English query instead.
3. THIRD response: read the fetched page. CHECK the entity field and the
   content: if the page is about a different subject than the question, it
   was the wrong pick — go back to step 1 with a different English query.
   For "what is X" questions, a second docs_search with an explanatory
   query (e.g. "X definition", "X meaning") is REQUIRED — never settle on
   the literal term alone.
4. If the fetched page fully answers the question, say DONE. Otherwise
   keep gathering: another docs_fetch on a related path, or another
   docs_search for missing details. Two or three fetches are normal.
5. Prefer pages under frontend/guide/manual/ — they are the user guide.
   backend/guide/ and api/ pages are developer references: fetch them only
   when no manual page covers the question.
6. Call list_routes only if you need the list of app pages.

The single word DONE is FORBIDDEN until you have received at least one
docs_fetch result. After a search you are NOT done — you must fetch.
If searches keep returning only unrelated topics, do NOT fetch irrelevant
pages — say DONE (that means "nothing useful found").

Never answer the user's question yourself. Never describe what you found.
Every response is either ONE tool call or the word DONE.`;

const AGENT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'docs_search',
      description:
        'Search the Primebrick user-guide documentation. Returns ranked excerpts with doc paths you can open via docs_fetch.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'English search query' },
          keywords: {
            type: 'array',
            items: { type: 'string' },
            description: 'Literal identifiers/config keys, exact casing',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'docs_fetch',
      description:
        'Fetch the full text of a documentation page by path (e.g. manual/users). Use after docs_search when an excerpt is not enough.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Doc path from search results' },
          repo: { type: 'string', description: 'Optional repo qualifier from search results' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_routes',
      description: 'List the application pages (routes) the user can navigate to.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

/** Multi-dialect tool-call parser — the Qwen chat template instructs
 *  `<tool_call>{json}</tool_call>` but small variants often emit the bare
 *  `{name, arguments}` JSON with no wrapper, or several calls in one turn. */
function parseToolCalls(raw: string): Array<{ name: string; arguments: Record<string, unknown> }> {
  const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  const wrapped = raw.match(/<tool_call>\s*([\s\S]*?)(?:<\/tool_call>|$)/gi);
  const bodies: string[] = wrapped?.length
    ? wrapped.map((w) => w.replace(/<\/?tool_call>/gi, ''))
    : [raw];
  for (const body of bodies) {
    const j = parseJson<{ name?: unknown; arguments?: unknown }>(body);
    if (j && typeof j.name === 'string') {
      calls.push({
        name: j.name,
        arguments:
          typeof j.arguments === 'object' && j.arguments !== null
            ? (j.arguments as Record<string, unknown>)
            : {},
      });
    }
  }
  if (calls.length) return calls;
  // Shorthand dialect (fp16 quirk): the model emits `docs_search "query"`
  // or `docs_fetch(path)` — natural-language call syntax, no JSON. Map the
  // single argument onto the tool's required parameter.
  const SHORTHAND_ARG: Record<string, string> = {
    docs_search: 'query',
    docs_fetch: 'path',
    list_routes: '',
  };
  // Observed shorthand forms (WebGPU): `docs_search "q"`, `docs_search(q)`,
  // `docs_search: "q"`, `docs_search(query="q")` — name, a `:`/`(`/space
  // separator, then a bare or key=value argument.
  const m = raw.trim().match(/^(\w+)\s*([\s\S]*)$/);
  if (m && m[1] in SHORTHAND_ARG) {
    const argName = SHORTHAND_ARG[m[1]];
    let rest = (m[2] ?? '').replace(/^[:(\s]+/, '').replace(/[\)\s]+$/, '');
    const kv = rest.match(/^(\w+)\s*=\s*["'`]([\s\S]*?)["'`]?$/);
    const value = (kv ? kv[2] : rest.replace(/^["'`]|["'`]$/g, '')).trim();
    calls.push({ name: m[1], arguments: argName && value ? { [argName]: value } : {} });
  }
  return calls;
}


function parseJson<T>(raw: string): T | null {
  try {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

/**
 * Runs S0–S2 inside the active turn. Throws on infra failure (embed/search)
 * — the Guide never answers without real excerpts. Returns the excerpts
 * block + citation sources + the route census candidates for S4.
 */
export async function runGuideRetrievalLoop(
  text: string,
  ctx: Pick<TransformContext, 'generate_preflight' | 'generate_agent' | 'exec_config'>,
  deps: GuideLoopDeps,
  minSimilarity: number,
): Promise<GuideLoopResult> {
  const cfg = resolveLoopConfig(ctx.exec_config);
  // Route census is fetched in parallel with the first agent turn.
  const censusPromise = fetchRoutesCensus().catch(() => [] as CensusRoute[]);

  const seen = new Set<string>();
  const fetchedPaths = new Set<string>();
  /** Entities surfaced by docs_search hits — the relevance yardstick a
   *  fetched doc is checked against before becoming a primary source. */
  const searchEntities = new Set<string>();
  /** Fetched path → declared entity (undefined when the doc has none). */
  const fetchedEntities = new Map<string, string | undefined>();
  const hits: DocHit[] = [];

  /** docs_search executor — model-driven queries, deterministic ranking. */
  const execSearch = async (query: string, keywords: string[]): Promise<string> => {
    const t0 = performance.now();
    const embedding = await deps.embed(query);
    const rows = await searchDocs({
      embedding,
      keywords: keywords.length ? keywords : undefined,
      // The agent needs a real candidate set to choose a fetch target —
      // limiting to the S3 context budget would hide alternative docs.
      limit: 12,
      min_similarity: minSimilarity,
      keyword_boost: ctx.exec_config?.keyword_boost,
      lexical_boost: ctx.exec_config?.lexical_boost,
      lex_match_min: ctx.exec_config?.lex_match_min,
      oversample: ctx.exec_config?.oversample,
      graph_max_paths: ctx.exec_config?.graph_max_paths,
    });
    // User-guide policy: this assistant answers from the USER GUIDE corpus
    // only — dev/API references (backend/guide, api/, sdk/) are out of
    // scope for UI questions (observed: "RBAC" query pulls the dev doc,
    // and the model always picks the literal title match over the manual
    // page). Product scoping, not a hidden re-rank.
    const guideRows = rows.filter((h) => h.path.startsWith('frontend/guide/'));
    const boosted = guideRows
      .map((h) => ({
        ...h,
        score: h.score + (h.path.startsWith('frontend/guide/manual/') ? 0.25 : 0),
      }))
      .sort((a, b) => b.score - a.score);
    let added = 0;
    for (const h of boosted) {
      // Graph-expanded and strong lexical-recall chunks are structurally/
      // textually related — the similarity floor doesn't apply to them.
      if (seen.has(h.path) || (h.similarity < minSimilarity && !h.graph_expanded && !h.lexical_match)) continue;
      seen.add(h.path);
      hits.push(h as DocHit);
      added++;
      if (typeof h.metadata?.entity === 'string') searchEntities.add(h.metadata.entity);
    }
    searchHitCount += added;
    stageLog('tool_docs_search', {
      ms: Math.round(performance.now() - t0),
      query,
      returned: rows.length,
      new_chunks: added,
      paths: boosted.slice(0, 6).map((h) => `${h.path}#${h.score.toFixed(3)}`),
    });
    // What the model sees: one row per DOCUMENT — 6 chunks of the same file
    // (observed on "RBAC permissions") would hide every alternative doc and
    // take the fetch choice away from the model.
    const digestRows = [];
    const digestSeen = new Set<string>();
    for (const h of boosted) {
      if (digestSeen.has(h.path)) continue;
      digestSeen.add(h.path);
      digestRows.push(h);
      if (digestRows.length >= 12) break;
    }
    return JSON.stringify(
      digestRows.map((h) => ({
        path: h.path,
        repo: h.repo,
        entity: h.metadata?.entity,
        title: h.title,
        // No raw similarity here: the array order IS the ranking — showing
        // the score made the model pick the highest number over the
        // user-guide policy ordering (observed: rbac dev doc over manual).
        excerpt: h.content.slice(0, cfg.inspect_chunk_chars),
      })),
    );
  };

  /** docs_fetch executor — full-document dereference, capped for prompt size. */
  const execFetch = async (path: string, repo?: string): Promise<string> => {
    const t0 = performance.now();
    const doc = await fetchDoc({ path, repo }).catch((e) => ({ error: String(e) }));
    stageLog('tool_docs_fetch', { ms: Math.round(performance.now() - t0), path, found: !!doc && !('error' in doc) });
    if (!doc || 'error' in doc) return JSON.stringify({ error: 'document not found' });
    // Fetched docs count as evidence too — the model explicitly asked for
    // them — and they're flagged so S3 treats them as primary sources.
    fetchedPaths.add(doc.path);
    fetchedEntities.set(doc.path, typeof doc.metadata?.entity === 'string' ? doc.metadata.entity : undefined);
    if (!seen.has(doc.path)) {
      seen.add(doc.path);
      hits.push({
        repo: doc.repo,
        path: doc.path,
        title: doc.title,
        content: doc.content,
        metadata: doc.metadata,
        similarity: 1,
        score: 1,
      });
    }
    const content = doc.content.length > cfg.max_chunk_chars * 2
      ? doc.content.slice(0, cfg.max_chunk_chars * 2) + '\n…[truncated]'
      : doc.content;
    return JSON.stringify({ path: doc.path, title: doc.title, entity: doc.metadata?.entity, content });
  };

  const execRoutes = async (): Promise<string> => {
    const census = await censusPromise;
    return JSON.stringify(census.map((r) => ({ route: r.route, kind: r.kind, entity: r.entity })));
  };

  const executeTool = async (name: string, args: Record<string, unknown>): Promise<string> => {
    if (name === 'docs_search') {
      const query = typeof args.query === 'string' ? args.query : '';
      const kws = Array.isArray(args.keywords) ? args.keywords.filter((k): k is string => typeof k === 'string') : [];
      if (!query.trim()) return JSON.stringify({ error: 'missing query' });
      return execSearch(query, kws.slice(0, cfg.max_keywords));
    }
    if (name === 'docs_fetch') {
      const path = typeof args.path === 'string' ? args.path : '';
      if (!path.trim()) return JSON.stringify({ error: 'missing path' });
      fetchCallCount++;
      return execFetch(path, typeof args.repo === 'string' ? args.repo : undefined);
    }
    if (name === 'list_routes') return execRoutes();
    return JSON.stringify({ error: `unknown tool "${name}"` });
  };

  // ── Agent loop: the MODEL decides what to look up; we only execute. ──
  const messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string }> = [
    { role: 'system', content: AGENT_SYSTEM },
    { role: 'user', content: text },
  ];
  let toolCallsTotal = 0;
  let searchHitCount = 0;
  let fetchCallCount = 0;
  let shallowDoneReprompts = 0;
  try {
    for (let round = 0; round < cfg.max_agent_turns; round++) {
      const raw = await timed(`agent_turn_${round}`, () =>
        ctx.generate_agent(messages, {
          tools: AGENT_TOOLS,
          max_new_tokens: cfg.preflight_max_tokens,
          temperature: cfg.preflight_temperature,
        }),
      );
      const calls = parseToolCalls(raw);
      stageLog('agent_decision', { round, calls: calls.map((c) => c.name), raw_head: raw.slice(0, 120) });
      if (!calls.length) {
        // Premature-done repair (bounded, once): on fp16 the model can emit
        // DONE at turn 0 without ever searching — a verdict on coverage it
        // cannot legitimately make. Reject it and reprompt; if it still
        // refuses, the loop exits and the deterministic seed search runs.
        if (round === 0 && toolCallsTotal === 0) {
          stageLog('agent_premature_done', { raw_head: raw.slice(0, 80) });
          messages.push(
            { role: 'assistant', content: raw },
            { role: 'user', content: 'You have not searched yet. Call docs_search now — never declare coverage before looking.' },
          );
          continue;
        }
        // Shallow-done guard (bounded): the protocol the model agreed to in
        // the system prompt requires opening a page before DONE when search
        // produced hits — the 3B complies intermittently, so the orchestrator
        // enforces the contract once: it never picks WHAT to open, only
        // THAT a page must be opened.
        if (
          fetchCallCount === 0 &&
          searchHitCount > 0 &&
          shallowDoneReprompts < 1 &&
          /^\s*DONE\b/i.test(raw)
        ) {
          shallowDoneReprompts++;
          stageLog('agent_shallow_done', { round });
          messages.push(
            { role: 'assistant', content: raw },
            { role: 'user', content: 'You have search results but have not opened any page. Call docs_fetch on the most relevant path.' },
          );
          continue;
        }
        break; // model emitted text (DONE or an answer) — loop over
      }
      messages.push({ role: 'assistant', content: raw });
      for (const call of calls.slice(0, 2)) {
        if (toolCallsTotal >= cfg.max_agent_calls) break;
        toolCallsTotal++;
        const result = await executeTool(call.name, call.arguments);
        messages.push({ role: 'tool', name: call.name, content: result });
      }
    }
  } catch (e) {
    throw new Error(
      `Documentation retrieval failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Lazy-done guard: the model may emit DONE/text on turn 0 without ever
  // looking (observed on uncovered questions). Declaring "no coverage"
  // without a single real search would risk false negatives on covered
  // questions — run one deterministic seed search on the raw question.
  if (toolCallsTotal === 0 && !hits.length) {
    stageLog('agent_lazy_done', { question: text });
    try {
      await execSearch(text, []);
    } catch (e) {
      throw new Error(
        `Documentation retrieval failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  const census = await censusPromise;

  // Coverage is anchored to docs_search hits only: a docs_fetch can enrich
  // the context but can never CREATE coverage on its own — otherwise an
  // irrelevant page fetched on an uncovered question (observed: "torta" →
  // app-page-layout.mdx) would defeat the no-documentation fallback.
  if (searchHitCount === 0 || !hits.length)
    return { found: false, block: '', sources: [], question: text, route_candidates: census, max_actions: cfg.max_actions };

  hits.sort((a, b) => b.score - a.score);
  // Pages the researcher explicitly fetched are the verified evidence: they
  // lead the S3 block as PRIMARY SOURCE so the answer quotes the right
  // procedure instead of blending sibling excerpts.
  // A fetched doc earns the PRIMARY SOURCE flag only when its declared
  // entity matches what the searches surfaced (or it declares none): a
  // wrong pick (observed: "IDP Code" → components/input.mdx) must not be
  // promoted over the real search evidence.
  const confirmedFetched = new Set(
    [...fetchedPaths].filter((p) => {
      const e = fetchedEntities.get(p);
      return e === undefined || searchEntities.has(e);
    }),
  );
  const scopedEntities = new Set(
    [...confirmedFetched]
      .map((p) => fetchedEntities.get(p))
      .filter((e): e is string => typeof e === 'string'),
  );
  const ordered = [
    ...hits.filter((h) => confirmedFetched.has(h.path)),
    ...hits.filter((h) => !confirmedFetched.has(h.path)),
  ];
  // Entity scoping: once the researcher has opened a doc that declares an
  // entity consistent with the search evidence, sibling excerpts about
  // OTHER entities are noise — the 3B blends their procedures into the
  // answer (observed: "create user" answered with the organizations page).
  const scoped = scopedEntities.size
    ? ordered.filter(
        (h) =>
          confirmedFetched.has(h.path) ||
          (typeof h.metadata?.entity === 'string' && scopedEntities.has(h.metadata.entity)),
      )
    : ordered;
  const block = `DOCUMENTATION EXCERPTS:\n\n${scoped
    .slice(0, cfg.max_context_chunks)
    .map((h, i) => `[${i + 1}]${confirmedFetched.has(h.path) ? ' [PRIMARY SOURCE — full page fetched]' : ''} "${h.title}" (${h.path})\n${h.content.slice(0, cfg.max_chunk_chars)}`)
    .join('\n\n')}`;

  const seenPaths = new Set<string>();
  const sources: AiSource[] = [];
  for (const h of scoped.slice(0, cfg.max_context_chunks)) {
    if (seenPaths.has(h.path)) continue;
    seenPaths.add(h.path);
    sources.push({ repo: h.repo, path: h.path, title: h.title, similarity: h.similarity });
  }

  // S4 candidates are grounded in what was actually retrieved: only routes
  // whose entity is declared by at least one source chunk's metadata. No
  // entity evidence → empty candidate set → deterministically no action,
  // instead of the model picking a salient-but-wrong route every turn.
  const entities = new Set(
    scoped.map((h) => h.metadata?.entity).filter((e): e is string => typeof e === 'string'),
  );
  // Intent gate: `*/create` candidates are only offered on explicit create
  // intent. Deterministic keyword check — no LLM needed; an unknown intent
  // drops create candidates (create routes are the risky mis-picks).
  const intent = /\b(crea|creare|create|new|aggiungi|aggiungere|add|insert|nuov[oaie])\b/i.test(text)
    ? 'create'
    : null;
  const dropCreate = intent !== 'create';
  const route_candidates = entities.size
    ? census.filter(
        (r) => r.entity && entities.has(r.entity) && !(dropCreate && r.kind === 'create'),
      )
    : [];
  stageLog('s4_candidates', { entities: [...entities], intent, candidates: route_candidates.length });

  return { found: true, block, sources, question: text, route_candidates, max_actions: cfg.max_actions };
}

const ACTION_SELECT_PROMPT = (candidates: string, question: string, answer: string, maxActions: number) =>
  `The user asked: ${question}\nYour previous answer was:\n${answer}\n\n` +
  `Now pick app pages the user can navigate to, choosing ONLY from this route list:\n${candidates}\n\n` +
  `Return ONLY one JSON object: {"actions":[{"kind":"navigate","route":"<from list>","label":"<short CTA>"}]}\n` +
  `Max ${maxActions} actions; only routes that help the user ACT on the answer. ` +
  `Pick the route kind matching the question intent: kind "create" is ONLY for making a brand-new record — ` +
  `editing/assigning/configuring an existing one needs list or detail pages, never create. ` +
  `Routes containing [param] are templates — include them only when the target is clearly identifiable. ` +
  `Empty actions array if no route is relevant.`;

/**
 * S4 — action selection. Runs as the turn's second generation round via
 * `regenerate` (process_response hook). The model picks routes from the
 * declared census; every emitted action is then validated against the
 * census — selection, never generation. Both the `{"actions":[...]}` and
 * the full `{"answer_markdown","actions"}` envelope are accepted (the main
 * system prompt keeps pushing the latter shape).
 */
export async function selectActions(
  answer: string,
  question: string,
  candidates: CensusRoute[],
  regenerate: (extra_user_content: string) => Promise<string>,
  maxActions: number = LOOP_DEFAULTS.max_actions,
): Promise<AiAction[]> {
  if (!candidates.length) return [];
  // Group candidates by kind so the model reads the create/detail/list
  // split explicitly instead of skimming a flat list.
  const byKind = new Map<string, string[]>();
  for (const r of candidates) {
    const label = `${r.route}${r.entity ? ` (entity:${r.entity})` : ''}`;
    const group = byKind.get(r.kind) ?? [];
    group.push(label);
    byKind.set(r.kind, group);
  }
  const candidateList = [...byKind.entries()]
    .map(([kind, routes]) => `${kind}:\n${routes.map((r) => `  ${r}`).join('\n')}`)
    .join('\n');
  const raw = await timed('s4_select', () => regenerate(ACTION_SELECT_PROMPT(candidateList, question, answer, maxActions)));
  const parsed = parseJson<{ actions?: unknown }>(raw);
  const list = Array.isArray(parsed?.actions) ? parsed.actions : [];
  const valid = new Set(candidates.map((r) => r.route));
  const actions: AiAction[] = [];
  for (const item of list) {
    if (actions.length >= maxActions) break;
    if (typeof item !== 'object' || item === null) continue;
    const a = item as Record<string, unknown>;
    if (
      a.kind === 'navigate' &&
      typeof a.route === 'string' &&
      valid.has(a.route) &&
      typeof a.label === 'string' &&
      a.label.trim()
    ) {
      actions.push({ kind: 'navigate', route: a.route, label: a.label });
    }
  }
  stageLog('s4_result', { selected: actions.map((a) => (a.kind === 'navigate' ? a.route : a.tool)), rejected: list.length - actions.length });
  return actions;
}
