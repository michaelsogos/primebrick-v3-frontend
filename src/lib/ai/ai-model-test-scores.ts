/**
 * Continuous red→green color for a 0-5 rank score.
 * Hue interpolation: rank 0 → red (0°), rank 5 → green (120°).
 * Returns a muted tone for missing/zero rank.
 */
export function rankColor(rank: number | null | undefined): string {
  if (rank === null || rank === undefined || rank <= 0) return 'hsl(0 0% 60%)';
  const hue = (Math.min(5, rank) / 5) * 120;
  return `hsl(${Math.round(hue)} 80% 42%)`;
}

export type TestTurn = {
  n?: number;
  turn?: number;
  prompt?: string;
  expected?: string;
  actual?: string;
  output?: string;
  actual_response?: string;
  score?: number;
  verdict?: string;
  reason?: string;
  note?: string;
  response_s?: number;
  ttft_s?: number;
  tokens_per_second?: number;
  kv_cache_hit_ratio?: number;
  error_type?: string;
};

/**
 * A single test case: raw evidence + aggregates computed on the fly.
 * Aggregates are NEVER read from stored fields — they are deterministic
 * functions of `turns` (see docs/modules/ai-models.md scoring formulas).
 */
export type ScoreCase = {
  key: string;
  score: number | null;
  quality: number | null;
  speed: number | null;
  success: string | null;
  avg_response_s: number | null;
  runs?: number[];
  method?: string;
  turns: TestTurn[];
  note?: string;
  tested_at?: string;
  protocol?: string;
  generation_config?: Record<string, unknown>;
  execution_config?: Record<string, unknown>;
  load?: Record<string, unknown>;
  load_ok?: boolean;
  generation_ok?: boolean;
  error?: string;
};

export type TestScoresSummary = {
  score: number | null;
  quality: number | null;
  speed: number | null;
  avg_response_s: number | null;
  success: string | null;
  cases: ScoreCase[];
};

/**
 * Canonical test-case keys stored in ai_models.test_scores (and
 * ai_cerebellum.test_scores). Each assistant's harness writes under its own
 * key — cases never overwrite each other, and the summary score is the mean
 * across cases (quality = average of test cases).
 */
export const AI_TEST_CASES = {
  REGEX: 'regex_test_score',
  JSON_EDITOR_WITH_SCHEMA: 'json_editor_with_schema_test_score',
} as const;

const CASE_KEY_SUFFIX = '_test_score';

export function testCaseLabel(key: string): string {
  return key.replace(/_test_score$/, '').replace(/_/g, ' ');
}

export function parseScoreValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const ratio = value.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*5\s*$/);
  if (ratio) return Number(ratio[1]);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Per-turn speed bucket: ≤3s→5, ≤5s→4, ≤7s→3, ≤9s→2, ≤10s→1, else 0. */
export function turnSpeedScore(response_s: number): number {
  if (response_s <= 3) return 5;
  if (response_s <= 5) return 4;
  if (response_s <= 7) return 3;
  if (response_s <= 9) return 2;
  if (response_s <= 10) return 1;
  return 0;
}

type CaseMetrics = {
  score: number | null;
  quality: number | null;
  speed: number | null;
  success: string | null;
  avg_response_s: number | null;
  runs: number[];
};

/**
 * Documented scoring formulas — computed on the fly, never stored:
 *   quality = mean(turns)·0.6 + (success/total)·5·0.4   (success = score ≥ 4)
 *   speed   = turnSpeedScore(mean response_s) — the seconds average is
 *             computed FIRST, then bucketed. One rule at every level:
 *             case speed = bucket(case avg), model speed = bucket(model avg).
 *   score   = quality·0.8 + speed·0.2
 */
