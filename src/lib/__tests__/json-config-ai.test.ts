import { describe, expect, it } from "vitest";
import {
  extractJsonCandidate,
  findUnknownJsonKeys,
} from "$lib/components/ui/smart-json-assistant/use-json-schema-ai.svelte";
import {
  validateCandidate,
} from "$lib/components/ui/smart-json-config/use-json-config-ai.svelte";
import {
  buildSchemaTopics,
  indexSchemaTopics,
  topicsToChoices,
  errorLabelRuleFromPath,
  setJsonPath,
} from "$lib/components/ui/smart-json-assistant/json-schema-explorer";
import {
  schemaForCapabilities,
} from "$lib/components/ui/smart-json-config/type-config-explorer";
import {
  localizeTopics,
} from "$lib/components/ui/smart-json-config/type-config-i18n";
import type { TypeCapabilities } from "$lib/api-types";
import { typeConfigJsonSchema } from "$lib/config/type-config-schema";
import {
  AI_TEST_CASES,
  summarizeTestScores,
} from "$lib/ai/ai-model-test-scores";

describe("extractJsonCandidate", () => {
  it("extracts a bare JSON object", () => {
    expect(extractJsonCandidate('{"validation":{"required":true}}')).toBe(
      '{"validation":{"required":true}}',
    );
  });

  it("strips markdown fences and prose around the object", () => {
    const raw = 'Here is the config:\n```json\n{"validation":{"required":false}}\n```\nDone.';
    expect(extractJsonCandidate(raw)).toBe('{"validation":{"required":false}}');
  });

  it("handles braces inside strings", () => {
    const raw = '{"validation":{"rules":{"regex":{"pattern":"a{2,3}"}}}}';
    expect(extractJsonCandidate(raw)).toBe(raw);
  });

  it("returns null when no JSON object is present", () => {
    expect(extractJsonCandidate("just a prose answer")).toBeNull();
    expect(extractJsonCandidate("{broken json")).toBeNull();
  });
});

describe("validateCandidate", () => {
  it("accepts a schema-valid type_config", () => {
    const result = validateCandidate(
      '{"validation":{"required":true,"rules":{"min":{"value":2,"error_label_key":"x.y"}}}}',
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects wrong types with precise issue paths", () => {
    const result = validateCandidate('{"validation":{"required":"banana"}}');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("required"))).toBe(true);
  });

  it("rejects unknown keys (additionalProperties: false)", () => {
    const result = validateCandidate('{"validation":{"requird":true}}');
    expect(result.valid).toBe(false);
  });

  it("rejects invalid JSON syntax", () => {
    const result = validateCandidate("{oops");
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(["Invalid JSON syntax"]);
  });
});

describe("schema explorer (deterministic cascade)", () => {
  const topics = buildSchemaTopics(typeConfigJsonSchema as never);
  const index = indexSchemaTopics(topics);

  it("builds a topic tree from the real schema", () => {
    expect(topics.length).toBeGreaterThan(0);
    const validation = index.get("validation");
    expect(validation).toBeDefined();
    expect(validation!.children.length).toBeGreaterThan(0);
  });

  it("indexes nested paths", () => {
    expect(index.get("validation.rules")).toBeDefined();
    expect(index.get("validation.rules.min")).toBeDefined();
  });

  it("marks expandable vs leaf topics as choices", () => {
    const choices = topicsToChoices(topics);
    const validationChoice = choices.find((c) => c.kind === "topic" && c.path === "validation");
    expect(validationChoice?.kind).toBe("topic");
    expect(validationChoice && "expandable" in validationChoice && validationChoice.expandable).toBe(
      true,
    );
  });
});

