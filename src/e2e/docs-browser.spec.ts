/**
 * docs-browser — E2E for the in-product user-guide browser (Track C).
 *
 * Runs against the live dev stack (FE :5173 → /api proxy → BE :3001 →
 * /svc/ai → ai :3004) as the ephemeral E2E admin actor minted by
 * global.setup.ts. Read-only: the spec never writes entity rows; the only
 * surface it exercises is the docs sheet + the /docs/[...path] route backed
 * by the ai service's docs_kb corpus (populated by docs-pack ingestion).
 *
 * Coverage:
 *   - context-aware open: /system/settings/organizations claims entity
 *     "organization" via EntityListTable → the panel resolves the org doc
 *   - TOC ("On this page"), see-also links, in-panel nav stack + back CTA
 *   - server-side search (embedding-backed /docs/search)
 *   - sheet expand toggle (central mode)
 *   - view-full-page handoff to /docs/<repo>/<path> + direct route load
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

test.describe.configure({ mode: "serial" });

/** Hydration gate: the app shell only renders sidebar links after onMount
 *  + the module-nav fetch — clicking earlier hits dead (unhydrated) handlers. */
async function waitForShell(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const link = page.locator('a[href^="/system/"]').first();
    try {
      await link.waitFor({ state: "visible", timeout: 5000 });
      return;
    } catch {
      /* keep polling */
    }
  }
  throw new Error("app shell never hydrated — no /system/ sidebar link mounted");
}

async function openDocsPanel(page: Page): Promise<void> {
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") console.log(`[browser:${m.type()}]`, m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => console.log("[browser:pageerror]", String(e).slice(0, 500)));
  page.on("requestfailed", (r) => console.log("[net:failed]", r.url(), r.failure()?.errorText));
  page.on("response", (r) => {
    if (r.url().includes("/svc/ai/") && r.status() >= 400) console.log("[net:ai]", r.status(), r.url());
  });
  const cta = page.getByTestId("app-topbar-docs-cta");
  await expect(cta).toBeVisible({ timeout: 10000 });
  // Hydration gate: poll-click until the sheet mounts — an early click can
  // hit a not-yet-hydrated handler on a reused SSR dom.
  const panelMarker = page.getByTestId("docs-panel-search");
  for (let i = 0; i < 6; i++) {
    await cta.click();
    try {
      await panelMarker.waitFor({ state: "visible", timeout: 5000 });
      return;
    } catch {
      /* sheet not mounted yet — retry the click */
    }
  }
  throw new Error("docs sheet never mounted — docs-panel-search missing after 6 click attempts");
}

