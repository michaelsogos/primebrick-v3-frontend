import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";

// Mock the i18n store to return keys as-is
vi.mock("$lib/i18n", () => ({
  t: { subscribe: (fn: (v: (k: string) => string) => void) => { fn((k: string) => k); return () => {}; } },
  dict: { subscribe: (fn: (v: Record<string, unknown>) => void) => { fn({}); return () => {}; } },
  getDictKeys: () => [],
}));

import AiIcon from "$lib/components/ui/ai-icon/ai-icon.svelte";
import GradientIcon from "$lib/components/ui/gradient-icon/gradient-icon.svelte";
import SheetHeader from "$lib/shell/sheets/SheetHeader.svelte";
import AppTopbar from "$lib/components/AppTopbar.svelte";

describe("$$Props → typed $props() migration — render regressions", () => {
  it("AiIcon renders with defaults", () => {
    const { container } = render(AiIcon, { props: {} });
    const svg = container.querySelector("svg")!;
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("width", "24");
    expect(svg).toHaveAttribute("stroke-width", "2");
  });

  it("AiIcon honors overrides", () => {
    const { container } = render(AiIcon, {
      props: { size: 32, stroke_width: 1.5, class: "custom", no_animation: true },
    });
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "32");
    expect(svg).toHaveAttribute("stroke-width", "1.5");
    expect(svg.getAttribute("class")).toContain("custom");
  });

  it("GradientIcon renders paths with defaults", () => {
    const { container } = render(GradientIcon, {
      props: { paths: ["M1 1h20v20H1z"] },
    });
    const svg = container.querySelector("svg")!;
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("width", "24");
    expect(container.querySelector("path")).toBeInTheDocument();
  });

  it("SheetHeader renders title and actions snippets", () => {
    render(SheetHeader, {
      props: {
        title: createRawSnippet(() => ({ render: () => `<span>My title</span>` })),
        actions: createRawSnippet(() => ({ render: () => `<button>Act</button>` })),
      },
    });
    expect(screen.getByText("My title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument();
  });

  it("AppTopbar renders (unreadNotifications default prop)", () => {
    const { container } = render(AppTopbar, { props: {} });
    expect(container.querySelector("header")).toBeInTheDocument();
  });
});