describe("schemaForCapabilities — type-aware scoping", () => {
  const stringCaps: TypeCapabilities = {
    validation: { required: true, unsigned: false, min: "length", max: "length", regex: true },
    widget: {},
  };
  const moneyCaps: TypeCapabilities = {
    validation: { required: true, unsigned: true, min: "value", max: "value", regex: false },
    widget: { currency: true },
  };
  const urlCaps: TypeCapabilities = {
    validation: { required: true, unsigned: false, min: "length", max: "length", regex: true },
    widget: { url_protocols: true },
  };

  it("string: keeps validation rules, drops widget props", () => {
    const s = schemaForCapabilities(typeConfigJsonSchema as never, stringCaps);
    expect(Object.keys(s.properties!)).toEqual(["validation"]);
    const rules = s.properties!.validation!.properties!.rules!.properties!;
    expect(Object.keys(rules).sort()).toEqual(["max", "min", "regex"]);
    expect(s.properties!.validation!.properties!.unsigned).toBeUndefined();
  });

  it("money: value bounds + unsigned + currency, no regex", () => {
    const s = schemaForCapabilities(typeConfigJsonSchema as never, moneyCaps);
    expect(s.properties!.currency).toBeDefined();
    expect(s.properties!.allowed_currencies).toBeDefined();
    expect(s.properties!.values).toBeUndefined();
    expect(s.properties!.validation!.properties!.unsigned).toBeDefined();
    expect(s.properties!.validation!.properties!.rules!.properties!.regex).toBeUndefined();
  });

  it("url: exposes url_protocols widget props", () => {
    const s = schemaForCapabilities(typeConfigJsonSchema as never, urlCaps);
    expect(s.properties!.allowed_protocols).toBeDefined();
    expect(s.properties!.default_protocol).toBeDefined();
    expect(s.properties!.api_url).toBeUndefined();
  });

  it("deprecated rules (url, email) are never surfaced", () => {
    const s = schemaForCapabilities(typeConfigJsonSchema as never, urlCaps);
    const rules = s.properties!.validation!.properties!.rules!.properties!;
    expect(rules.url).toBeUndefined();
    expect(rules.email).toBeUndefined();
  });
});

describe("test case isolation — JSON_EDITOR_WITH_SCHEMA", () => {
  it("keeps the new case key distinct from regex", () => {
    expect(AI_TEST_CASES.JSON_EDITOR_WITH_SCHEMA).toBe("json_editor_with_schema_test_score");
    expect(AI_TEST_CASES.JSON_EDITOR_WITH_SCHEMA).not.toBe(AI_TEST_CASES.REGEX);
  });

  it("averages quality across test cases (regex + json)", () => {
    const summary = summarizeTestScores({
      regex_test_score: { runs: [5, 5, 5], score: 5 },
      json_editor_with_schema_test_score: { runs: [3, 3, 3], score: 3 },
    });
    // mean of case scores: (5 + 3) / 2 = 4 — regex score not overwritten.
    expect(summary.score).toBe(4);
    expect(summary.cases).toHaveLength(2);
    expect(summary.cases.map((c) => c.key)).toContain("json_editor_with_schema_test_score");
  });
});

describe("findUnknownJsonKeys — silent zod-stripping guard", () => {
  it("flags a hallucinated rule like validation.rules.length", () => {
    const json = {
      validation: { required: true, rules: { length: { value: 5 } } },
    };
    const unknown = findUnknownJsonKeys(json, typeConfigJsonSchema);
    expect(unknown.map((u) => u.path)).toContain("validation.rules.length");
  });

  it("accepts all declared rule keys", () => {
    const json = {
      validation: {
        required: true,
        rules: {
          min: { value: 5 },
          max: { value: 5 },
          regex: { pattern: "^[a-zA-Z0-9]{5}$" },
        },
      },
    };
    expect(findUnknownJsonKeys(json, typeConfigJsonSchema)).toHaveLength(0);
  });

  it("allows open record maps (badge values) but checks their shape", () => {
    const ok = { values: { active: { label_key: "k", color: "green" } } };
    expect(findUnknownJsonKeys(ok, typeConfigJsonSchema)).toHaveLength(0);
    const bad = { values: { active: { bogus: "x" } } };
    expect(
      findUnknownJsonKeys(bad, typeConfigJsonSchema).map((u) => u.path),
    ).toContain("values.active.bogus");
  });

  it("flags unknown top-level keys", () => {
    const bad = { validation: { required: true }, nonsense: 1 };
    expect(
      findUnknownJsonKeys(bad, typeConfigJsonSchema).map((u) => u.path),
    ).toContain("nonsense");
  });
});

