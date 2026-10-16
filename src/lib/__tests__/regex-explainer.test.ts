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

  it("explains anchored character class with quantifier (merged brackets, symbol-only quantifier)", () => {
    const parts = explainRegex("^[a-z]{3,5}$", "");
    // ^ + [ ] + a-z + {3,5} + $ = 5 parts
    expect(parts.length).toBe(5);
    expect(parts[0]).toEqual({ fragment: "^", meaning_key: `${K}.start` });
    expect(parts[1]).toEqual({ fragment: "[ ]", meaning_key: `${K}.char_class_brackets` });
    expect(parts[2]).toEqual({ fragment: "a-z", meaning_key: `${K}.char_range`, meaning_params: { min: "a", max: "z" } });
    expect(parts[3].fragment).toBe("{3,5}");
    expect(parts[3].meaning_key).toBe(`${K}.between`);
    expect(parts[4]).toEqual({ fragment: "$", meaning_key: `${K}.end` });
  });

  it("explains digit quantifier (symbol-only quantifier)", () => {
    const parts = explainRegex("\\d{4}", "");
    // \d + {4} = 2 parts
    expect(parts.length).toBe(2);
    expect(parts[0].fragment).toBe("\\d");
    expect(parts[0].meaning_key).toBe(`${K}.digit`);
    expect(parts[1].fragment).toBe("{4}");
    expect(parts[1].meaning_key).toBe(`${K}.exactly`);
  });

  it("explains word character with plus quantifier (symbol-only)", () => {
    const parts = explainRegex("\\w+", "");
    // \w + + = 2 parts
    expect(parts.length).toBe(2);
    expect(parts[0].fragment).toBe("\\w");
    expect(parts[0].meaning_key).toBe(`${K}.word`);
    expect(parts[1].fragment).toBe("+");
    expect(parts[1].meaning_key).toBe(`${K}.one_or_more`);
  });

  it("explains optional quantifier (symbol-only)", () => {
    const parts = explainRegex("a?", "");
    // a + ? = 2 parts
    expect(parts.length).toBe(2);
    expect(parts[0].fragment).toBe("a");
    expect(parts[0].meaning_key).toBe(`${K}.literal`);
    expect(parts[0].meaning_params?.char).toBe("a");
    expect(parts[1].fragment).toBe("?");
    expect(parts[1].meaning_key).toBe(`${K}.optional`);
  });

  it("explains star quantifier (symbol-only)", () => {
    const parts = explainRegex("a*", "");
    expect(parts.length).toBe(2);
    expect(parts[1].fragment).toBe("*");
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

  it("explains negated character class (merged brackets)", () => {
    const parts = explainRegex("[^0-9]", "");
    // [^ ] + 0-9 = 2 parts (merged brackets)
    expect(parts.length).toBe(2);
    expect(parts[0]).toEqual({ fragment: "[^ ]", meaning_key: `${K}.char_class_negated_brackets` });
    expect(parts[1]).toEqual({ fragment: "0-9", meaning_key: `${K}.char_range`, meaning_params: { min: "0", max: "9" } });
  });

  it("explains multi-element character class (merged brackets)", () => {
    const parts = explainRegex("[a-zA-Z0-9.]", "");
    // [ ] + a-z + A-Z + 0-9 + . = 5 parts (merged brackets)
    expect(parts.length).toBe(5);
    expect(parts[0]).toEqual({ fragment: "[ ]", meaning_key: `${K}.char_class_brackets` });
    expect(parts[1]).toEqual({ fragment: "a-z", meaning_key: `${K}.char_range`, meaning_params: { min: "a", max: "z" } });
    expect(parts[2]).toEqual({ fragment: "A-Z", meaning_key: `${K}.char_range`, meaning_params: { min: "A", max: "Z" } });
    expect(parts[3]).toEqual({ fragment: "0-9", meaning_key: `${K}.char_range`, meaning_params: { min: "0", max: "9" } });
    expect(parts[4]).toEqual({ fragment: ".", meaning_key: `${K}.literal`, meaning_params: { char: "." } });
  });

  it("explains capturing group with quantifier (symbol-only)", () => {
    const parts = explainRegex("(abc)+", "");
    // (abc) + + = 2 parts
    expect(parts.length).toBe(2);
    expect(parts[0].fragment).toBe("(abc)");
    expect(parts[0].meaning_key).toBe(`${K}.capturing_group`);
    expect(parts[1].fragment).toBe("+");
    expect(parts[1].meaning_key).toBe(`${K}.one_or_more`);
  });

  it("handles flags without error", () => {
    const parts = explainRegex("^[a-z]+$", "i");
    // ^ + [ ] + a-z + + + $ = 5 parts (merged brackets, symbol-only quantifier)
    expect(parts.length).toBe(5);
    expect(parts[0]).toEqual({ fragment: "^", meaning_key: `${K}.start` });
  });

  it("explains email-like pattern", () => {
    const parts = explainRegex("^\\w+@\\w+\\.\\w+$", "");
    expect(parts.length).toBeGreaterThanOrEqual(5);
    expect(parts[0]).toEqual({ fragment: "^", meaning_key: `${K}.start` });
    expect(parts[parts.length - 1]).toEqual({ fragment: "$", meaning_key: `${K}.end` });
  });

  it("explains full pattern like user example: ^[a-zA-Z0-9.]+$", () => {
    const parts = explainRegex("^[a-zA-Z0-9.]+$", "");
    // ^ + [ ] + a-z + A-Z + 0-9 + . + + + $ = 8 parts
    expect(parts.length).toBe(8);
    expect(parts[0]).toEqual({ fragment: "^", meaning_key: `${K}.start` });
    expect(parts[1]).toEqual({ fragment: "[ ]", meaning_key: `${K}.char_class_brackets` });
    expect(parts[2]).toEqual({ fragment: "a-z", meaning_key: `${K}.char_range`, meaning_params: { min: "a", max: "z" } });
    expect(parts[3]).toEqual({ fragment: "A-Z", meaning_key: `${K}.char_range`, meaning_params: { min: "A", max: "Z" } });
    expect(parts[4]).toEqual({ fragment: "0-9", meaning_key: `${K}.char_range`, meaning_params: { min: "0", max: "9" } });
    expect(parts[5]).toEqual({ fragment: ".", meaning_key: `${K}.literal`, meaning_params: { char: "." } });
    expect(parts[6]).toEqual({ fragment: "+", meaning_key: `${K}.one_or_more` });
    expect(parts[7]).toEqual({ fragment: "$", meaning_key: `${K}.end` });
  });
});
