import { describe, it, expect } from "vitest";
import { buildConfigValueSchema, buildConfigFormSchema, buildConfigFormInitialValues } from "$lib/validation/config-validation";
import type { ConfigEntry } from "$lib/api-types";

function safeParse(schema: ReturnType<typeof buildConfigValueSchema>, value: string) {
  return schema.safeParse(value);
}

describe("buildConfigValueSchema — bigint", () => {
  it("accepts a valid integer string", () => {
    const schema = buildConfigValueSchema("bigint");
    expect(safeParse(schema, "30").success).toBe(true);
    expect(safeParse(schema, "-5").success).toBe(true);
    expect(safeParse(schema, "0").success).toBe(true);
  });

  it("rejects a decimal string", () => {
    const schema = buildConfigValueSchema("bigint");
    expect(safeParse(schema, "1.5").success).toBe(false);
  });

  it("rejects a non-numeric string", () => {
    const schema = buildConfigValueSchema("bigint");
    expect(safeParse(schema, "abc").success).toBe(false);
  });

  it("enforces min rule (numeric value)", () => {
    const tc = JSON.stringify({
      validation: { required: true, rules: { min: { value: 1, error_label_key: "err.min" } } },
    });
    const schema = buildConfigValueSchema("bigint", tc);
    expect(safeParse(schema, "0").success).toBe(false);
    expect(safeParse(schema, "1").success).toBe(true);
    expect(safeParse(schema, "90").success).toBe(true);
  });

  it("enforces max rule (numeric value)", () => {
    const tc = JSON.stringify({
      validation: { required: true, rules: { max: { value: 90, error_label_key: "err.max" } } },
    });
    const schema = buildConfigValueSchema("bigint", tc);
    expect(safeParse(schema, "91").success).toBe(false);
    expect(safeParse(schema, "90").success).toBe(true);
  });

  it("accepts empty string when not required", () => {
    const schema = buildConfigValueSchema("bigint");
    expect(safeParse(schema, "").success).toBe(true);
  });

  it("rejects empty string with only the required error (not invalidBigint) when required", () => {
    const tc = JSON.stringify({ validation: { required: true, rules: {} } });
    const schema = buildConfigValueSchema("bigint", tc);
    const result = safeParse(schema, "");
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should have exactly ONE error — the required error, not invalidBigint
      expect(result.error.issues.length).toBe(1);
      expect(result.error.issues[0].message).toBe("validation.required");
    }
  });
});

describe("buildConfigValueSchema — number", () => {
  it("accepts a decimal string", () => {
    const schema = buildConfigValueSchema("number");
    expect(safeParse(schema, "3.14").success).toBe(true);
    expect(safeParse(schema, "100").success).toBe(true);
  });

  it("rejects a non-numeric string", () => {
    const schema = buildConfigValueSchema("number");
    expect(safeParse(schema, "abc").success).toBe(false);
  });

  it("enforces min rule (numeric value)", () => {
    const tc = JSON.stringify({
      validation: { required: true, rules: { min: { value: 0, error_label_key: "err.min" } } },
    });
    const schema = buildConfigValueSchema("number", tc);
    expect(safeParse(schema, "-1").success).toBe(false);
    expect(safeParse(schema, "0").success).toBe(true);
    expect(safeParse(schema, "0.5").success).toBe(true);
  });
});

describe("buildConfigValueSchema — money", () => {
  it("accepts a decimal amount", () => {
    const schema = buildConfigValueSchema("money");
    expect(safeParse(schema, "99.99").success).toBe(true);
    expect(safeParse(schema, "0").success).toBe(true);
  });

  it("rejects a non-numeric amount", () => {
    const schema = buildConfigValueSchema("money");
    expect(safeParse(schema, "abc").success).toBe(false);
  });

  it("enforces min rule (numeric value)", () => {
    const tc = JSON.stringify({
      validation: { required: true, rules: { min: { value: 0, error_label_key: "err.min" } } },
    });
    const schema = buildConfigValueSchema("money", tc);
    expect(safeParse(schema, "-1").success).toBe(false);
    expect(safeParse(schema, "0").success).toBe(true);
  });

  it("enforces max rule (numeric value)", () => {
    const tc = JSON.stringify({
      validation: { required: true, rules: { max: { value: 1000, error_label_key: "err.max" } } },
    });
    const schema = buildConfigValueSchema("money", tc);
    expect(safeParse(schema, "1000.01").success).toBe(false);
    expect(safeParse(schema, "1000").success).toBe(true);
  });
});

