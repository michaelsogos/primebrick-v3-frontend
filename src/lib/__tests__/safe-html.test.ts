/**
 * SafeHtml — the ONLY sanctioned `{@html}` boundary (suppress-governance plan).
 *
 * Contract under test: raw html reaches the DOM exclusively through this
 * component, which DOMPurify-sanitizes in `$derived` before render. Call
 * sites (ai-chat-panel, DocsPanel, docs route) pass RAW html — the sanitize
 * step cannot be forgotten because it lives inside the component.
 *
 * Profiles:
 * - `strict` (default) — chat/AI markdown prose: DOMPurify defaults.
 * - `docs` — KB pipeline additions: `target` attr + `data-doc*` hooks.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import { SafeHtml } from "@primebrick/ui";

describe("SafeHtml — strict profile (default)", () => {
  it("renders benign markup untouched", () => {
    const { container } = render(SafeHtml, {
      props: { html: "<p>Hello <strong>world</strong></p>" },
    });
    expect(container.querySelector("p")).toBeInTheDocument();
    expect(container.querySelector("strong")?.textContent).toBe("world");
  });

  it("strips <script> and inline event handlers", () => {
    const { container } = render(SafeHtml, {
      props: {
        html: '<p onclick="alert(1)">text</p><script>alert(2)</script><img src="x" onerror="alert(3)">',
      },
    });
    expect(container.querySelector("script")).not.toBeInTheDocument();
    const p = container.querySelector("p")!;
    expect(p.getAttribute("onclick")).toBeNull();
    const img = container.querySelector("img")!;
    expect(img.getAttribute("onerror")).toBeNull();
    expect(img.getAttribute("src")).toBe("x");
  });

  it("strips javascript: hrefs", () => {
    const { container } = render(SafeHtml, {
      props: { html: '<a href="javascript:alert(1)">x</a>' },
    });
    const a = container.querySelector("a")!;
    expect(a.getAttribute("href") ?? "").not.toContain("javascript:");
  });

  it("strips target — strict does not allow new-tab hijack attrs", () => {
    const { container } = render(SafeHtml, {
      props: { html: '<a href="https://x.dev" target="_blank">x</a>' },
    });
    expect(container.querySelector("a")!.getAttribute("target")).toBeNull();
  });
});

describe("SafeHtml — docs profile", () => {
  it("keeps data-doc* link-rewrite hooks and target", () => {
    const { container } = render(SafeHtml, {
      props: {
        profile: "docs",
        html: '<a href="/x" data-docpath="a/b" data-docrepo="backend" data-docanchor="sec" target="_blank">doc</a>',
      },
    });
    const a = container.querySelector("a")!;
    expect(a.getAttribute("data-docpath")).toBe("a/b");
    expect(a.getAttribute("data-docrepo")).toBe("backend");
    expect(a.getAttribute("data-docanchor")).toBe("sec");
    expect(a.getAttribute("target")).toBe("_blank");
  });

  it("still strips scripts and handlers in docs profile", () => {
    const { container } = render(SafeHtml, {
      props: {
        profile: "docs",
        html: '<figure onclick="alert(1)"><script>alert(2)</script><figcaption>cap</figcaption></figure>',
      },
    });
    expect(container.querySelector("script")).not.toBeInTheDocument();
    const figure = container.querySelector("figure")!;
    expect(figure.getAttribute("onclick")).toBeNull();
    expect(container.querySelector("figcaption")?.textContent).toBe("cap");
  });
});
