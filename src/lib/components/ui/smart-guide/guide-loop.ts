/**
 * guide-loop — bounded agentic retrieval loop for the Guide assistant.
 *
 * Replaces the passive single-shot "rewrite→embed→inject" preflight with a
 * staged loop where the MODEL selects and our code executes:
 *
 *   S0 decompose   — preflight JSON: {queries[≤3], keywords[≤8], lang}
 *   S1 retrieve    — deterministic: embed each query → docs search, deduped
 *   S2 coverage    — preflight JSON: {sufficient, missing[≤2]} — deepens S1,
 *                    bounded by MAX_RETRIEVAL_ITERATIONS + early-exit when a
 *                    deepening round adds zero new chunks
 *   (S3 answer     — runs as the MAIN streaming generation, outside this file)
 *   S4 actions     — selection from a deterministic candidate set (route
 *                    census + entity tools), output: {action_ids:[≤3]}
 *
 * Every model stage returns closed-space JSON; parsing failures degrade
 * gracefully (retrieval keeps working, actions just end up empty).
 */
import type { TransformContext } from '$lib/components/ui/smart-ai/ai-assistant.types';
import type { AiAction, AiSource } from '$lib/components/ui/smart-ai/ai-assistant.types';
import { searchDocs, fetchRoutesCensus, type CensusRoute } from '$lib/api';

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

const DECOMPOSE_SYSTEM = (maxQueries: number, maxKeywords: number) => `/no_think
You decompose user questions for a documentation search engine. The docs are
mostly English. Output ONLY JSON:
{"queries":["search query variants, max ${maxQueries}"],"keywords":["literal identifiers, config keys, technical terms — keep exact casing, max ${maxKeywords}"],"lang":"<user language code>","intent":"create|edit|delete|list|explain"}
lang is the language of the USER QUESTION, never the language you translate to.
queries MUST always be written in English — the docs are English, so search
terms are translated to English even when the question is not.
intent: "create" only when the user explicitly wants to CREATE a new entity;
"edit"/"delete" for changes to existing records; "list" for browsing/finding;
"explain" for meanings, procedures on existing things, how-it-works questions.
Examples: "creo un utente"→create; "rendo admin un utente"→edit;
"assegno un ruolo a X"→edit; "nuovo ruolo"→create; "come funziona X"→explain.
No markdown, no explanation.`;

