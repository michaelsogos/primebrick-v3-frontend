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

const MAX_CONTEXT_CHUNKS = 4;
const MAX_CHUNK_CHARS = 1500;
const MAX_RETRIEVAL_ITERATIONS = 2;
const MAX_ACTIONS = 3;
/** Excerpt preview size shown to the S2 inspect stage — enough to judge
 *  coverage on content, small enough to keep the preflight prompt cheap. */
const INSPECT_CHUNK_CHARS = 350;

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
}

interface DocHit {
  repo: string;
  path: string;
  title: string;
  content: string;
  similarity: number;
  score: number;
}

const DECOMPOSE_SYSTEM = `/no_think
You decompose user questions for a documentation search engine. The docs are
mostly English. Output ONLY JSON:
{"queries":["search query variants, max 3"],"keywords":["literal identifiers, config keys, technical terms — keep exact casing"],"lang":"<user language code>"}
No markdown, no explanation.`;

const COVERAGE_SYSTEM = `/no_think
You inspect retrieved documentation excerpts and decide if they answer the user question.
Read the excerpt contents. Output ONLY JSON:
{"sufficient":true|false,"searches":["new search queries to run, max 3"]}
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
  // Route census is fetched in parallel with S0 — independent input.
  const [census, s0raw] = await Promise.all([
    fetchRoutesCensus().catch(() => [] as CensusRoute[]),
    timed('s0_decompose', () =>
      ctx.generate_preflight(DECOMPOSE_SYSTEM, text, {
        max_new_tokens: 160,
        temperature: 0,
      }),
    ),
  ]);

  const s0 = parseJson<{ queries?: string[]; keywords?: string[] }>(s0raw);
  const queries = (s0?.queries ?? []).filter((q) => typeof q === 'string' && q.trim()).slice(0, 3);
  if (!queries.length) queries.push(text);
  // Keywords are picked by the model inside the same S0 call (free
  // byproduct) and passed verbatim to the search boost — no FE/BE
  // extraction, no stopword lists.
  const keywords = (s0?.keywords ?? []).filter((k) => typeof k === 'string').slice(0, 8);

  const seen = new Set<string>();
  const hits: DocHit[] = [];
  const collect = async (qs: string[], stage: string): Promise<number> => {
    const t0 = performance.now();
    const perQuery = await Promise.all(
      qs.map(async (q) => {
        const embedding = await deps.embed(q);
        return searchDocs({ embedding, keywords, limit: MAX_CONTEXT_CHUNKS });
      }),
    );
    let added = 0;
    for (const rows of perQuery) {
      for (const h of rows) {
        if (seen.has(h.path) || h.similarity < minSimilarity) continue;
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
  for (let iter = 0; iter < MAX_RETRIEVAL_ITERATIONS && hits.length > 0; iter++) {
    const digest = hits
      .slice(0, 6)
      .map((h, i) => `[${i}] ${h.title} (${h.path})\n${h.content.slice(0, INSPECT_CHUNK_CHARS)}`)
      .join('\n\n');
    const s2raw = await timed(`s2_inspect_${iter}`, () =>
      ctx.generate_preflight(COVERAGE_SYSTEM, `QUESTION: ${text}\nEXCERPTS:\n${digest}`, {
        max_new_tokens: 160,
        temperature: 0,
      }),
    );
    const s2 = parseJson<{ sufficient?: boolean; searches?: string[] }>(s2raw);
    stageLog('s2_decision', { iter, raw_ok: s2 !== null, sufficient: s2?.sufficient, searches: s2?.searches });
    const searches = (s2?.searches ?? [])
      .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
      .slice(0, 3);
    if (!s2 || s2.sufficient !== false || !searches.length) break;
    if ((await collect(searches, `s2_search_${iter}`)) === 0) break;
  }

  if (!hits.length)
    return { found: false, block: '', sources: [], question: text, route_candidates: census };

  hits.sort((a, b) => b.score - a.score);
  const block = `DOCUMENTATION EXCERPTS:\n\n${hits
    .slice(0, MAX_CONTEXT_CHUNKS)
    .map((h, i) => `[${i + 1}] "${h.title}" (${h.path})\n${h.content.slice(0, MAX_CHUNK_CHARS)}`)
    .join('\n\n')}`;

  const seenPaths = new Set<string>();
  const sources: AiSource[] = [];
  for (const h of hits.slice(0, MAX_CONTEXT_CHUNKS)) {
    if (seenPaths.has(h.path)) continue;
    seenPaths.add(h.path);
    sources.push({ repo: h.repo, path: h.path, title: h.title, similarity: h.similarity });
  }

  return { found: true, block, sources, question: text, route_candidates: census };
}

const ACTION_SELECT_PROMPT = (candidates: string, question: string, answer: string) =>
  `The user asked: ${question}\nYour previous answer was:\n${answer}\n\n` +
  `Now pick app pages the user can navigate to, choosing ONLY from this route list:\n${candidates}\n\n` +
  `Return ONLY one JSON object: {"actions":[{"kind":"navigate","route":"<from list>","label":"<short CTA>"}]}\n` +
  `Max ${MAX_ACTIONS} actions; only routes that help the user ACT on the answer. ` +
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
): Promise<AiAction[]> {
  if (!candidates.length) return [];
  const candidateList = candidates
    .map((r) => `${r.route}${r.entity ? ` (entity:${r.entity})` : ''}`)
    .join('\n');
  const raw = await timed('s4_select', () => regenerate(ACTION_SELECT_PROMPT(candidateList, question, answer)));
  const parsed = parseJson<{ actions?: unknown }>(raw);
  const list = Array.isArray(parsed?.actions) ? parsed.actions : [];
  const valid = new Set(candidates.map((r) => r.route));
  const actions: AiAction[] = [];
  for (const item of list) {
    if (actions.length >= MAX_ACTIONS) break;
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
