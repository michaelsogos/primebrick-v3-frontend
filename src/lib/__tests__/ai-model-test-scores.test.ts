import { describe, expect, it } from "vitest";
import {
  AI_TEST_CASES,
  computeCaseMetrics,
  parseScoreValue,
  summarizeTestScores,
  testCaseLabel,
} from "$lib/ai/ai-model-test-scores";

describe("computeCaseMetrics — documented formulas on the fly", () => {
  it("quality = mean·0.6 + success·5·0.4, speed = mean buckets, score = q·0.8 + s·0.2", () => {
    // Mirrors stored gemma-4-E2B evidence: turns [5,3,2,2,5],
    // response_s [9.43,10.28,9.83,10.78,9.25] → stored quality 2.84, speed 0.6, score 2.39
    const metrics = computeCaseMetrics([
      { score: 5, response_s: 9.43 },
      { score: 3, response_s: 10.28 },
      { score: 2, response_s: 9.83 },
      { score: 2, response_s: 10.78 },
      { score: 5, response_s: 9.25 },
    ]);
    expect(metrics.quality).toBeCloseTo(2.84, 2);
    expect(metrics.speed).toBeCloseTo(0.6, 2);
    expect(metrics.score).toBeCloseTo(2.392, 2);
    expect(metrics.success).toBe("2/5");
    expect(metrics.avg_response_s).toBeCloseTo(9.914, 2);
  });

  it("returns null aggregates when no turn scores exist", () => {
    const metrics = computeCaseMetrics([{ note: "load crash" }]);
    expect(metrics.score).toBeNull();
    expect(metrics.quality).toBeNull();
    expect(metrics.speed).toBeNull();
    expect(metrics.success).toBeNull();
  });
});

describe("AI model test score normalization", () => {
  it("synthesizes the regex case from flat-shape evidence and ignores score_detail", () => {
    // score_detail.score (4.8) must NOT win — aggregates are computed on the fly.
    const summary = summarizeTestScores({
      score_detail: { quality: 5, speed: 4.1, score: 4.8, success: "5/5" },
      protocol: "e2e_5turn_s1_fixed_v2",
      turns: [{ score: 5, response_s: 2 }, { score: 4, response_s: 2 }],
    });

    expect(summary.cases).toHaveLength(1);
    const testCase = summary.cases[0];
    expect(testCase.key).toBe(AI_TEST_CASES.REGEX);
    expect(testCase.runs).toEqual([5, 4]);
    expect(testCase.success).toBe("2/2");
    // mean 4.5 ·0.6 + 1.0·5·0.4 = 4.7 ; speed 5 → score 4.76
    expect(testCase.quality).toBeCloseTo(4.7, 2);
    expect(testCase.score).toBeCloseTo(4.76, 2);
    expect(summary.score).toBeCloseTo(4.76, 2);
  });

  it("averages score across *_test_score cases and ignores non-case keys", () => {
    const summary = summarizeTestScores({
      e2e_5turn_s1_fixed_v2: { score: "4/5" }, // legacy key: NOT a case
      weights: { foo: 1 }, // spurious object: ignored
      regex_test_score: {
        turns: [
          { score: 5, response_s: 2 },
          { score: 5, response_s: 2 },
        ],
      },
      json_editor_with_schema_test_score: {
        turns: [
          { score: 5, response_s: 2 },
          { score: 1, response_s: 2 },
        ],
      },
    });

    expect(summary.cases).toHaveLength(2);
    expect(summary.cases.map((c) => c.key)).toContain("json_editor_with_schema_test_score");
    // regex: q=5 s=5 → 5 ; json: mean3 → q=3·0.6+0.5·5·0.4=2.8, s=5 → 3.24
    expect(summary.score).toBeCloseTo((5 + 3.24) / 2, 2);
  });

  it("keeps stored score/runs for case objects without turns", () => {
    const summary = summarizeTestScores({
      regex_test_score: { runs: [5, 4, 3], success_count: 2, total_turns: 3 },
    });
    expect(summary.cases).toHaveLength(1);
    expect(summary.cases[0].score).toBe(4); // mean of runs
    expect(summary.success).toBe("2/3");
  });

  it("renders load-failure cases without turns", () => {
    const summary = summarizeTestScores({
      regex_test_score: {
        load_ok: false,
        generation_ok: false,
        load: { error: "ERROR_CODE: 6" },
        note: "crash",
      },
    });
    expect(summary.cases).toHaveLength(1);
    expect(summary.cases[0].load_ok).toBe(false);
  });

  it("returns null for missing or invalid scores", () => {
    expect(parseScoreValue(undefined)).toBeNull();
    expect(parseScoreValue("invalid")).toBeNull();
    expect(summarizeTestScores(null)).toEqual({ score: null, quality: null, speed: null, avg_response_s: null, success: null, cases: [] });
  });

  it("formats test case keys consistently", () => {
    expect(testCaseLabel("regex_test_score")).toBe("regex");
    expect(testCaseLabel("e2e_5turn_s1_fixed_v2")).toBe("e2e 5turn s1 fixed v2");
  });
});