const COVERAGE_SYSTEM = (maxSearches: number) => `/no_think
You inspect retrieved documentation excerpts and decide if they answer the user question.
Read the excerpt contents. Output ONLY JSON:
{"sufficient":true|false,"searches":["new search queries to run, max ${maxSearches}"]}
- sufficient=true when the excerpts contain the procedure or facts asked.
- When sufficient=false, searches MUST be full standalone search queries for the
  documentation engine — never document names, paths, or topic labels.`;


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
  ctx: Pick<TransformContext, 'generate_preflight' | 'exec_config'>,
  deps: GuideLoopDeps,
  minSimilarity: number,
): Promise<GuideLoopResult> {
  const cfg = resolveLoopConfig(ctx.exec_config);
  // Route census is fetched in parallel with S0 — independent input.
  const [census, s0raw] = await Promise.all([
    fetchRoutesCensus().catch(() => [] as CensusRoute[]),
    timed('s0_decompose', () =>
      ctx.generate_preflight(DECOMPOSE_SYSTEM(cfg.max_queries, cfg.max_keywords), text, {
        max_new_tokens: cfg.preflight_max_tokens,
        temperature: cfg.preflight_temperature,
      }),
    ),
  ]);

  const s0 = parseJson<{ queries?: string[]; keywords?: string[]; intent?: string }>(s0raw);
  const queries = (s0?.queries ?? []).filter((q) => typeof q === 'string' && q.trim()).slice(0, cfg.max_queries);
  if (!queries.length) queries.push(text);
  // Keywords are picked by the model inside the same S0 call (free
  // byproduct) and passed verbatim to the search boost — no FE/BE
  // extraction, no stopword lists.
  const keywords = (s0?.keywords ?? []).filter((k) => typeof k === 'string').slice(0, cfg.max_keywords);

  const seen = new Set<string>();
  const hits: DocHit[] = [];
  const collect = async (qs: string[], stage: string): Promise<number> => {
    const t0 = performance.now();
    const perQuery = await Promise.all(
      qs.map(async (q) => {
        const embedding = await deps.embed(q);
        return searchDocs({
          embedding,
          keywords,
          limit: cfg.max_context_chunks,
          min_similarity: minSimilarity,
          keyword_boost: ctx.exec_config?.keyword_boost,
          lexical_boost: ctx.exec_config?.lexical_boost,
          lex_match_min: ctx.exec_config?.lex_match_min,
          oversample: ctx.exec_config?.oversample,
          graph_max_paths: ctx.exec_config?.graph_max_paths,
        });
      }),
    );
    let added = 0;
    for (const rows of perQuery) {
      for (const h of rows) {
        // Graph-expanded and strong lexical-recall chunks are structurally/
        // textually related — the similarity floor doesn't apply to them.
        if (seen.has(h.path) || (h.similarity < minSimilarity && !h.graph_expanded && !h.lexical_match)) continue;
        seen.add(h.path);
        hits.push(h as DocHit);
        added++;
      }
    }
    stageLog(stage, {
      ms: Math.round(performance.now() - t0),
      queries: qs,
      returned: perQuery.map((r) => r.length),
      new_chunks: added,
    });
    return added;
  };

  try {
    await collect(queries, 's1_retrieve');
  } catch (e) {
    throw new Error(
      `Documentation retrieval failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // S2 — inspect: the model READS excerpt content and issues its own search
  // calls (free-form queries, executed in parallel by the orchestrator).
  // Bounded by MAX_RETRIEVAL_ITERATIONS + early exit on zero new chunks.
  for (let iter = 0; iter < cfg.max_retrieval_iterations && hits.length > 0; iter++) {
    const digest = hits
      .slice(0, cfg.inspect_digest_size)
      .map((h, i) => `[${i}] ${h.title} (${h.path})\n${h.content.slice(0, cfg.inspect_chunk_chars)}`)
      .join('\n\n');
    const s2raw = await timed(`s2_inspect_${iter}`, () =>
      ctx.generate_preflight(COVERAGE_SYSTEM(cfg.max_searches), `QUESTION: ${text}\nEXCERPTS:\n${digest}`, {
        max_new_tokens: cfg.preflight_max_tokens,
        temperature: cfg.preflight_temperature,
      }),
    );
    const s2 = parseJson<{ sufficient?: boolean; searches?: string[] }>(s2raw);
    stageLog('s2_decision', { iter, raw_ok: s2 !== null, sufficient: s2?.sufficient, searches: s2?.searches });
    const searches = (s2?.searches ?? [])
      .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
      .slice(0, cfg.max_searches);
    if (!s2 || s2.sufficient !== false || !searches.length) break;
    if ((await collect(searches, `s2_search_${iter}`)) === 0) break;
  }

  if (!hits.length)
    return { found: false, block: '', sources: [], question: text, route_candidates: census, max_actions: cfg.max_actions };

  hits.sort((a, b) => b.score - a.score);
  const block = `DOCUMENTATION EXCERPTS:\n\n${hits
    .slice(0, cfg.max_context_chunks)
    .map((h, i) => `[${i + 1}] "${h.title}" (${h.path})\n${h.content.slice(0, cfg.max_chunk_chars)}`)
    .join('\n\n')}`;

  const seenPaths = new Set<string>();
  const sources: AiSource[] = [];
  for (const h of hits.slice(0, cfg.max_context_chunks)) {
    if (seenPaths.has(h.path)) continue;
    seenPaths.add(h.path);
    sources.push({ repo: h.repo, path: h.path, title: h.title, similarity: h.similarity });
  }

  // S4 candidates are grounded in what was actually retrieved: only routes
  // whose entity is declared by at least one source chunk's metadata. No
  // entity evidence → empty candidate set → deterministically no action,
  // instead of the model picking a salient-but-wrong route every turn.
  const entities = new Set(
    hits.map((h) => h.metadata?.entity).filter((e): e is string => typeof e === 'string'),
  );
  // Intent gate: `*/create` candidates are only offered when S0 classifies
  // the question as an explicit create intent. Unknown/missing intent keeps
  // the full entity set (graceful degradation, same as before).
  const intent = typeof s0?.intent === 'string' ? s0.intent.toLowerCase() : null;
  const dropCreate = intent !== null && intent !== 'create';
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
