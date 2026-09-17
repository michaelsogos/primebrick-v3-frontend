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

export type ScoreCase = {
  key: string;
  score: number | null;
  runs?: number[];
  method?: string;
};

export type TestScoresSummary = {
  score: number | null;
  quality: number | null;
  speed: number | null;
  avg_response_s: number | null;
  success: string | null;
  cases: ScoreCase[];
};

const TEST_SCORE_META_KEYS = new Set([
  'score_detail', 'perf', 'generation_config', 'turns', 'note', 'notes',
  'load_ok', 'generation_ok', 'tested_at', 'protocol', 'strategy',
  'crash', 'loop', 'crash_note',
]);

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

export function summarizeTestScores(test_scores: Record<string, unknown> | null | undefined): TestScoresSummary {
  const summary: TestScoresSummary = { score: null, quality: null, speed: null, avg_response_s: null, success: null, cases: [] };
  if (!test_scores) return summary;

  const score_detail = test_scores.score_detail;
  if (score_detail && typeof score_detail === 'object') {
    const detail = score_detail as Record<string, unknown>;
    summary.quality = parseScoreValue(detail.quality);
    summary.speed = parseScoreValue(detail.speed);
    summary.score = parseScoreValue(detail.score);
    summary.success = typeof detail.success === 'string' ? detail.success : null;
  }

  const protocol = typeof test_scores.protocol === 'string' ? test_scores.protocol : null;
  const turns = Array.isArray(test_scores.turns) ? test_scores.turns : null;
  if (turns?.length) {
    const times = turns
      .map((turn) => parseScoreValue((turn as Record<string, unknown> | null)?.response_s))
      .filter((time): time is number => time !== null);
    if (times.length) summary.avg_response_s = times.reduce((total, time) => total + time, 0) / times.length;
  }
  if (summary.avg_response_s === null) {
    const perf = test_scores.perf;
    if (perf && typeof perf === 'object') {
      summary.avg_response_s = parseScoreValue((perf as Record<string, unknown>).avg_response_s);
    }
  }
  if (protocol || turns) {
    const runs = (turns ?? [])
      .map((turn) => parseScoreValue((turn as Record<string, unknown> | null)?.score))
      .filter((score): score is number => score !== null);
    const mean = runs.length ? runs.reduce((total, score) => total + score, 0) / runs.length : null;
    summary.cases.push({ key: protocol ?? 'e2e', score: summary.score ?? mean, runs });
  }

  for (const [key, value] of Object.entries(test_scores)) {
    if (TEST_SCORE_META_KEYS.has(key) || typeof value !== 'object' || value === null) continue;
    const test_case = value as Record<string, unknown>;
    const score = parseScoreValue(test_case.score);
    const runs = Array.isArray(test_case.runs)
      ? test_case.runs.map(parseScoreValue).filter((run): run is number => run !== null)
      : undefined;
    if (score === null && !runs?.length) continue;
    if (!summary.success && typeof test_case.success_count === 'number' && typeof test_case.total_turns === 'number') {
      summary.success = `${test_case.success_count}/${test_case.total_turns}`;
    }
    summary.cases.push({
      key,
      score: score ?? runs!.reduce((total, run) => total + run, 0) / runs!.length,
      runs,
      method: typeof test_case.method === 'string' ? test_case.method : undefined,
    });
  }

  if (summary.score === null) {
    const scores = summary.cases.map((test_case) => test_case.score).filter((score): score is number => score !== null);
    summary.score = scores.length ? scores.reduce((total, score) => total + score, 0) / scores.length : null;
  }
  return summary;
}
