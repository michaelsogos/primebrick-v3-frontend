import { describe, it, expect } from "vitest";
import { explainRegex } from "$lib/components/ui/smart-regex-input/regex-explainer";

const K = "app.smart.regex.explainer";

describe("explainRegex", () => {
  it("returns empty array for empty pattern", () => {
    expect(explainRegex("", "")).toEqual([]);
  });

  it("returns empty array for invalid regex", () => {
    expect(explainRegex("[a-", "")).toEqual([]);
    expect(explainRegex("(abc", "")).toEqual([]);
  });

  it("explains anchored character class with quantifier", () => {
    const parts = explainRegex("^[a-z]{3,5}$", "");
    // ^ + [a-z] + {3,5} + $ = 4 parts
    expect(parts.length).toBe(4);
    expect(parts[0]).toEqual({ fragment: "^", meaning_key: `${K}.start` });
    expect(parts[1].fragment).toBe("[a-z]");
    expect(parts[1].meaning_key).toBe(`${K}.char_class`);
    expect(parts[1].meaning_params?.content).toContain("a");
    expect(parts[2].fragment).toBe("[a-z]{3,5}");
    expect(parts[2].meaning_key).toBe(`${K}.between`);
    expect(parts[3]).toEqual({ fragment: "$", meaning_key: `${K}.end` });
  });

  it("explains digit quantifier", () => {
    const parts = explainRegex("\\d{4}", "");
    // \d + {4} = 2 parts
    expect(parts.length).toBe(2);
    expect(parts[0].fragment).toBe("\\d");
    expect(parts[0].meaning_key).toBe(`${K}.digit`);
    expect(parts[1].fragment).toBe("\\d{4}");
    expect(parts[1].meaning_key).toBe(`${K}.exactly`);
  });

  it("explains word character with plus quantifier", () => {
    const parts = explainRegex("\\w+", "");
    // \w + + = 2 parts
    expect(parts.length).toBe(2);
    expect(parts[0].fragment).toBe("\\w");
    expect(parts[0].meaning_key).toBe(`${K}.word`);
    expect(parts[1].fragment).toBe("\\w+");
    expect(parts[1].meaning_key).toBe(`${K}.one_or_more`);
  });

  it("explains optional quantifier", () => {
    const parts = explainRegex("a?", "");
    // a + ? = 2 parts
    expect(parts.length).toBe(2);
    expect(parts[0].fragment).toBe("a");
    expect(parts[0].meaning_key).toBe(`${K}.literal`);
    expect(parts[0].meaning_params?.char).toBe("a");
    expect(parts[1].fragment).toBe("a?");
    expect(parts[1].meaning_key).toBe(`${K}.optional`);
  });

  it("explains star quantifier", () => {
    const parts = explainRegex("a*", "");
    expect(parts.length).toBe(2);
    expect(parts[1].meaning_key).toBe(`${K}.zero_or_more`);
  });

  it("explains literal characters", () => {
    const parts = explainRegex("abc", "");
    expect(parts.length).toBe(3);
    expect(parts[0]).toEqual({ fragment: "a", meaning_key: `${K}.literal`, meaning_params: { char: "a" } });
    expect(parts[1]).toEqual({ fragment: "b", meaning_key: `${K}.literal`, meaning_params: { char: "b" } });
    expect(parts[2]).toEqual({ fragment: "c", meaning_key: `${K}.literal`, meaning_params: { char: "c" } });
  });

  it("explains escaped dot", () => {
    const parts = explainRegex("\\.", "");
    expect(parts.length).toBe(1);
    expect(parts[0]).toEqual({ fragment: "\\.", meaning_key: `${K}.literal_dot` });
  });

  it("explains negated character class", () => {
    const parts = explainRegex("[^0-9]", "");
    expect(parts.length).toBe(1);
    expect(parts[0].fragment).toBe("[^0-9]");
    expect(parts[0].meaning_key).toBe(`${K}.char_class_negated`);
    expect(parts[0].meaning_params).toBeTruthy();
  });

  it("explains capturing group with quantifier", () => {
    const parts = explainRegex("(abc)+", "");
    // (abc) + + = 2 parts
    expect(parts.length).toBe(2);
    expect(parts[0].fragment).toBe("(abc)");
    expect(parts[0].meaning_key).toBe(`${K}.capturing_group`);
    expect(parts[1].fragment).toBe("(abc)+");
    expect(parts[1].meaning_key).toBe(`${K}.one_or_more`);
  });

  it("handles flags without error", () => {
    const parts = explainRegex("^[a-z]+$", "i");
    // ^ + [a-z] + + + $ = 4 parts
    expect(parts.length).toBe(4);
    expect(parts[0]).toEqual({ fragment: "^", meaning_key: `${K}.start` });
  });

  it("explains email-like pattern", () => {
    const parts = explainRegex("^\\w+@\\w+\\.\\w+$", "");
    expect(parts.length).toBeGreaterThanOrEqual(5);
    expect(parts[0]).toEqual({ fragment: "^", meaning_key: `${K}.start` });
    expect(parts[parts.length - 1]).toEqual({ fragment: "$", meaning_key: `${K}.end` });
  });
});