describe("buildConfigValueSchema — boolean", () => {
  it("accepts 'true' and 'false'", () => {
    const schema = buildConfigValueSchema("boolean");
    expect(safeParse(schema, "true").success).toBe(true);
    expect(safeParse(schema, "false").success).toBe(true);
  });

  it("rejects other strings", () => {
    const schema = buildConfigValueSchema("boolean");
    expect(safeParse(schema, "yes").success).toBe(false);
  });
});

describe("buildConfigValueSchema — url", () => {
  it("accepts a valid URL", () => {
    const schema = buildConfigValueSchema("url");
    expect(safeParse(schema, "https://example.com").success).toBe(true);
  });

  it("rejects an invalid URL", () => {
    const schema = buildConfigValueSchema("url");
    expect(safeParse(schema, "not-a-url").success).toBe(false);
  });
});

describe("buildConfigValueSchema — json", () => {
  it("accepts valid JSON", () => {
    const schema = buildConfigValueSchema("json");
    expect(safeParse(schema, '{"key":"value"}').success).toBe(true);
  });

  it("rejects invalid JSON", () => {
    const schema = buildConfigValueSchema("json");
    expect(safeParse(schema, "{invalid").success).toBe(false);
  });
});

describe("buildConfigValueSchema — required", () => {
  it("rejects empty string when required=true", () => {
    const tc = JSON.stringify({ validation: { required: true, rules: {} } });
    const schema = buildConfigValueSchema("string", tc);
    expect(safeParse(schema, "").success).toBe(false);
  });

  it("allows empty string when required=false", () => {
    const tc = JSON.stringify({ validation: { required: false, rules: {} } });
    const schema = buildConfigValueSchema("string", tc);
    expect(safeParse(schema, "").success).toBe(true);
  });
});

describe("buildConfigValueSchema — string min/max (length)", () => {
  it("enforces min length", () => {
    const tc = JSON.stringify({
      validation: { required: true, rules: { min: { value: 6, error_label_key: "err.min" } } },
    });
    const schema = buildConfigValueSchema("string", tc);
    expect(safeParse(schema, "abc").success).toBe(false);
    expect(safeParse(schema, "abcdef").success).toBe(true);
  });

  it("enforces max length", () => {
    const tc = JSON.stringify({
      validation: { required: true, rules: { max: { value: 5, error_label_key: "err.max" } } },
    });
    const schema = buildConfigValueSchema("string", tc);
    expect(safeParse(schema, "abcdef").success).toBe(false);
    expect(safeParse(schema, "abc").success).toBe(true);
  });
});

