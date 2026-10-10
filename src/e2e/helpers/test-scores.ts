/**
 * Shared persistence for AI quality E2E cases.
 *
 * A `*_test_score` case under `ai_models.test_scores` can be fed by MULTIPLE
 * specs running in separate chat sessions — e.g. the json-schema assistant
 * case combines `phase: "conversation"` turns (prompt-driven) with
 * `phase: "navigation"` turns (explorer link clicks). Each spec merges only
 * its own phase into the shared `turns[]`; aggregates (quality/speed/score)
 * and the model rank are derived from ALL turns at read time by
 * `src/lib/ai/ai-model-test-scores.ts` — never persisted precomputed.
 */
import { getPool } from "./db";

export type E2ETurn = {
  n: number;
  /** "conversation" | "navigation" — which session/spec produced the turn. */
  phase?: string;
  prompt: string;
  expected: string;
  actual: unknown;
  score: number;
  verdict: "pass" | "partial" | "fail";
  reason: string;
  response_s: number;
};

/** Per-turn speed bucket: ≤3s→5, ≤5s→4, ≤7s→3, ≤9s→2, ≤10s→1, else 0. */
export function turnSpeedScore(response_s: number): number {
  if (response_s <= 3) return 5;
  if (response_s <= 5) return 4;
  if (response_s <= 7) return 3;
  if (response_s <= 9) return 2;
  if (response_s <= 10) return 1;
  return 0;
}

export function caseMetrics(scores: number[], times: number[]) {
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const successCount = scores.filter((s) => s >= 4).length;
  const quality = mean * 0.6 + (successCount / scores.length) * 5 * 0.4;
  // Same single rule as ai-model-test-scores.ts: average the seconds first,
  // then bucket the average — never mean-of-buckets.
  const speed = times.length
    ? turnSpeedScore(times.reduce((a, b) => a + b, 0) / times.length)
    : 0;
  return {
    quality,
    speed,
    score: quality * 0.8 + speed * 0.2,
    success: `${successCount}/${scores.length}`,
  };
}

/** Aggregate any *_test_score case from stored turns (same formulas). */
function caseScoreFromStored(caseObj: Record<string, unknown>): number | null {
  const turns = Array.isArray(caseObj.turns)
    ? (caseObj.turns as { score?: number; response_s?: number }[])
    : [];
  const scores = turns
    .map((t) => t.score)
    .filter((s): s is number => typeof s === "number");
  const times = turns
    .map((t) => t.response_s)
    .filter((s): s is number => typeof s === "number");
  if (!scores.length) return null;
  const m = caseMetrics(scores, times.length ? times : scores.map(() => 1));
  return m.score;
}

/**
 * Merge `turns` (one phase) into `ai_models.test_scores[caseKey]`:
 * same-phase turns are replaced, other phases are preserved, then the model
 * rank is recomputed as the mean of every `*_test_score` case score.
 * Returns the merged-turn metrics (all phases combined).
 *
 * When `measured` is passed (post-test `vram_bytes` from the worker's
 * GPUBuffer tracking + the context length at measure time), the same atomic
 * UPDATE also persists the REAL working set: the measured total already
 * contains weights + KV + scratch, so it replaces `working_set_mb` entirely
 * with `working_set_source='e2e_measured'` — kv bytes are never re-added.
 */
export function buildTestScoreUpdate(
  repo: string,
  nextScores: Record<string, unknown>,
  rank: number | null,
  dtype: string | null,
  measured?: { vram_bytes: number; ctx_tokens: number | null },
): { query: string; values: unknown[] } {
  const measuredSet = measured?.vram_bytes
    ? `, working_set_mb = $4, working_set_source = 'e2e_measured', working_set_detail = $5::jsonb`
    : "";
  const values: unknown[] = [repo, JSON.stringify(nextScores), rank];
  if (measured?.vram_bytes) {
    values.push(
      Math.round(measured.vram_bytes / (1024 * 1024)),
      JSON.stringify({
        measured_vram_bytes: measured.vram_bytes,
        measured_at: new Date().toISOString(),
        measured_ctx_tokens: measured.ctx_tokens,
      }),
    );
  }
  values.push(dtype);
  const dtype_param = values.length;

  return {
    query: `UPDATE ai.ai_models
     SET test_scores = $2::jsonb, rank = COALESCE($3, rank), updated_at = now(), updated_by = 'e2e', version = version + 1
     ${measuredSet}
     WHERE model_id = $1 AND dtype IS NOT DISTINCT FROM $${dtype_param} AND deleted_at IS NULL`,
    values,
  };
}