export function computeCaseMetrics(turns: TestTurn[]): CaseMetrics {
  const scored = turns
    .map((turn) => parseScoreValue(turn?.score))
    .filter((score): score is number => score !== null);
  const times = turns
    .map((turn) => parseScoreValue(turn?.response_s ?? turn?.ttft_s))
    .filter((time): time is number => time !== null);

  const avg_response_s = times.length
    ? times.reduce((total, time) => total + time, 0) / times.length
    : null;

  if (!scored.length) {
    return { score: null, quality: null, speed: null, success: null, avg_response_s, runs: [] };
  }

  const mean = scored.reduce((total, score) => total + score, 0) / scored.length;
  const successCount = scored.filter((score) => score >= 4).length;
  const success = `${successCount}/${scored.length}`;
  const quality = mean * 0.6 + (successCount / scored.length) * 5 * 0.4;

  const speed = avg_response_s !== null ? turnSpeedScore(avg_response_s) : null;

  const score = speed !== null ? quality * 0.8 + speed * 0.2 : quality;
  return { score, quality, speed, success, avg_response_s, runs: scored };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toTurns(value: unknown): TestTurn[] {
  return Array.isArray(value) ? (value as TestTurn[]) : [];
}

/** Build a ScoreCase from a raw `*_test_score` object (evidence only). */
function buildCase(key: string, raw: Record<string, unknown>): ScoreCase | null {
  const turns = toTurns(raw.turns);
  const metrics = computeCaseMetrics(turns);

  // Case objects without turns may still carry a stored score/runs
  // (legacy harness shape) — surface them as evidence, aggregates stay
  // computed-only unless nothing else exists.
  const storedScore = parseScoreValue(raw.score);
  const storedRuns = Array.isArray(raw.runs)
    ? raw.runs.map(parseScoreValue).filter((run): run is number => run !== null)
    : [];

  const runs = metrics.runs.length ? metrics.runs : storedRuns;
  const score = metrics.score ?? storedScore
    ?? (runs.length ? runs.reduce((t, s) => t + s, 0) / runs.length : null);
  if (score === null && !runs.length && raw.load_ok !== false && raw.generation_ok !== false) {
    return null;
  }

  const success =
    metrics.success ??
    (typeof raw.success_count === 'number' && typeof raw.total_turns === 'number'
      ? `${raw.success_count}/${raw.total_turns}`
      : null);

  return {
    key,
    score,
    quality: metrics.quality,
    speed: metrics.speed,
    success,
    avg_response_s: metrics.avg_response_s ?? parseScoreValue(raw.avg_response_s),
    runs: runs.length ? runs : undefined,
    method: typeof raw.method === 'string' ? raw.method : undefined,
    turns,
    note: typeof raw.note === 'string' ? raw.note : undefined,
    tested_at: typeof raw.tested_at === 'string' ? raw.tested_at : undefined,
    protocol: typeof raw.protocol === 'string' ? raw.protocol : undefined,
    generation_config: isRecord(raw.generation_config) ? raw.generation_config : undefined,
    execution_config: isRecord(raw.execution_config) ? raw.execution_config : undefined,
    load: isRecord(raw.load) ? raw.load : undefined,
    load_ok: typeof raw.load_ok === 'boolean' ? raw.load_ok : undefined,
    generation_ok: typeof raw.generation_ok === 'boolean' ? raw.generation_ok : undefined,
    error: typeof raw.error === 'string' ? raw.error : undefined,
  };
}

/**
 * Legacy flat shape: evidence at top level (`turns`, `protocol`, `load`, …)
 * is treated as the canonical regex case until the DB cleanup wraps it.
 */
function flatShapeAsCase(test_scores: Record<string, unknown>): Record<string, unknown> {
  return {
    turns: test_scores.turns,
    protocol: test_scores.protocol,
    generation_config: test_scores.generation_config,
    execution_config: test_scores.execution_config,
    load: test_scores.load,
    load_ok: test_scores.load_ok,
    generation_ok: test_scores.generation_ok,
    note: test_scores.note,
    tested_at: test_scores.tested_at,
    score: test_scores.score,
    error: test_scores.error,
  };
}

export function summarizeTestScores(test_scores: Record<string, unknown> | null | undefined): TestScoresSummary {
  const summary: TestScoresSummary = { score: null, quality: null, speed: null, avg_response_s: null, success: null, cases: [] };
  if (!test_scores || !isRecord(test_scores)) return summary;

  for (const [key, value] of Object.entries(test_scores)) {
    if (!key.endsWith(CASE_KEY_SUFFIX) || !isRecord(value)) continue;
    const test_case = buildCase(key, value);
    if (test_case) summary.cases.push(test_case);
  }

  // Compat shim: flat-shape rows (evidence at top level) become the regex case.
  if (!summary.cases.length && (Array.isArray(test_scores.turns) || typeof test_scores.protocol === 'string' || typeof test_scores.score !== 'undefined')) {
    const test_case = buildCase(AI_TEST_CASES.REGEX, flatShapeAsCase(test_scores));
    if (test_case) summary.cases.push(test_case);
  }

  const scored = summary.cases.map((c) => c.score).filter((s): s is number => s !== null);
  summary.score = scored.length ? scored.reduce((t, s) => t + s, 0) / scored.length : null;

  const qualities = summary.cases.map((c) => c.quality).filter((s): s is number => s !== null);
  summary.quality = qualities.length ? qualities.reduce((t, s) => t + s, 0) / qualities.length : null;

  // Model avg = mean of per-case averages (mean of means — each case weighs
  // the same regardless of turn count). Speed is bucketed from THAT average,
  // same single rule as the case level.
  const caseAvgs = summary.cases.map((c) => c.avg_response_s).filter((s): s is number => s !== null);
  summary.avg_response_s = caseAvgs.length ? caseAvgs.reduce((t, s) => t + s, 0) / caseAvgs.length : null;
  summary.speed = summary.avg_response_s !== null ? turnSpeedScore(summary.avg_response_s) : null;

  const successParts = summary.cases.map((c) => c.success).filter((s): s is string => s !== null);
  summary.success = successParts.length ? successParts.join(' · ') : null;

  return summary;
}
