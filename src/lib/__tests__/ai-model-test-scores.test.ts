import { describe, expect, it } from "vitest";
import { parseScoreValue, summarizeTestScores, testCaseLabel } from "$lib/ai/ai-model-test-scores";

describe("AI model test score normalization", () => {
  it("reads the current score_detail shape including speed", () => {
    const summary = summarizeTestScores({
      score_detail: { quality: 5, speed: 4.1, score: 4.8, success: "5/5" },
      protocol: "e2e_5turn_s1_fixed_v2",
      turns: [{ score: 5 }, { score: 4 }],
    });

    expect(summary.score).toBe(4.8);
    expect(summary.quality).toBe(5);
    expect(summary.speed).toBe(4.1);
    expect(summary.success).toBe("5/5");
    expect(summary.cases[0]).toMatchObject({ key: "e2e_5turn_s1_fixed_v2", score: 4.8, runs: [5, 4] });
  });

  it("reads nested and legacy score shapes", () => {
    const summary = summarizeTestScores({
      e2e_5turn_s1_fixed_v2: { score: "4/5" },
      regex_test_score: { runs: [5, 4, 3], success_count: 2, total_turns: 3 },
    });

    expect(summary.score).toBe(4);
    expect(summary.success).toBe("2/3");
    expect(summary.cases).toHaveLength(2);
  });

  it("returns null for missing or invalid scores", () => {
    expect(parseScoreValue(undefined)).toBeNull();
    expect(parseScoreValue("invalid")).toBeNull();
    expect(summarizeTestScores(null)).toEqual({ score: null, quality: null, speed: null, success: null, cases: [] });
  });

  it("formats test case keys consistently", () => {
    expect(testCaseLabel("regex_test_score")).toBe("regex");
    expect(testCaseLabel("e2e_5turn_s1_fixed_v2")).toBe("e2e 5turn s1 fixed v2");
  });
});