export async function mergeTestScoreTurns(
  model_id: string,
  caseKey: string,
  phase: string,
  turns: E2ETurn[],
  measured?: { vram_bytes: number; ctx_tokens: number | null },
): Promise<{ score: number; rank: number | undefined; total_turns: number }> {
  const pool = getPool();
  // model_id param is a variant key ('repo#dtype') or a bare repo — resolve to
  // the normalized (model_id, dtype) pair.
  const [repo, dtype] = model_id.split("#");
  const { rows } = await pool.query<{
    test_scores: Record<string, unknown> | null;
  }>(
    `SELECT test_scores FROM ai.ai_models
     WHERE model_id = $1 AND dtype IS NOT DISTINCT FROM $2 AND deleted_at IS NULL`,
    [repo, dtype ?? null],
  );
  if (rows.length !== 1) throw new Error(`model ${model_id} not in ai_models`);

  const prevCase =
    (rows[0].test_scores?.[caseKey] as Record<string, unknown> | undefined) ??
    {};
  const prevTurns = Array.isArray(prevCase.turns)
    ? (prevCase.turns as E2ETurn[])
    : [];
  // Legacy turns written before phase tagging count as "conversation".
  const kept = prevTurns.filter((t) => (t.phase ?? "conversation") !== phase);
  const merged = [...kept, ...turns.map((t) => ({ ...t, phase }))].sort(
    (a, b) => {
      const pa = a.phase === "conversation" ? 0 : 1;
      const pb = b.phase === "conversation" ? 0 : 1;
      return pa - pb || a.n - b.n;
    },
  );

  // Score history: before overwriting the case, snapshot the previous run so
  // regression comparison survives across campaigns. `history[]` is
  // newest-first, capped at 5; rank reads only `turns` (unaffected).
  const prevHistory = Array.isArray(prevCase.history)
    ? (prevCase.history as unknown[])
    : [];
  const history = prevTurns.length
    ? [
        {
          tested_at: prevCase.tested_at ?? null,
          turns: prevTurns,
          success_count: prevCase.success_count ?? null,
          total_turns: prevCase.total_turns ?? prevTurns.length,
          phases: prevCase.phases ?? null,
        },
        ...prevHistory,
      ].slice(0, 5)
    : prevHistory;

  const nextScores = {
    ...(rows[0].test_scores ?? {}),
    [caseKey]: {
      ...prevCase,
      protocol: "e2e_json_schema_conversation+navigation+chat+mixed",
      tested_at: new Date().toISOString(),
      load_ok: true,
      generation_ok: true,
      turns: merged,
      history,
      phases: {
        ...(typeof prevCase.phases === "object" && prevCase.phases !== null
          ? prevCase.phases
          : {}),
        [phase]: { tested_at: new Date().toISOString(), turns: turns.length },
      },
      success_count: merged.filter((t) => t.score >= 4).length,
      total_turns: merged.length,
    },
  };

  // Rank-eligible cases: regex + json + guide_react (ReAct is the chosen
  // engine). guide_orch stays excluded — historical orchestrator data only.
  const caseScores = Object.entries(nextScores)
    .filter(
      ([k, v]) =>
        k.endsWith("_test_score") &&
        k !== "guide_orch_test_score" &&
        v &&
        typeof v === "object",
    )
    .map(([, v]) => caseScoreFromStored(v as Record<string, unknown>))
    .filter((s): s is number => s !== null);
  const rank = caseScores.length
    ? Math.round(
        (caseScores.reduce((a, b) => a + b, 0) / caseScores.length) * 10,
      ) / 10
    : undefined;

  const update = buildTestScoreUpdate(
    repo,
    nextScores,
    rank ?? null,
    dtype ?? null,
    measured,
  );
  const upd = await pool.query(update.query, update.values);
  if (upd.rowCount !== 1) throw new Error(`update failed for ${model_id}`);

  const m = caseMetrics(
    merged.map((t) => t.score),
    merged.map((t) => t.response_s),
  );
  return { score: m.score, rank, total_turns: merged.length };
}
