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
import { searchDocs, fetchRoutesCensus, fetchDoc, fetchModuleTranslations, type CensusRoute } from '$lib/api';
import { parseGuideResponse } from './guide-response';
import { get } from 'svelte/store';
import { uiLang } from '$lib/i18n/store.svelte';

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
  /** Agent-loop ReAct turn budget — Thought must complete AND the Action
   *  must be emitted inside one generation. Not tied to the legacy
   *  preflight stages' tiny JSON budget. */
  agent_max_tokens: number;
  /** Agent-loop generation rounds (each may emit ≤2 tool calls). */
  max_agent_turns: number;
  /** Hard cap on tool executions per user question. */
  max_agent_calls: number;
  /** Total char budget for the S3 context block (excerpts + UI labels).
   *  ORT WebGPU dies when a single prefill exceeds ~3.4k tokens (the
   *  fp32 logits buffer seq×vocab×4 crosses the 2GB storage-buffer limit).
   *  Block + system + history must stay under it — measured empirically:
   *  3582 tok crashes, 3234 tok works. ~8k chars ≈ 1.8k tok of block leaves
   *  headroom for system+history. */
  max_block_chars: number;
}

const LOOP_DEFAULTS: GuideLoopConfig = {
  max_context_chunks: 4,
  max_chunk_chars: 1500,
  inspect_chunk_chars: 350,
  max_retrieval_iterations: 2,
  max_actions: 3,
  preflight_temperature: 0,
  preflight_max_tokens: 384,
  max_queries: 3,
  max_keywords: 8,
  inspect_digest_size: 6,
  max_searches: 3,
  agent_max_tokens: 512,
  max_agent_turns: 4,
  max_agent_calls: 6,
  max_block_chars: 6000,
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
  /** Reserved for future injectable deps (e.g. search override in tests). */
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
  /** In-context answer stage output (Option A collapse): the raw model
   *  emission containing the JSON contract, when it parsed successfully.
   *  When present the caller short-circuits the S3 main generation — the
   *  answer was produced inside the agent conversation (delta-prefill
   *  instead of a fresh ~1900-token prefill, which OOMs the wasm heap on
   *  fp32-activation dtypes like q4). */
  answer_raw?: string;
  /** Actions selected in-context by the collapsed S4 stage — already
   *  validated against the route census. */
  actions?: AiAction[];
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

/**
 * UI-label grounding — the docs corpus is English-only, but the buttons and
 * fields the user actually sees come from the module i18n dicts. For every
 * entity surfaced by retrieval we inject the matching `system.entities.{e}.*`
 * keys (and the page subtree `system.settings.{page}.*` for every candidate
 * route) in the user's language, so S3 names real UI labels ("Nuovo",
 * "Ruoli Applicativi") instead of translating English doc titles itself.
 *
 * Source of truth: the `system` module dict via fetchModuleTranslations —
 * cached per language for the session (the endpoint is ETag-cheap anyway).
 */
const LABEL_VALUE_CAP = 200;
const LABEL_LINE_CAP = 48;
/**
 * Common action verbs live in the `app` module dict (`app.common.new` =
 * "Nuovo"), NOT under `system.entities.*` — without them the model falls
 * back to the English doc wording for every button in a procedure
 * (observed: "clicca su New ... su Save" instead of Nuovo/Salva).
 */
const COMMON_ACTION_KEYS = [
  'new', 'create', 'edit', 'save', 'saveChanges', 'delete', 'duplicate',
  'cancel', 'confirm', 'apply', 'close', 'done', 'clear', 'clearAll',
  'search', 'filter', 'add', 'remove', 'back', 'next', 'previous',
  'select', 'deselectAll', 'open', 'exportCsv', 'all', 'actions',
];
let systemDictCache: { lang: string; dict: Record<string, string> } | null = null;
let appDictCache: { lang: string; dict: Record<string, string> } | null = null;

async function collectUiLabels(hits: DocHit[], routes: CensusRoute[]): Promise<string> {
  const prefixes = new Set<string>();
  for (const h of hits) {
    const e = h.metadata?.entity;
    if (typeof e === 'string' && e) prefixes.add(`system.entities.${e}.`);
  }
  for (const r of routes) {
    // Route → settings-page namespace: /system/settings/users/{uuid} →
    // system.settings.users. (param segments drop, prefix covers the subtree).
    const ns = r.route
      .replace(/^\//, '')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\/+/g, '.')
      .replace(/\.+$/, '');
    if (ns.startsWith('system.settings.')) prefixes.add(`${ns}.`);
  }
  // The user-profile page subtree ("Ruoli applicativi" etc.) is the field
  // label source for role assignment on ANY entity page — always include.
  prefixes.add('system.settings.profile.');
  if (!prefixes.size) return '';

  const lang = get(uiLang);
  if (!systemDictCache || systemDictCache.lang !== lang) {
    systemDictCache = {
      lang,
      dict: await fetchModuleTranslations('system', lang).catch(() => ({})),
    };
  }
  if (!appDictCache || appDictCache.lang !== lang) {
    appDictCache = {
      lang,
      dict: await fetchModuleTranslations('app', lang).catch(() => ({})),
    };
  }
  const ps = [...prefixes];
  const appDict = appDictCache?.dict ?? {};
  // Action verbs + role badges live in the `app` module, on their own
  // budget: a procedure names buttons (Nuovo, Salva) and badges
  // (Amministratore di sistema) even when its page subtree has no lines.
  const actionLines = [
    ...COMMON_ACTION_KEYS.map((k) => `app.common.${k}`),
    ...Object.keys(appDict).filter((k) => k.startsWith('app.auth.roles.')),
  ]
    .filter((k) => typeof appDict[k] === 'string')
    .map((k) => `${k} = "${appDict[k].slice(0, LABEL_VALUE_CAP)}"`);
  // Entity/settings lines get the FULL cap on top of the action lines —
  // otherwise ~27 action keys ate the budget and tail fields (is_admin,
  // roles) were truncated alphabetically (observed on the admin question).
  // Naming keys (fields./singular/plural/title) sort before hints.* —
  // hints are long explanations the model doesn't need for label naming.
  const entityLines = Object.entries(systemDictCache.dict)
    .filter(([k]) => ps.some((p) => k.startsWith(p)))
    .sort(([a], [b]) => (a.includes('.hints.') ? 1 : 0) - (b.includes('.hints.') ? 1 : 0) || a.localeCompare(b))
    .slice(0, LABEL_LINE_CAP)
    .map(([k, v]) => `${k} = "${typeof v === 'string' ? v.slice(0, LABEL_VALUE_CAP) : v}"`);
  const lines = [...actionLines, ...entityLines];
  stageLog('ui_labels', { lang, prefixes: ps, lines: lines.length });
  return lines.length
    ? `UI LABELS (${lang}) — real names of fields/buttons on these pages:\n${lines.join('\n')}`
    : '';
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
   When several candidate paths look equally relevant, you may emit up to
   TWO docs_fetch calls in the same response — they run in parallel and
   save a round.
5. Prefer pages under frontend/guide/manual/ — they are the user guide.
   backend/guide/ and api/ pages are developer references: fetch them only
   when no manual page covers the question.
6. Call list_routes only if you need the list of app pages.

DONE and NO_MATCH mean different things — pick the right one:
- DONE = "the pages I gathered answer the question" (research complete).
  DONE is FORBIDDEN until you have received at least one docs_fetch result.
- NO_MATCH = "nothing in this documentation is relevant to the question"
  (explicit refusal). Say NO_MATCH only when the hits are about a
  different subject — never just because a page is imperfect.

Response format (strict): your reply is exactly two lines —
  Thought: <one short sentence, MAX 12 words>
  <the tool call>          (or: DONE / NO_MATCH)
No paragraphs, no lists, no self-introductions ("Okay", "let me"), no
recap of the question. The Thought line only states WHAT you will fetch
or search next — never what the docs contain. If nothing is missing,
write just: DONE

After your DONE you will receive one final instruction asking for the
user-facing answer — only then do you write prose.`;

/** Classic ReAct dialect — for models without <tool_call> training (Coder
 *  family, Phi). Same workflow contract, different wire format: the model
 *  emits Thought/Action/Action Input and receives `Observation:` lines as
 *  user messages instead of tool-role responses. */
const AGENT_SYSTEM_REACT = `/no_think
You are the Primebrick documentation research agent. The user asked a
question about the application. Your ONLY job is to GATHER evidence —
another agent writes the final answer from what you collect.

You must be empirical and deep-dive before concluding. A single search
result is almost never enough evidence.

Available tools:
- docs_search — {"query":"<english query>"} — search the user-guide docs
- docs_fetch — {"path":"<doc path from search results>"} — open a full page
- list_routes — {} — list application pages

Mandatory workflow — follow the sequence EXACTLY:
1. FIRST Action: docs_search. The query MUST be in English — translate
   the question's intent, never pass the user's words verbatim.
2. SECOND Action: docs_fetch on the most relevant doc path from the
   search results. REQUIRED — excerpts alone are never enough. If the
   search returned only irrelevant paths, docs_search again with a
   different English query instead.
3. Read the fetched page. CHECK the entity field and the content: if the
   page is about a different subject than the question, it was the wrong
   pick — go back to step 1 with a different English query. For "what is
   X" questions, a second docs_search with an explanatory query (e.g.
   "X definition", "X meaning") is REQUIRED.
4. If the fetched page fully answers the question, emit Final: DONE.
   Otherwise keep gathering. Two or three fetches are normal.
5. Prefer pages under frontend/guide/manual/ — backend/guide/ and api/
   pages are developer references: fetch them only when no manual page
   covers the question.

DONE and NO_MATCH mean different things — pick the right one:
- DONE = "the pages I gathered answer the question". DONE is FORBIDDEN
  until you have received at least one docs_fetch Observation.
- NO_MATCH = "nothing in this documentation is relevant". Only when the
  hits are about a different subject — never just because a page is
  imperfect.

Response format (strict) — classic ReAct, exactly three lines:
  Thought: <one short sentence, MAX 12 words>
  Action: <tool-name>
  Action Input: {"<argument>": "<value>"}
For a verdict emit instead:
  Thought: <one short sentence>
  Final: DONE            (or: Final: NO_MATCH)
Tool results come back as "Observation: ..." — NEVER write an
Observation line yourself, and never produce anything after your
Action Input line.`;

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
  // Classic ReAct dialect: `Action: <name>` + `Action Input: {json}` —
  // the Coder family's native format when <tool_call> is out of vocab.
  const actionBlock = raw.match(
    /Action:\s*(docs_search|docs_fetch|list_routes)\s*\n?\s*Action\s*Input:\s*(\{[\s\S]*?\})\s*(?:\n|$)/i,
  );
  if (actionBlock) {
    const args = parseJson<Record<string, unknown>>(actionBlock[2]);
    calls.push({ name: actionBlock[1], arguments: args ?? {} });
    return calls;
  }
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
  if (calls.length) return calls;
  // ReAct dialect: the model writes its Thought in prose and emits the
  // Action embedded in the text (e.g. "…I'll search. docs_search("q")").
  // Scan every position — the call to execute is the LAST match, the one
  // that closes the reasoning trace. Bare mentions without () or : args
  // ("I'll perform a docs_search with the query X") do not match.
  const EMBEDDED = /\b(docs_search|docs_fetch|list_routes)\b/g;
  let em: RegExpExecArray | null;
  let lastIdx = -1;
  let lastName = '';
  while ((em = EMBEDDED.exec(raw))) {
    lastIdx = em.index;
    lastName = em[1];
  }
  if (lastIdx >= 0) {
    const argName = SHORTHAND_ARG[lastName];
    // Window after the tool name: the argument may be inline
    // `name("v")`, `name: "v"`, or on following ReAct lines
    // (`Action: name` + `Query: "v"`, `tool_call: name` + `query: "v"`).
    const win = raw.slice(lastIdx + lastName.length, lastIdx + lastName.length + 300);
    const paren = win.match(/^\s*\(([^)]*)\)/);
    const keyed = win.match(
      /(?:\bquery|\bpath|\binput|action\s*input)\s*[:=]\s*["'`]?([^\n"'`]+)/i,
    );
    const colon = win.match(/^\s*:\s*([^\n]+)/);
    const argText = (paren?.[1] ?? keyed?.[1] ?? colon?.[1] ?? '').trim();
    const kv = argText.match(/^(\w+)\s*=\s*["'`]([\s\S]*?)["'`]?$/);
    const value = (kv ? kv[2] : argText.replace(/^["'`]|["'`]$/g, '')).trim();
    // A bare mention inside a Thought ("I'll use the docs_search tool…")
    // has no parseable argument — treating it as a call would push a
    // `missing query` error and burn a round. Only emit when the required
    // argument was actually written.
    if (!argName || value) {
      calls.push({ name: lastName, arguments: argName ? { [argName]: value } : {} });
    }
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
    const rows = await searchDocs({
      query,
      keywords: keywords.length ? keywords : undefined,
      // The agent needs a real candidate set to choose a fetch target —
      // limiting to the S3 context budget would hide alternative docs.
      limit: 12,
      // Corpus scope must live INSIDE the SQL window — post-filtering here
      // left an empty set whenever dev/API docs outranked manual pages
      // (observed: "RBAC" query → top-12 all backend/api/sdk → 0 rows).
      path_prefix: 'frontend/guide/',
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
    if (!doc || 'error' in doc)
      // Steer lazy agents back to search: Coder models skip docs_search and
      // hallucinate doc paths — a bare 404 makes them emit NO_MATCH on
      // covered questions. Point them at the discovery tool instead.
      return JSON.stringify({
        error: 'document not found',
        hint: 'That path does not exist — never guess paths. Call docs_search with an English query to discover real document paths.',
      });
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
      // Dedup guard: a repeated fetch of an already-open page wastes a full
      // agent round (observed: users-create.mdx fetched twice in a row).
      // Reply instantly and steer the model to a different page or DONE.
      if (fetchedPaths.has(path) || fetchedPaths.has(`frontend/guide/${path}`)) {
        return JSON.stringify({ already_fetched: true, path, hint: 'You already opened this page — do NOT fetch it again. Fetch a different path or say DONE.' });
      }
      fetchCallCount++;
      const out = await execFetch(path, typeof args.repo === 'string' ? args.repo : undefined);
      if (out.startsWith('{"error"')) failedFetchCount++;
      return out;
    }
    if (name === 'list_routes') return execRoutes();
    return JSON.stringify({ error: `unknown tool "${name}"` });
  };

  // ── Agent loop: the MODEL decides what to look up; we only execute. ──
  // Dialect + answer strategy come from the cerebellum's execution_config:
  // react_classic is the default (works for models without <tool_call>);
  // qwen_tool_call preserves the chat-template-native wire format.
  const dialect = ctx.exec_config?.agent_dialect === 'qwen_tool_call' ? 'qwen_tool_call' : 'react_classic';
  const messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string }> = [
    { role: 'system', content: dialect === 'react_classic' ? AGENT_SYSTEM_REACT : AGENT_SYSTEM },
    { role: 'user', content: text },
  ];
  let toolCallsTotal = 0;
  let searchHitCount = 0;
  let fetchCallCount = 0;
  let failedFetchCount = 0;
  let shallowDoneReprompts = 0;
  let bareProseReprompts = 0;
  let autoSeedFetchCount = 0;
  let noMatch = false;
  try {
    for (let round = 0; round < cfg.max_agent_turns; round++) {
      const raw = await timed(`agent_turn_${round}`, () =>
        ctx.generate_agent(messages, {
          tools: AGENT_TOOLS,
          max_new_tokens: cfg.agent_max_tokens,
          temperature: cfg.preflight_temperature,
        }),
      );
      // Hallucination guard: the model may continue past its reply and
      // fabricate the Observation/tool result itself (classic ReAct
      // failure). Everything after a fake role header is discarded before
      // parsing AND before storing the turn in the conversation.
      const head = raw.split(/\n\s*(?:Observation|Human|User|System)\s*:/i)[0];
      const calls = parseToolCalls(head);
      stageLog('agent_decision', { round, calls: calls.map((c) => c.name), raw_head: raw.slice(0, 120), raw });
      if (!calls.length) {
        // Explicit refusal verdict: the model looked and judged every hit
        // irrelevant. Honor it — this is the designed no-coverage channel —
        // but only when the verdict rests on real evidence: a search that
        // returned hits, or a page actually opened. Lazy agents (Coder)
        // emit NO_MATCH after a hallucinated-path 404 fetch without ever
        // searching — that refusal is illegitimate, so reprompt once and
        // force the discovery step.
        if (/\bNO_MATCH\b[\s.]*$/im.test(head) && toolCallsTotal > 0) {
          if (searchHitCount === 0 && fetchedPaths.size === 0 && failedFetchCount > 0) {
            stageLog('agent_no_match_unfounded', { round });
            messages.push(
              { role: 'assistant', content: head },
              { role: 'user', content: 'Your fetch failed and you have not searched yet — you cannot judge coverage. Call docs_search now with an English query.' },
            );
            continue;
          }
          noMatch = true;
          stageLog('agent_no_match', { round });
          messages.push({ role: 'assistant', content: head });
          break;
        }
        // Premature-done repair (bounded, once): on fp16 the model can emit
        // DONE at turn 0 without ever searching — a verdict on coverage it
        // cannot legitimately make. Reject it and reprompt; if it still
        // refuses, the loop exits and the deterministic seed search runs.
        if (round === 0 && toolCallsTotal === 0) {
          stageLog('agent_premature_done', { raw_head: head.slice(0, 80) });
          messages.push(
            { role: 'assistant', content: head },
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
          /\bDONE\b[\s.]*$/im.test(head)
        ) {
          shallowDoneReprompts++;
          stageLog('agent_shallow_done', { round });
          messages.push(
            { role: 'assistant', content: head },
            { role: 'user', content: 'You have search results but have not opened any page. Call docs_fetch on the most relevant path, or say DONE if none is relevant.' },
          );
          continue;
        }
        // Bare-prose exit (bounded, once): the model sometimes answers with a
        // coverage verdict in free text — neither DONE nor a tool call
        // (observed: "torta" → 2k chars of "none of these docs relate"). Push
        // it back onto the contract so its verdict is recorded as DONE,
        // which the coverage check reads as "nothing useful found".
        if (
          fetchCallCount === 0 &&
          !/\bDONE\b[\s.]*$/im.test(head) &&
          bareProseReprompts < 1
        ) {
          bareProseReprompts++;
          stageLog('agent_bare_prose', { round });
          messages.push(
            { role: 'assistant', content: head },
            { role: 'user', content: 'Reply with the contract: a tool call line, or the single word DONE. Nothing else.' },
          );
          continue;
        }
        // Auto-seed fetch (bounded, once): the model gave up after searching
        // without opening any page (DONE or exhausted reprompts). Its verdict
        // was made on excerpts alone — illegitimate per its own protocol — so
        // we open the top-ranked page FOR it and let it judge on real content:
        // DONE ("this answers it") vs NO_MATCH ("irrelevant") vs keep
        // gathering. Lazy agents get rescued (observed: instruct-2507 DONE'd
        // on IDP Code), genuinely uncovered questions still refuse properly.
        if (fetchCallCount === 0 && autoSeedFetchCount === 0 && hits.length) {
          autoSeedFetchCount++;
          const top = [...hits].sort((a, b) => b.score - a.score)[0];
          stageLog('agent_auto_seed_fetch', { round, path: top.path });
          const result = await executeTool('docs_fetch', { path: top.path });
          messages.push(
            { role: 'assistant', content: head },
            dialect === 'react_classic'
              ? { role: 'user', content: `Observation: ${result}` }
              : { role: 'tool', name: 'docs_fetch', content: result },
            { role: 'user', content: 'I opened the top-ranked page for you. Does it answer the question? Reply DONE, NO_MATCH, or continue gathering with a tool call.' },
          );
          continue;
        }
        break; // model emitted text (DONE or an answer) — loop over
      }
      messages.push({ role: 'assistant', content: head });
      for (const call of calls.slice(0, 2)) {
        if (toolCallsTotal >= cfg.max_agent_calls) break;
        toolCallsTotal++;
        const result = await executeTool(call.name, call.arguments);
        messages.push(
          dialect === 'react_classic'
            ? { role: 'user', content: `Observation: ${result}` }
            : { role: 'tool', name: call.name, content: result },
        );
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

  // Coverage requires verified evidence: search hits are only CANDIDATES.
  // Evidence = a page the agent actually opened (its own docs_fetch OR the
  // auto-seed page it then confirmed with DONE). An explicit NO_MATCH is
  // the designed refusal channel — it always means no coverage. Bare-prose
  // or DONE exits without ANY opened page still mean the hit list stayed
  // unverified → deterministic fallback (observed: "torta" → users-create
  // at sim ~0.89 must never reach S3).
  if (searchHitCount === 0 || !hits.length || (fetchCallCount === 0 && autoSeedFetchCount === 0) || noMatch)
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

  // S3 context block must stay under max_block_chars: drop the tail chunks
  // (lowest-ranked) until excerpts+labels fit. The wall is the ORT WebGPU
  // ~2GB storage-buffer limit on the logits tensor — oversized prefills
  // kill the GPU device for the rest of the session.
  const chunkBlock = (h: DocHit, i: number): string =>
    `[${i + 1}]${confirmedFetched.has(h.path) ? ' [PRIMARY SOURCE — full page fetched]' : ''} "${h.title}" (${h.path})\n${h.content.slice(0, cfg.max_chunk_chars)}`;
  const buildBlock = (chunks: DocHit[], labels: string): string => {
    const ex = `DOCUMENTATION EXCERPTS:\n\n${chunks.map(chunkBlock).join('\n\n')}`;
    return labels ? `${ex}\n\n${labels}` : ex;
  };
  let contextChunks = scoped.slice(0, cfg.max_context_chunks);
  let labelsBlock = await collectUiLabels(contextChunks, route_candidates);
  let block = buildBlock(contextChunks, labelsBlock);
  while (block.length > cfg.max_block_chars && contextChunks.length > 1) {
    contextChunks = contextChunks.slice(0, -1);
    labelsBlock = await collectUiLabels(contextChunks, route_candidates);
    block = buildBlock(contextChunks, labelsBlock);
  }
  stageLog('s3_block', {
    block_chars: block.length,
    chunks: contextChunks.length,
    labels_chars: labelsBlock.length,
    trimmed: contextChunks.length < Math.min(scoped.length, cfg.max_context_chunks),
  });

  // ── Collapsed answer + action stages (in-context). The excerpts and the
  // fetched pages are already inside the agent conversation — asking for the
  // final answer HERE costs a ~500-token delta prefill instead of a fresh
  // ~1900-token S3 prefill (the wasm-heap OOM that kills q4 dtypes) AND
  // saves ~8-10s per turn. On contract failure (model replies with a tool
  // call / prose twice) we bail to the classic S3 path: `block`+labels are
  // still assembled above so the fallback stays identical to before.
  // `answer_mode: 'separate_prompt'` (cerebellum execution_config) skips the
  // in-context stages entirely — needed by models that cannot reuse the KV
  // cache (every round is a full re-prefill; smaller isolated prompts keep
  // the WebGPU logits buffer under the OOM cliff).
  let answerRaw: string | undefined;
  let actions: AiAction[] | undefined;
  const separatePrompt = ctx.exec_config?.answer_mode === 'separate_prompt';
  if (separatePrompt)
    return { found: true, block, sources, question: text, route_candidates, max_actions: cfg.max_actions };
  // Language enforcement must be EXPLICIT and LAST: the agent conversation
  // is entirely English (Thought/Action/Observation + English docs), so a
  // weak "language the user wrote in" clause buried mid-prompt loses to the
  // dominant register — every model flipped to English here (observed on
  // Qwen3-4B and instruct-2507 react runs). Naming the language resolves it.
  const userLang = get(uiLang);
  const langName =
    new Intl.DisplayNames(['en'], { type: 'language' }).of(userLang.split('-')[0]) ?? userLang;
  const answerInstruction =
    'Research is complete — the pages you fetched answer the question. Now write the FINAL ANSWER using ONLY the documentation above.\n' +
    'Rules: at most 3 sentences, OR a numbered list of at most 5 steps for procedures. Name UI buttons/fields/titles with the exact labels listed below — quote them verbatim, never translate them, never invent English names.\n\n' +
    (labelsBlock ? `${labelsBlock}\n\n` : '') +
    'OUTPUT: reply with ONLY this JSON object — no Thought line, no tool calls, no markdown fences:\n' +
    '{"answer_markdown":"<the answer>"}\n\n' +
    `The user writes in ${langName} — answer_markdown MUST be written in ${langName}, even though the research above is in English.`;
  messages.push({ role: 'user', content: answerInstruction });
  // tools MUST be passed on every in-context round: dropping them changes
  // the rendered system block → stem mismatch → cache invalidation → the
  // full-prefill OOM this stage exists to avoid.
  let ansRaw = await timed('answer_ctx', () =>
    ctx.generate_agent(messages, {
      tools: AGENT_TOOLS,
      max_new_tokens: Math.max(cfg.agent_max_tokens, 384),
    }),
  );
  stageLog('answer_ctx_raw', { head: ansRaw.slice(0, 120) });
  if (!parseGuideResponse(ansRaw)) {
    stageLog('answer_ctx_reprompt', {});
    messages.push(
      { role: 'assistant', content: ansRaw },
      { role: 'user', content: 'Reply with ONLY the JSON object {"answer_markdown":"..."} — no Thought line, no tool calls, no text around it.' },
    );
    ansRaw = await timed('answer_ctx_retry', () =>
      ctx.generate_agent(messages, {
        tools: AGENT_TOOLS,
        max_new_tokens: Math.max(cfg.agent_max_tokens, 384),
      }),
    );
  }
  const parsedAnswer = parseGuideResponse(ansRaw);
  if (parsedAnswer) {
    messages.push({ role: 'assistant', content: ansRaw });
    answerRaw = ansRaw;
    // S4 in-context: the candidates list is a short user message — delta
    // prefill only (same KV prefix), no isolated fresh prompt.
    if (route_candidates.length) {
      const s4Prompt = ACTION_SELECT_PROMPT(
        buildCandidateList(route_candidates),
        text,
        parsedAnswer.answer_markdown,
        cfg.max_actions,
      );
      messages.push({ role: 'user', content: s4Prompt });
      const s4raw = await timed('s4_ctx', () =>
        ctx.generate_agent(messages, {
          tools: AGENT_TOOLS,
          max_new_tokens: cfg.preflight_max_tokens,
        }),
      );
      actions = validateActionList(s4raw, route_candidates, cfg.max_actions);
    }
  }

  return {
    found: true,
    block,
    sources,
    question: text,
    route_candidates,
    max_actions: cfg.max_actions,
    answer_raw: answerRaw,
    actions,
  };
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
function buildCandidateList(candidates: CensusRoute[]): string {
  // Group candidates by kind so the model reads the create/detail/list
  // split explicitly instead of skimming a flat list.
  const byKind = new Map<string, string[]>();
  for (const r of candidates) {
    const label = `${r.route}${r.entity ? ` (entity:${r.entity})` : ''}`;
    const group = byKind.get(r.kind) ?? [];
    group.push(label);
    byKind.set(r.kind, group);
  }
  return [...byKind.entries()]
    .map(([kind, routes]) => `${kind}:\n${routes.map((r) => `  ${r}`).join('\n')}`)
    .join('\n');
}

function validateActionList(raw: string, candidates: CensusRoute[], maxActions: number): AiAction[] {
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

export async function selectActions(
  answer: string,
  question: string,
  candidates: CensusRoute[],
  regenerate: (extra_user_content: string, opts?: { isolate?: boolean }) => Promise<string>,
  maxActions: number = LOOP_DEFAULTS.max_actions,
): Promise<AiAction[]> {
  if (!candidates.length) return [];
  const candidateList = buildCandidateList(candidates);
  // isolate: the S3 context block is dead weight here — the prompt carries
  // question+answer+candidates already. Dropping it keeps the S4 prefill
  // under the WebGPU ~3.4k-token single-shot limit.
  const raw = await timed('s4_select', () =>
    regenerate(ACTION_SELECT_PROMPT(candidateList, question, answer, maxActions), { isolate: true }),
  );
  return validateActionList(raw, candidates, maxActions);
}
