import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";

// Mock the i18n store to return keys as-is
vi.mock("$lib/i18n", () => ({
  t: { subscribe: (fn: (v: (k: string) => string) => void) => { fn((k: string) => k); return () => {}; } },
  dict: { subscribe: (fn: (v: Record<string, unknown>) => void) => { fn({}); return () => {}; } },
  getDictKeys: () => [],
}));

import { ComboSelect } from "@primebrick/ui";

// Multi-mode checkbox chrome contract: each option row carries a
// `.combo-select-checkbox` square — unchecked = neutral `border-input` on
// `bg-background`; checked = sky→indigo gradient, white check, borderless.
// Pins the visual state distinction the plan's B4 audit calls "gradient
// states" — a regression that flattens both states to the same chrome
// makes selected rows indistinguishable at a glance.
describe("ComboSelect multi-mode checkbox chrome", () => {
  async function openListbox(value: string[]) {
    const { container } = render(ComboSelect, {
      props: {
        mode: "multi",
        options: ["alpha", "beta"],
        value,
        valueField: undefined,
      },
      target: document.body,
    });
    const trigger = container.querySelector('[role="combobox"]');
    expect(trigger).not.toBeNull();
    await fireEvent.click(trigger!);
    await vi.waitFor(() => {
      expect(document.querySelectorAll(".combo-select-checkbox").length).toBe(2);
    });
    return Array.from(document.querySelectorAll<HTMLElement>(".combo-select-checkbox"));
  }

  it("renders one checkbox square per option row", async () => {
    const boxes = await openListbox([]);
    expect(boxes).toHaveLength(2);
  });

  it("checked option carries the sky→indigo gradient chrome", async () => {
    const boxes = await openListbox(["alpha"]);
    const checked = boxes.find((b) => b.className.includes("from-sky-400"));
    expect(checked).toBeDefined();
    expect(checked!.className).toContain("bg-linear-to-br");
    expect(checked!.className).toContain("to-indigo-400");
    expect(checked!.className).toContain("text-white");
    // white check glyph inside the checked square
    expect(checked!.querySelector("svg")).not.toBeNull();
  });

  it("unchecked option keeps the neutral border-input chrome", async () => {
    const boxes = await openListbox(["alpha"]);
    const unchecked = boxes.find((b) => !b.className.includes("from-sky-400"));
    expect(unchecked).toBeDefined();
    expect(unchecked!.className).toContain("border-input");
    expect(unchecked!.className).toContain("bg-background");
    expect(unchecked!.querySelector("svg")).toBeNull();
  });

  it("both states coexist on the same list — selected + unselected partition", async () => {
    const boxes = await openListbox(["alpha"]);
    const checkedCount = boxes.filter((b) => b.className.includes("from-sky-400")).length;
    const uncheckedCount = boxes.filter((b) => b.className.includes("border-input")).length;
    expect(checkedCount).toBe(1);
    expect(uncheckedCount).toBe(1);
  });
});
