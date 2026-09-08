import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";

// Mock the sheet-manager to avoid side effects
vi.mock("$lib/shell/sheets/sheet-manager.svelte", () => ({
  openSheet: vi.fn(),
  closeSheet: vi.fn(),
  sheetState: { open: false, panelId: null, props: null, side: "right", contentClass: "w-[420px] p-0", keepMountedState: false, modal: true },
}));

// Mock the i18n store to return keys as-is
vi.mock("$lib/i18n", () => ({
  t: { subscribe: (fn: (v: (k: string) => string) => void) => { fn((k: string) => k); return () => {}; } },
  dict: { subscribe: (fn: (v: Record<string, unknown>) => void) => { fn({}); return () => {}; } },
  getDictKeys: () => [],
}));

import SmartRegexInput from "$lib/components/ui/smart-regex-input/smart-regex-input.svelte";
import { openSheet } from "$lib/shell/sheets/sheet-manager.svelte";

describe("SmartRegexInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the input with placeholder", () => {
    render(SmartRegexInput, { props: { placeholder: "^[A-Z]{3}$" } });
    expect(screen.getByTestId("smart-regex-input")).toBeInTheDocument();
  });

  it("shows flags CTA and brain CTA", () => {
    render(SmartRegexInput, { props: {} });
    expect(screen.getByTestId("smart-regex-flags-cta")).toBeInTheDocument();
    expect(screen.getByTestId("smart-regex-brain-cta")).toBeInTheDocument();
  });

  it("shows error for invalid regex pattern", async () => {
    render(SmartRegexInput, { props: {} });
    const input = screen.getByTestId("smart-regex-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "[a-" } });
    expect(screen.getByTestId("smart-regex-input-error")).toBeInTheDocument();
  });

  it("does not show error for valid regex pattern", async () => {
    render(SmartRegexInput, { props: {} });
    const input = screen.getByTestId("smart-regex-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "^[a-z]+$" } });
    expect(screen.queryByTestId("smart-regex-input-error")).not.toBeInTheDocument();
  });

  it("opens flags panel when flags CTA is clicked", async () => {
    const user = userEvent.setup();
    render(SmartRegexInput, { props: { config_type: "string" } });
    const flagsCta = screen.getByTestId("smart-regex-flags-cta");
    await user.click(flagsCta);
    expect(openSheet).toHaveBeenCalledWith(
      "config.regexFlags",
      expect.objectContaining({ config_type: "string" }),
    );
  });

  it("opens AI chat panel when brain CTA is clicked", async () => {
    const user = userEvent.setup();
    render(SmartRegexInput, { props: { config_type: "string" } });
    const brainCta = screen.getByTestId("smart-regex-brain-cta");
    await user.click(brainCta);
    expect(openSheet).toHaveBeenCalledWith(
      "config.regexAiChat",
      expect.objectContaining({ config_type: "string" }),
    );
  });

  it("shows flags badge when flags are set", () => {
    render(SmartRegexInput, { props: { flags: "gi" } });
    expect(screen.getByTestId("smart-regex-flags-badge")).toBeInTheDocument();
  });

  it("does not show flags badge when no flags are set", () => {
    render(SmartRegexInput, { props: { flags: "" } });
    expect(screen.queryByTestId("smart-regex-flags-badge")).not.toBeInTheDocument();
  });

  it("shows clear button when value is present", () => {
    render(SmartRegexInput, { props: { value: "^[a-z]+$" } });
    expect(screen.getByTestId("smart-regex-clear")).toBeInTheDocument();
  });

  it("does not show clear button when value is empty", () => {
    render(SmartRegexInput, { props: { value: "" } });
    expect(screen.queryByTestId("smart-regex-clear")).not.toBeInTheDocument();
  });

  it("clears the value when clear button is clicked", async () => {
    const user = userEvent.setup();
    const { component } = render(SmartRegexInput, { props: { value: "^[a-z]+$" } });
    const clearBtn = screen.getByTestId("smart-regex-clear");
    await user.click(clearBtn);
    // After clearing, the clear button should disappear
    expect(screen.queryByTestId("smart-regex-clear")).not.toBeInTheDocument();
  });

  it("calls on_change when value changes", async () => {
    const on_change = vi.fn();
    render(SmartRegexInput, { props: { on_change } });
    const input = screen.getByTestId("smart-regex-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "^[a-z]+$" } });
    expect(on_change).toHaveBeenCalled();
  });

  it("validates regex with flags", async () => {
    render(SmartRegexInput, { props: { flags: "i" } });
    const input = screen.getByTestId("smart-regex-input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "^[a-z]+$" } });
    expect(screen.queryByTestId("smart-regex-input-error")).not.toBeInTheDocument();
  });
});
