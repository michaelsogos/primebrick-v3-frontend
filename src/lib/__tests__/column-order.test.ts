import { describe, it, expect } from "vitest";
import { parseColumnOrderState } from "../components/entity-list-table/composables/useColumnOrder.svelte";

describe("parseColumnOrderState", () => {
  it("returns {} for null raw", () => {
    expect(parseColumnOrderState(null)).toEqual({});
  });

  it("returns {} for invalid JSON", () => {
    expect(parseColumnOrderState("{not json")).toEqual({});
  });

  it("returns empty groups for non-object JSON", () => {
    expect(parseColumnOrderState('"just a string"')).toEqual({});
    expect(parseColumnOrderState("42")).toEqual({});
    expect(parseColumnOrderState("null")).toEqual({});
  });

  it("parses a full valid payload", () => {
    const raw = JSON.stringify({
      sticky: ["uuid"],
      data: ["name", "email"],
      auditing: ["created_at"],
    });
    expect(parseColumnOrderState(raw)).toEqual({
      sticky: ["uuid"],
      data: ["name", "email"],
      auditing: ["created_at"],
    });
  });

  it("filters non-string keys out of group arrays", () => {
    const raw = JSON.stringify({
      sticky: ["a", 1, null, "b", true],
      data: ["c", {}, "d"],
    });
    expect(parseColumnOrderState(raw)).toEqual({
      sticky: ["a", "b"],
      data: ["c", "d"],
      auditing: undefined,
    });
  });

  it("yields undefined for groups that are not arrays", () => {
    const raw = JSON.stringify({ sticky: "nope", data: 7 });
    const parsed = parseColumnOrderState(raw);
    expect(parsed.sticky).toBeUndefined();
    expect(parsed.data).toBeUndefined();
    expect(parsed.auditing).toBeUndefined();
  });

  it("accepts payloads with extra unknown keys", () => {
    const raw = JSON.stringify({ sticky: ["a"], somethingElse: { deep: 1 } });
    expect(parseColumnOrderState(raw).sticky).toEqual(["a"]);
  });
});
