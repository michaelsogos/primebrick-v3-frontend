import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/svelte";
import { DynamicIcon } from "@primebrick/ui";

// CUSTOM_ICONS resolution: authored lucide-vocabulary glyphs (e.g.
// trash-arrow-up) resolve synchronously through DynamicIcon before the
// lucide glob — every restore surface (bulk CTA, row/card actions, state
// renderer, preview panel) renders this ONE glyph instead of the retired
// two-icon Trash+ArrowUpFromLine compound.
const TRASH_RESTORE_PATHS = [
  "M3 6h18",
  "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  "M5 6v14a2 2 0 0 0 2 2h1",
  "M19 6v14a2 2 0 0 1-2 2h-1",
  "m9 15 3-3 3 3",
  "M12 12v10",
];

// table-dictionary — the dict-kind default route icon (DEFAULT_ROUTE_ICONS
// emits it for every dict route without an authored icon; nav leaves
// inherit it). Authored glyph: table construction, column split at x=10.5
// (7.5u code / 10.5u label ≈ 42/58).
const TABLE_DICTIONARY_PATHS = ["M10.5 3v18", "M3 9h18", "M3 15h18"];

describe("DynamicIcon — CUSTOM_ICONS (trash-arrow-up)", () => {
  it("renders the authored glyph with the lucide chrome contract", async () => {
    const { container } = render(DynamicIcon, { props: { name: "trash-arrow-up", size: 14 } });
    await waitFor(() => expect(container.querySelector("svg")).toBeInTheDocument());
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "14");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg).toHaveAttribute("stroke-width", "2");
    expect([...svg.querySelectorAll("path")].map((p) => p.getAttribute("d"))).toEqual(TRASH_RESTORE_PATHS);
  });

  it("inherits host color classes (warning restore surfaces)", async () => {
    const { container } = render(DynamicIcon, { props: { name: "trash-arrow-up", class: "size-4 text-warning/70" } });
    await waitFor(() => expect(container.querySelector("svg")).toBeInTheDocument());
    expect(container.querySelector("svg")!.getAttribute("class")).toContain("text-warning/70");
  });
});

describe("DynamicIcon — CUSTOM_ICONS (table-dictionary)", () => {
  it("renders the authored glyph — divider path + rect + two row lines", async () => {
    const { container } = render(DynamicIcon, { props: { name: "table-dictionary", size: 16 } });
    await waitFor(() => expect(container.querySelector("svg")).toBeInTheDocument());
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "16");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect([...svg.querySelectorAll("path")].map((p) => p.getAttribute("d"))).toEqual(TABLE_DICTIONARY_PATHS);
    const rect = svg.querySelector("rect")!;
    expect(rect).toHaveAttribute("width", "18");
    expect(rect).toHaveAttribute("x", "3");
    expect(rect).toHaveAttribute("rx", "2");
  });
});