describe("error_label_key leaf detection + helpers", () => {
  it("marks *_error_label_key leaves with leaf_kind", () => {
    const topics = buildSchemaTopics(typeConfigJsonSchema as never);
    const validation = topics.find((t) => t.key === "validation");
    const reqKey = validation?.children.find((c) => c.key === "required_error_label_key");
    expect(reqKey?.leaf_kind).toBe("error_label_key");
    const rules = validation?.children.find((c) => c.key === "rules");
    const min = rules?.children.find((c) => c.key === "min");
    const minErr = min?.children.find((c) => c.key === "error_label_key");
    expect(minErr?.leaf_kind).toBe("error_label_key");
    expect(min?.leaf_kind).toBeUndefined();
  });

  it("derives rule names from paths", () => {
    expect(errorLabelRuleFromPath("validation.required_error_label_key")).toBe("required");
    expect(errorLabelRuleFromPath("validation.rules.min.error_label_key")).toBe("min");
    expect(errorLabelRuleFromPath("validation.rules.regex.error_label_key")).toBe("regex");
  });
});

describe("setJsonPath — deterministic merge for key-picker results", () => {
  it("sets nested values creating intermediate objects", () => {
    const out = setJsonPath({}, "validation.rules.min.error_label_key", "my.key");
    expect(out).toEqual({ validation: { rules: { min: { error_label_key: "my.key" } } } });
  });

  it("preserves existing siblings", () => {
    const base = { validation: { required: true, rules: { min: { value: 5 } } } };
    const out = setJsonPath(base, "validation.rules.min.error_label_key", "k");
    expect(out.validation.rules.min).toEqual({ value: 5, error_label_key: "k" });
    expect(out.validation.required).toBe(true);
  });
});

describe("localizeTopics — same i18n keys as the builder form", () => {
  it("localizes titles from the form key map", () => {
    const topics = buildSchemaTopics(typeConfigJsonSchema as never);
    const dict: Record<string, string> = {
      "system.settings.config.typeConfig.validationRules": "Regole di validazione",
      "system.settings.config.typeConfig.required": "Obbligatorio",
    };
    const loc = localizeTopics(topics, null, (k) => dict[k] ?? k);
    const validation = loc.find((t) => t.key === "validation");
    expect(validation?.title).toBe("Regole di validazione");
    const req = validation?.children.find((c) => c.key === "required");
    expect(req?.title).toBe("Obbligatorio");
  });

  it("min/max titles follow capabilities (length vs value)", () => {
    const topics = buildSchemaTopics(typeConfigJsonSchema as never);
    const dict: Record<string, string> = {
      "system.settings.config.typeConfig.minLength": "Lunghezza min",
      "system.settings.config.typeConfig.minValue": "Valore min",
    };
    const strCaps = { validation: { min: "length" }, widget: {} } as never;
    const numCaps = { validation: { min: "value" }, widget: {} } as never;
    const locStr = localizeTopics(topics, strCaps, (k) => dict[k] ?? k);
    const locNum = localizeTopics(topics, numCaps, (k) => dict[k] ?? k);
    const minStr = locStr[0]?.children.find((c) => c.key === "rules")?.children.find((c) => c.key === "min");
    const minNum = locNum[0]?.children.find((c) => c.key === "rules")?.children.find((c) => c.key === "min");
    expect(minStr?.title).toBe("Lunghezza min");
    expect(minNum?.title).toBe("Valore min");
  });
});
