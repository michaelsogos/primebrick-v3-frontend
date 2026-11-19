import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";

// i18n store → keys as-is
vi.mock("$lib/i18n", () => ({
  t: { subscribe: (fn: (v: (k: string) => string) => void) => { fn((k: string) => k); return () => {}; } },
  dict: { subscribe: (fn: (v: Record<string, unknown>) => void) => { fn({}); return () => {}; } },
  getDictKeys: () => [],
}));

vi.mock("$app/state", () => ({
  page: { url: { pathname: "/entities/job_trigger/new" } },
}));

vi.mock("$app/paths", () => ({
  resolve: (p: string) => p,
}));

const resolveSafePageMock = vi.fn<() => Promise<string>>(() => Promise.resolve("/modules"));
vi.mock("$lib/navigation/safe-page", () => ({
  resolveSafePage: () => resolveSafePageMock(),
}));

import ServiceUnavailableView from "$lib/components/ServiceUnavailableView.svelte";

// Blocked-surface anatomy: the unavailable hero shares the ErrorPage CTA
// contract — monospace nav, link-style CTAs (refresh left | home right),
// no redundant status line under the detail copy.
describe("ServiceUnavailableView", () => {
  it("renders icon → title → detail → nav, no status line", async () => {
    const { container } = render(ServiceUnavailableView, { props: { service: "job" } });
    expect(screen.getByTestId("service-unavailable")).toBeInTheDocument();
    expect(screen.getByText("app.service.unavailable")).toBeInTheDocument();
    expect(screen.getByText("app.service.unavailable_detail")).toBeInTheDocument();
    expect(container.querySelector("nav")).toBeInTheDocument();
    // The redundant uppercase status line is gone — no OFFLINE text anywhere.
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
    await waitFor(() => expect(container.querySelector("nav")).toHaveClass("gap-20", "font-mono"));
  });

  it("refresh CTA invokes onRetry", async () => {
    const onRetry = vi.fn();
    render(ServiceUnavailableView, { props: { service: "job", onRetry } });
    const cta = screen.getByTestId("service-unavailable-retry");
    expect(cta.textContent).toContain("app.common.refresh");
    await fireEvent.click(cta);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("hides the refresh CTA when onRetry is not provided", () => {
    render(ServiceUnavailableView, { props: { service: "job" } });
    expect(screen.queryByTestId("service-unavailable-retry")).not.toBeInTheDocument();
  });

  it("home CTA is an anchor to the resolved safe page", async () => {
    const { container } = render(ServiceUnavailableView, { props: { service: "job" } });
    await waitFor(() => {
      const cta = container.querySelector<HTMLElement>('[data-testid="service-unavailable-home"]');
      expect(cta?.tagName).toBe("A");
      expect(cta).toHaveAttribute("href", "/modules");
    });
    expect(resolveSafePageMock).toHaveBeenCalled();
    expect(screen.getByTestId("service-unavailable-home").textContent).toContain("app.error.return_home");
  });

  it("home CTA renders disabled while the safe page is unresolved", () => {
    resolveSafePageMock.mockReturnValueOnce(new Promise<string>(() => {}));
    const { container } = render(ServiceUnavailableView, { props: { service: "job" } });
    const cta = container.querySelector<HTMLElement>('[data-testid="service-unavailable-home"]');
    expect(cta?.tagName).toBe("SPAN");
    expect(cta).toHaveAttribute("aria-disabled", "true");
  });
});
