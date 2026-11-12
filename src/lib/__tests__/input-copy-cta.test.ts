import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/svelte";

// Mock the i18n store to return keys as-is
vi.mock("$lib/i18n", () => ({
  t: { subscribe: (fn: (v: (k: string) => string) => void) => { fn((k: string) => k); return () => {}; } },
  dict: { subscribe: (fn: (v: Record<string, unknown>) => void) => { fn({}); return () => {}; } },
  getDictKeys: () => [],
}));

// url/phone inputs import openSheet — stub the sheet host
vi.mock("$lib/shell/sheets/sheet-manager.svelte", () => ({
  openSheet: vi.fn(),
  closeSheet: vi.fn(),
  sheetState: { open: false, panelId: null, props: null, side: "right", contentClass: "p-0", keepMountedState: false, modal: true },
}));

import { TextInput } from "@primebrick/ui";
import { EmailInput } from "$lib/components/ui/email-input";
import { UrlInput } from "$lib/components/ui/url-input";
import { PhoneInput } from "$lib/components/ui/phone-input";

// Copy CTA contract: readonly AND disabled inputs keep the copy affordance —
// the value is locked, not unreadable. Only editable mode swaps it for clear.
describe("TextInput copy CTA", () => {
  it("shows the copy CTA in readonly mode with a value", () => {
    const { container } = render(TextInput, { props: { value: "abc", readonly: true } });
    expect(container.querySelector('button[name="copy"]')).toBeInTheDocument();
  });

  it("shows the copy CTA in disabled mode with a value", () => {
    const { container } = render(TextInput, { props: { value: "abc", disabled: true } });
    expect(container.querySelector('button[name="copy"]')).toBeInTheDocument();
  });

  it("hides the copy CTA in disabled mode while empty", () => {
    const { container } = render(TextInput, { props: { value: "", disabled: true } });
    expect(container.querySelector('button[name="copy"]')).not.toBeInTheDocument();
  });

  it("hides the copy CTA in editable mode (clear owns the trailing edge)", () => {
    const { container } = render(TextInput, { props: { value: "abc" } });
    expect(container.querySelector('button[name="copy"]')).not.toBeInTheDocument();
  });
});

describe("EmailInput copy CTA", () => {
  it("shows the copy CTA in readonly mode with a value", () => {
    render(EmailInput, { props: { value: "a@b.c", readonly: true } });
    expect(screen.getByTestId("email-input-copy")).toBeInTheDocument();
  });

  it("shows the copy CTA in disabled mode with a value", () => {
    render(EmailInput, { props: { value: "a@b.c", disabled: true } });
    expect(screen.getByTestId("email-input-copy")).toBeInTheDocument();
  });

  it("hides the copy CTA in disabled mode while empty", () => {
    render(EmailInput, { props: { value: "", disabled: true } });
    expect(screen.queryByTestId("email-input-copy")).not.toBeInTheDocument();
  });

  it("shows the clear CTA instead in editable mode", () => {
    render(EmailInput, { props: { value: "a@b.c" } });
    expect(screen.getByTestId("email-input-clear")).toBeInTheDocument();
    expect(screen.queryByTestId("email-input-copy")).not.toBeInTheDocument();
  });
});

describe("UrlInput copy CTA", () => {
  it("shows the copy CTA in readonly mode with a value", () => {
    render(UrlInput, { props: { value: "https://example.com", readonly: true } });
    expect(screen.getByTestId("url-input-copy")).toBeInTheDocument();
  });

  it("shows the copy CTA in disabled mode with a value", () => {
    render(UrlInput, { props: { value: "https://example.com", disabled: true } });
    expect(screen.getByTestId("url-input-copy")).toBeInTheDocument();
  });

  it("hides the copy CTA in disabled mode while empty", () => {
    render(UrlInput, { props: { value: "", disabled: true } });
    expect(screen.queryByTestId("url-input-copy")).not.toBeInTheDocument();
  });

  it("shows the clear CTA instead in editable mode", () => {
    render(UrlInput, { props: { value: "https://example.com" } });
    expect(screen.getByTestId("url-input-clear")).toBeInTheDocument();
    expect(screen.queryByTestId("url-input-copy")).not.toBeInTheDocument();
  });
});

describe("PhoneInput copy CTA", () => {
  it("shows the copy CTA in readonly mode with a value", () => {
    render(PhoneInput, { props: { value: "+393331234567", readonly: true } });
    expect(screen.getByTestId("phone-input-copy")).toBeInTheDocument();
  });

  it("shows the copy CTA in disabled mode with a value", () => {
    render(PhoneInput, { props: { value: "+393331234567", disabled: true } });
    expect(screen.getByTestId("phone-input-copy")).toBeInTheDocument();
  });

  it("hides the copy CTA in disabled mode while empty", () => {
    render(PhoneInput, { props: { value: "", disabled: true } });
    expect(screen.queryByTestId("phone-input-copy")).not.toBeInTheDocument();
  });

  it("shows the clear CTA instead in editable mode", () => {
    render(PhoneInput, { props: { value: "+393331234567" } });
    expect(screen.getByTestId("phone-input-clear")).toBeInTheDocument();
    expect(screen.queryByTestId("phone-input-copy")).not.toBeInTheDocument();
  });
});
