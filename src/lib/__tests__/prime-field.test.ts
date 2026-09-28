import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";

// Mock the i18n store to return keys as-is
vi.mock("$lib/i18n", () => ({
  t: { subscribe: (fn: (v: (k: string) => string) => void) => { fn((k: string) => k); return () => {}; } },
  dict: { subscribe: (fn: (v: Record<string, unknown>) => void) => { fn({}); return () => {}; } },
  getDictKeys: () => [],
}));

import PrimeField from "$lib/components/ui/form/prime-field.svelte";
import PrimeFieldHelpFixture from "./fixtures/prime-field-help-fixture.svelte";

// Control snippet that renders a real input with the injected id.
// Raw-snippet args arrive as getters; the component passes `{ id }`.
const inputControl = createRawSnippet<[{ id: string }]>((args) => ({
  render: () => `<input id="${args().id}" data-testid="ctl" />`,
}));

describe("PrimeField", () => {
  it("wires label for / control id (stacked)", () => {
    render(PrimeField, {
      props: { id: "email", label: "Email", control: inputControl },
    });
    const input = screen.getByTestId("ctl") as HTMLInputElement;
    const label = screen.getByText("Email");
    expect(label.tagName).toBe("LABEL");
    expect(label).toHaveAttribute("for", "email");
    expect(input.id).toBe("email");
    // Accessible name resolves the control
    expect(screen.getByLabelText("Email")).toBe(input);
  });

  it("generates a stable id when none is provided", () => {
    render(PrimeField, { props: { label: "Name", control: inputControl } });
    const input = screen.getByTestId("ctl") as HTMLInputElement;
    expect(input.id).toBeTruthy();
    expect(screen.getByText("Name")).toHaveAttribute("for", input.id);
  });

  it("renders required marker", () => {
    render(PrimeField, {
      props: { id: "f1", label: "Req", required: true, control: inputControl },
    });
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("renders hint and error lines", () => {
    render(PrimeField, {
      props: {
        id: "f2",
        label: "X",
        hint: "helper text",
        error: ["first problem", "second problem"],
        control: inputControl,
      },
    });
    expect(screen.getByText("helper text")).toBeInTheDocument();
    expect(screen.getByText("first problem")).toBeInTheDocument();
    expect(screen.getByText("second problem")).toBeInTheDocument();
  });

  it("layout=inline puts control first and keeps label wiring", () => {
    const { container } = render(PrimeField, {
      props: { id: "sw", label: "Toggle me", layout: "inline", control: inputControl },
    });
    const row = container.querySelector(".flex.items-center")!;
    expect(row.firstElementChild).toBe(screen.getByTestId("ctl"));
    const label = screen.getByText("Toggle me");
    expect(label.tagName).toBe("LABEL");
    expect(label).toHaveAttribute("for", "sw");
    expect(screen.getByLabelText("Toggle me")).toBe(screen.getByTestId("ctl"));
  });

  it("renders help tooltip from pre-mapped shape", () => {
    // Tooltip.Root requires a global Tooltip.Provider — provided by the fixture.
    render(PrimeFieldHelpFixture, {
      props: { help: { text: "tooltip body" }, control: inputControl },
    });
    expect(screen.getByLabelText("Help")).toBeInTheDocument();
  });

  it("renders help from raw MetaColumn shape, honoring show_form_tooltip", () => {
    render(PrimeFieldHelpFixture, {
      props: {
        help: { tooltip: "meta.tooltip.key", tooltip_priority: "INFORMATION" as never },
        control: inputControl,
      },
    });
    expect(screen.getByLabelText("Help")).toBeInTheDocument();
  });

  it("suppresses meta help when show_form_tooltip is false", () => {
    render(PrimeFieldHelpFixture, {
      props: {
        help: { tooltip: "meta.tooltip.key", show_form_tooltip: false },
        control: inputControl,
      },
    });
    expect(screen.queryByLabelText("Help")).not.toBeInTheDocument();
  });
});