describe("buildConfigFormSchema", () => {
  function makeEntry(uuid: string, type: ConfigEntry["type"], value: string | null): ConfigEntry {
    return {
      uuid,
      key: `test_${uuid}`,
      value,
      type,
      type_config: null,
      label_key: null,
      description_key: null,
      reserved: false,
      group_key: null,
      created_at: "",
      updated_at: "",
      version: 1,
    } as unknown as ConfigEntry;
  }

  it("builds an object schema keyed by UUID", () => {
    const entries = [
      makeEntry("uuid-1", "bigint", "30"),
      makeEntry("uuid-2", "string", "hello"),
    ];
    const schema = buildConfigFormSchema(entries);
    const result = schema.safeParse({ "uuid-1": "30", "uuid-2": "hello" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid values per entry", () => {
    const entries = [makeEntry("uuid-1", "bigint", "30")];
    const schema = buildConfigFormSchema(entries);
    const result = schema.safeParse({ "uuid-1": "1.5" });
    expect(result.success).toBe(false);
  });
});

describe("buildConfigFormInitialValues", () => {
  function makeEntry(uuid: string, value: string | bigint | number | null): ConfigEntry {
    return {
      uuid,
      key: `test_${uuid}`,
      value,
      type: "bigint",
      type_config: null,
      label_key: null,
      description_key: null,
      reserved: false,
      group_key: null,
      created_at: "",
      updated_at: "",
      version: 1,
    } as unknown as ConfigEntry;
  }

  it("returns empty string for null values", () => {
    const entries = [makeEntry("uuid-1", null)];
    const data = buildConfigFormInitialValues(entries);
    expect(data["uuid-1"]).toBe("");
  });

  it("returns the value as-is for non-null values", () => {
    const entries = [makeEntry("uuid-1", "42")];
    const data = buildConfigFormInitialValues(entries);
    expect(data["uuid-1"]).toBe("42");
  });

  it("handles multiple entries", () => {
    const entries = [
      makeEntry("uuid-1", "42"),
      makeEntry("uuid-2", null),
    ];
    const data = buildConfigFormInitialValues(entries);
    expect(Object.keys(data).sort()).toEqual(["uuid-1", "uuid-2"]);
    expect(data["uuid-1"]).toBe("42");
    expect(data["uuid-2"]).toBe("");
  });
});

// ─── unsigned flag ──────────────────────────────────────────────────────

describe("buildConfigValueSchema — unsigned bigint", () => {
  it("rejects negative sign when unsigned=true", () => {
    const tc = JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } });
    const schema = buildConfigValueSchema("bigint", tc);
    expect(safeParse(schema, "-5").success).toBe(false);
  });

  it("rejects plus sign when unsigned=true", () => {
    const tc = JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } });
    const schema = buildConfigValueSchema("bigint", tc);
    expect(safeParse(schema, "+5").success).toBe(false);
  });

  it("accepts positive value when unsigned=true", () => {
    const tc = JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } });
    const schema = buildConfigValueSchema("bigint", tc);
    expect(safeParse(schema, "5").success).toBe(true);
    expect(safeParse(schema, "0").success).toBe(true);
  });

  it("defaults min to 0 when unsigned=true and no explicit min rule", () => {
    const tc = JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } });
    const schema = buildConfigValueSchema("bigint", tc);
    // The regex already rejects negatives, but the default-min=0 adds a second guard
    expect(safeParse(schema, "0").success).toBe(true);
    expect(safeParse(schema, "42").success).toBe(true);
  });

  it("respects explicit min rule over default 0 when unsigned=true", () => {
    const tc = JSON.stringify({
      validation: { unsigned: true, required: true, rules: { min: { value: 10, error_label_key: "err.min" } } },
    });
    const schema = buildConfigValueSchema("bigint", tc);
    expect(safeParse(schema, "5").success).toBe(false);
    expect(safeParse(schema, "10").success).toBe(true);
  });

  it("allows negative when unsigned is absent (default signed)", () => {
    const tc = JSON.stringify({ validation: { required: true, rules: {} } });
    const schema = buildConfigValueSchema("bigint", tc);
    expect(safeParse(schema, "-5").success).toBe(true);
  });

  it("allows negative when unsigned=false (explicit signed)", () => {
    const tc = JSON.stringify({ validation: { unsigned: false, required: true, rules: {} } });
    const schema = buildConfigValueSchema("bigint", tc);
    expect(safeParse(schema, "-5").success).toBe(true);
  });
});

describe("buildConfigValueSchema — unsigned number", () => {
  it("rejects negative sign when unsigned=true", () => {
    const tc = JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } });
    const schema = buildConfigValueSchema("number", tc);
    expect(safeParse(schema, "-3.14").success).toBe(false);
  });

  it("rejects plus sign when unsigned=true", () => {
    const tc = JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } });
    const schema = buildConfigValueSchema("number", tc);
    expect(safeParse(schema, "+3.14").success).toBe(false);
  });

  it("accepts positive decimal when unsigned=true", () => {
    const tc = JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } });
    const schema = buildConfigValueSchema("number", tc);
    expect(safeParse(schema, "3.14").success).toBe(true);
    expect(safeParse(schema, "0").success).toBe(true);
  });
});

describe("buildConfigValueSchema — unsigned money", () => {
  it("rejects negative sign when unsigned=true", () => {
    const tc = JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } });
    const schema = buildConfigValueSchema("money", tc);
    expect(safeParse(schema, "-99.99").success).toBe(false);
  });

  it("accepts positive amount when unsigned=true", () => {
    const tc = JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } });
    const schema = buildConfigValueSchema("money", tc);
    expect(safeParse(schema, "99.99").success).toBe(true);
    expect(safeParse(schema, "0").success).toBe(true);
  });

  it("defaults min to 0 when unsigned=true and no explicit min rule", () => {
    const tc = JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } });
    const schema = buildConfigValueSchema("money", tc);
    expect(safeParse(schema, "0").success).toBe(true);
    expect(safeParse(schema, "0.01").success).toBe(true);
  });
});

describe("buildConfigValueSchema — unsigned only affects numeric types", () => {
  it("does not affect string type", () => {
    const tc = JSON.stringify({ validation: { unsigned: true, required: true, rules: {} } });
    const schema = buildConfigValueSchema("string", tc);
    // String with a minus sign is fine — unsigned is a no-op for non-numeric types
    expect(safeParse(schema, "-hello-").success).toBe(true);
  });
});
