import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/**
 * Host chrome + favorites E2E.
 *
 * The PageHeader is host-owned chrome mounted by AppShell above every (app)
 * page — pages must NOT render their own h1/breadcrumb. These specs verify:
 *
 *   1. Header anatomy — breadcrumb · ★ toggle · h1 · optional description,
 *      on a host-rendered list page AND on a remote-mounted page (the remote
 *      chunk contributes no second header).
 *   2. Favorite roundtrip — star click → PUT /me/preferences/favorite_pages,
 *      aria-pressed flips, survives a hard reload (user_preferences row).
 *   3. Launcher — the "Preferiti/Favorites" pseudo-root lists the favorited
 *      route and navigates to it; removing the star empties the surface.
 *   4. <title> — the header owns the document title (decl label).
 *   5. description_key — decl-provided copy renders under the h1.
 *
 * Requires the live stack: FE :5173, BE :3001.
 */

const HEADER = "[data-testid='page-header']";
const TITLE = "[data-testid='page-header-title']";
const DESC = "[data-testid='page-header-description']";
const STAR = "[data-testid='page-header-favorite-toggle']";
const LAUNCHER_TRIGGER = "[data-testid='app-launcher-trigger']";
const LAUNCHER_APPS = "[data-testid='app-launcher-apps']";
const LAUNCHER_MODULES = "[data-testid='app-launcher-modules']";
const FAV_EMPTY = "[data-testid='app-launcher-favorites-empty']";

/** The rule-create route — censused decl, host-rendered entity-form pilot. */
const FAV_ROUTE = "/system/job/rules/create";

/** Ensure the star on the current page is NOT favorite (idempotent cleanup). */
async function ensureUnfavorited(page: import("@playwright/test").Page): Promise<void> {
  const star = page.locator(STAR);
  await star.waitFor({ state: "visible" });
  if ((await star.getAttribute("aria-pressed")) === "true") {
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "false");
  }
}

test.describe("host chrome (PageHeader)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("list page: breadcrumb, star, h1 — single header, own <title>", async ({ page }) => {
    await page.goto("/system/job/rules", { waitUntil: "domcontentloaded" });

    await expect(page.locator(HEADER)).toHaveCount(1);
    await expect(page.locator(TITLE)).toBeVisible();
    await expect(page.locator(STAR)).toBeVisible();
    // Breadcrumb lives inside the header, above the title.
    await expect(page.locator(`${HEADER} nav`).first()).toBeVisible();

    const h1Text = (await page.locator(TITLE).innerText()).trim();
    expect(h1Text.length).toBeGreaterThan(0);
    await expect(page).toHaveTitle(new RegExp(`${h1Text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} · Primebrick`));

    // No second h1 anywhere in the page body — pages must not re-render
    // their own title now that chrome is host-owned.
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("remote page: host header renders, remote chunk adds no second h1", async ({ page }) => {
    // The real remote-mounted route — jobs-page.js esm-mount chunk.
    await page.goto("/system/job/job-schedules/create", { waitUntil: "domcontentloaded" });

    await expect(page.locator(HEADER)).toHaveCount(1);
    await expect(page.locator(TITLE)).toBeVisible();
    // description_key on the decl surfaces under the h1.
    await expect(page.locator(DESC)).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
  });
});

test.describe("favorites (user_preferences)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("star roundtrip: PUT fires, persists across reload, lists in launcher", async ({ page }) => {
    await page.goto(FAV_ROUTE, { waitUntil: "domcontentloaded" });
    await ensureUnfavorited(page);

    const star = page.locator(STAR);

    // ── Star ON — a PUT to the preference key must fire. ────────────────
    const putDone = page.waitForResponse(
      (res) =>
        res.request().method() === "PUT" &&
        res.url().includes("/api/v1/auth/me/preferences/favorite_pages"),
    );
    await star.click();
    const putRes = await putDone;
    expect(putRes.ok()).toBeTruthy();
    await expect(star).toHaveAttribute("aria-pressed", "true");

    // ── Persists across a hard reload (server-side user_preferences row). ─
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(STAR)).toHaveAttribute("aria-pressed", "true");

    // ── Launcher: favorites pseudo-root lists the route. ─────────────────
    await page.locator(LAUNCHER_TRIGGER).click();
    const apps = page.locator(LAUNCHER_APPS);
    await apps.getByRole("option").first().click(); // "Preferiti" is row 1
    const favList = page.locator(LAUNCHER_MODULES);
    await expect(favList.getByRole("option").first()).toBeVisible();
    const favCount = await favList.getByRole("option").count();
    expect(favCount).toBeGreaterThanOrEqual(1);

    // Activate the favorite → navigates to the favorited route.
    await favList.getByRole("option").first().click();
    await page.waitForURL((url) => url.pathname === FAV_ROUTE, { timeout: 10000 });
    await expect(page.locator(TITLE)).toBeVisible();

    // ── Star OFF — DELETE fires, launcher surface empties. ───────────────
    const delDone = page.waitForResponse(
      (res) =>
        res.request().method() === "DELETE" &&
        res.url().includes("/api/v1/auth/me/preferences/favorite_pages"),
    );
    await page.locator(STAR).click();
    const delRes = await delDone;
    expect(delRes.ok()).toBeTruthy();
    await expect(page.locator(STAR)).toHaveAttribute("aria-pressed", "false");

    await page.locator(LAUNCHER_TRIGGER).click();
    await page.locator(LAUNCHER_APPS).getByRole("option").first().click();
    await expect(page.locator(FAV_EMPTY)).toBeVisible();
  });
});
