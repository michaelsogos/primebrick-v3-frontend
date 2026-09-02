import { describe, it, expect } from "vitest";
import { extJsonParse, extJsonStringify } from "$lib/api-ext";

describe("extJsonParse", () => {
  it("parses small integers as native bigint", () => {
    const parsed = extJsonParse<{ id: bigint }>(`{"id":42}`);
    expect(typeof parsed.id).toBe("bigint");
    expect(parsed.id).toBe(42n);
  });

  it("parses large integers as native bigint (no precision loss)", () => {
    const big = "9007199254740993"; // Number.MAX_SAFE_INTEGER + 2
    const parsed = extJsonParse<{ id: bigint }>(`{"id":${big}}`);
    expect(typeof parsed.id).toBe("bigint");
    expect(parsed.id).toBe(9007199254740993n);
  });

  it("parses negative integers as bigint", () => {
    const parsed = extJsonParse<{ n: bigint }>(`{"n":-5}`);
    expect(typeof parsed.n).toBe("bigint");
    expect(parsed.n).toBe(-5n);
  });

  it("parses floats as number (not bigint)", () => {
    const parsed = extJsonParse<{ price: number }>(`{"price":3.14}`);
    expect(typeof parsed.price).toBe("number");
    expect(parsed.price).toBeCloseTo(3.14);
  });

  it("parses scientific-notation integers as bigint", () => {
    // 1e5 = 100000, which is an integer → bigint (by design)
    const parsed = extJsonParse<{ v: bigint }>(`{"v":1e5}`);
    expect(typeof parsed.v).toBe("bigint");
    expect(parsed.v).toBe(100000n);
  });

  it("parses scientific-notation floats as number", () => {
    // 1.5e2 = 150, which is an integer → bigint (by design)
    // Use 1.5e-1 = 0.15 to get a true float
    const parsed = extJsonParse<{ v: number }>(`{"v":1.5e-1}`);
    expect(typeof parsed.v).toBe("number");
    expect(parsed.v).toBeCloseTo(0.15);
  });

  it("preserves strings", () => {
    const parsed = extJsonParse<{ name: string }>(`{"name":"alice"}`);
    expect(parsed.name).toBe("alice");
  });

  it("preserves booleans", () => {
    const parsed = extJsonParse<{ active: boolean }>(`{"active":true}`);
    expect(parsed.active).toBe(true);
  });

  it("preserves null", () => {
    const parsed = extJsonParse<{ x: null }>(`{"x":null}`);
    expect(parsed.x).toBeNull();
  });

  it("forces every integer in nested objects to bigint", () => {
    const parsed = extJsonParse<{ nested: { qty: bigint } }>(
      `{"nested":{"qty":100}}`,
    );
    expect(typeof parsed.nested.qty).toBe("bigint");
    expect(parsed.nested.qty).toBe(100n);
  });

  it("forces integers in arrays to bigint", () => {
    const parsed = extJsonParse<{ ids: bigint[] }>(`{"ids":[1,2,3]}`);
    expect(parsed.ids.every((x) => typeof x === "bigint")).toBe(true);
    expect(parsed.ids).toEqual([1n, 2n, 3n]);
  });
});

describe("extJsonStringify", () => {
  it("serializes bigint as a JSON number (not string)", () => {
    const json = extJsonStringify({ id: 42n });
    expect(json).toBe('{"id":42}');
  });

  it("serializes large bigint without precision loss", () => {
    const json = extJsonStringify({ id: 9007199254740993n });
    expect(json).toBe('{"id":9007199254740993}');
  });

  it("serializes number floats normally", () => {
    const json = extJsonStringify({ price: 3.14 });
    expect(json).toBe('{"price":3.14}');
  });

  it("serializes strings with quotes", () => {
    const json = extJsonStringify({ name: "alice" });
    expect(json).toBe('{"name":"alice"}');
  });

  it("serializes nested bigint values", () => {
    const json = extJsonStringify({ nested: { qty: 100n } });
    expect(json).toBe('{"nested":{"qty":100}}');
  });
});

describe("Ext-JSON round-trip", () => {
  it("preserves bigint through stringify → parse", () => {
    const original = { id: 42n, name: "widget" };
    const roundTrip = extJsonParse<typeof original>(extJsonStringify(original));
    expect(typeof roundTrip.id).toBe("bigint");
    expect(roundTrip.id).toBe(42n);
    expect(roundTrip.name).toBe("widget");
  });

  it("preserves number floats through stringify → parse", () => {
    const original = { price: 3.14 };
    const roundTrip = extJsonParse<typeof original>(extJsonStringify(original));
    expect(typeof roundTrip.price).toBe("number");
    expect(roundTrip.price).toBeCloseTo(3.14);
  });

  it("preserves large bigint through stringify → parse", () => {
    const original = { id: 9007199254740993n };
    const roundTrip = extJsonParse<typeof original>(extJsonStringify(original));
    expect(roundTrip.id).toBe(9007199254740993n);
  });
});