test.describe("docs browser", () => {
  test("context doc: organizations page resolves the organization guide", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/system/settings/organizations");
    await waitForShell(page);

    await openDocsPanel(page);

    // Context resolution: the org list claims entity=organization → the panel
    // opens the matching index entry ("Organizations List", backend repo).
    const content = page.getByTestId("docs-content");
    await expect(content).toBeVisible({ timeout: 15000 });
    const article = content.locator("xpath=..");
    await expect(article.locator("h1")).toContainText("Organizations", { timeout: 10000 });

    // TOC present on a real doc (h2/h3 headings exist in organizations.mdx).
    await expect(page.getByTestId("docs-toc")).toBeVisible({ timeout: 10000 });

    // See-also links rendered from metadata.links — labels are page TITLES,
    // not file paths (P2).
    const seeAlso = page.getByTestId("docs-see-also");
    await expect(seeAlso).toBeVisible({ timeout: 10000 });
    const linkText = (await seeAlso.locator("button").first().innerText()).trim();
    expect(linkText).not.toContain("/");
    expect(linkText).not.toMatch(/\.mdx?$/);
  });

  test("see-also navigates in-panel and back CTA returns", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/system/settings/organizations");
    await waitForShell(page);
    await openDocsPanel(page);
    await expect(page.getByTestId("docs-content")).toBeVisible({ timeout: 15000 });
    const firstTitle = await page.getByTestId("docs-content").locator("xpath=../h1").innerText();

    // Follow the first see-also link — stays inside the sheet.
    const seeAlso = page.getByTestId("docs-see-also").locator("button").first();
    await expect(seeAlso).toBeVisible({ timeout: 10000 });

    // P3: scroll to the bottom of the doc BEFORE navigating away — back must
    // restore this position, not land at the top.
    const scroller = page.getByTestId("docs-content").locator('xpath=ancestor::*[contains(@class,"overflow-auto")][1]');
    await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    const savedScroll = await scroller.evaluate((el) => el.scrollTop);
    expect(savedScroll).toBeGreaterThan(0);

    await seeAlso.click();
    const content = page.getByTestId("docs-content");
    await expect(content.locator("xpath=../h1")).not.toHaveText(firstTitle, { timeout: 15000 });
    await expect(page.getByTestId("docs-panel-back")).toBeVisible();

    // Back returns to the context doc AND restores the saved scroll offset.
    await page.getByTestId("docs-panel-back").click();
    await expect(content.locator("xpath=../h1")).toHaveText(firstTitle, { timeout: 15000 });
    await expect
      .poll(async () => scroller.evaluate((el) => el.scrollTop), { timeout: 5000 })
      .toBeGreaterThan(savedScroll * 0.5);
  });

  test("search hits the embedding-backed /docs/search endpoint", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/system/settings/organizations");
    await waitForShell(page);
    await openDocsPanel(page);

    const input = page.getByTestId("docs-panel-search");
    await input.fill("roles permissions");
    const results = page.getByTestId("docs-search-results");
    await expect(results).toBeVisible({ timeout: 20000 });
    await expect(results.locator("button").first()).toBeVisible();
    const hitCount = await results.locator("button").count();
    expect(hitCount).toBeGreaterThan(0);

    // Open the top hit — it lands as an in-panel doc view with the searched
    // term highlighted and the match navigator on top (P8+P9).
    const hitLabel = await results.locator("button").first().locator(".text-sm").first().innerText();
    await results.locator("button").first().click();
    const content = page.getByTestId("docs-content");
    await expect(content).toBeVisible({ timeout: 15000 });
    await expect(content.locator("xpath=../h1")).toHaveText(hitLabel.trim(), { timeout: 15000 });

    const nav = page.getByTestId("docs-match-nav");
    await expect(nav).toBeVisible({ timeout: 10000 });
    const counter = page.getByTestId("docs-match-counter");
    await expect(counter).toHaveText(/^[1-9]\d*\/[1-9]\d*$/, { timeout: 10000 });
    const markCount = await content.locator("mark.docs-search-hit").count();
    expect(markCount).toBeGreaterThan(0);
    // Next/prev walk the matches — counter tracks the active one.
    await page.getByTestId("docs-match-next").click();
    await expect(counter).toHaveText(/^2\/\d+$/);
    await page.getByTestId("docs-match-prev").click();
    await expect(counter).toHaveText(/^1\/\d+$/);
    // Clear removes the navigator and the marks.
    await page.getByTestId("docs-match-clear").click();
    await expect(nav).not.toBeVisible();
    expect(await content.locator("mark.docs-search-hit").count()).toBe(0);
  });

  test("index view lists repos and entries; expand toggles central mode", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/system/settings/organizations");
    await waitForShell(page);
    await openDocsPanel(page);
    await expect(page.getByTestId("docs-content")).toBeVisible({ timeout: 15000 });

    // "All documentation" → index view with repo accordions (all expanded
    // by default — `type="multiple" value={all repos}`).
    await page.getByTestId("docs-all-docs").click();
    const backend = page.getByTestId("docs-repo-backend");
    await expect(backend).toBeVisible({ timeout: 10000 });

    // Expand → central sheet (wider surface), then collapse back.
    await page.getByTestId("docs-panel-expand").click();
    await page.getByTestId("docs-panel-expand").click();

    // Re-open a doc from the index — entries are rendered already expanded.
    const entry = backend.locator("button").filter({ hasText: "Working Together" }).first();
    await expect(entry).toBeVisible({ timeout: 10000 });
    await entry.click();
    await expect(page.getByTestId("docs-content").locator("xpath=../h1")).toContainText("Working Together", {
      timeout: 15000,
    });
  });

  test("view-full opens /docs/<repo>/<path> in a NEW focused tab (P4)", async ({ page, context }) => {
    await loginAsTestAdmin(page);
    await page.goto("/system/settings/organizations");
    await waitForShell(page);
    await openDocsPanel(page);
    await expect(page.getByTestId("docs-content")).toBeVisible({ timeout: 15000 });

    const link = page.getByTestId("docs-view-full");
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/docs\/[a-z0-9_-]+\/.+/);
    expect(await link.getAttribute("target")).toBe("_blank");

    const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
    await popup.waitForLoadState("domcontentloaded");
    await expect(popup.getByTestId("docs-tree")).toBeVisible({ timeout: 15000 });
    await expect(popup.locator(".docs-page > h1")).toBeVisible({ timeout: 15000 });
    await expect(popup).toHaveURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    // The sheet stays open on the source page — no navigation happened there.
    await expect(page.getByTestId("docs-panel-search")).toBeVisible();
    await popup.close();
  });

  test("direct route load: /docs/backend/rbac renders the doc", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/docs/backend/rbac");
    await expect(page.getByTestId("docs-tree")).toBeVisible({ timeout: 15000 });
    const content = page.locator(".docs-page");
    await expect(content.locator("> h1")).toContainText("Roles", { timeout: 15000 });

    // P1 render fidelity on the heaviest doc (2 Mermaid JSX + tables + code):
    // the raw MDX comes from the doc_source row — table separators must end
    // up as <table> markup, never leak as "|---" text into the output.
    await expect(content.locator("table")).not.toHaveCount(0);
    const bodyText = await content.innerText();
    expect(bodyText).not.toMatch(/\|[-\s|]*---/);
    // Mermaid blocks hydrate to SVG (or keep the placeholder if hydration
    // fails) — the JSX wrapper must never leak as raw text.
    expect(bodyText).not.toMatch(/<Mermaid|chart=\{/);
  });
});
