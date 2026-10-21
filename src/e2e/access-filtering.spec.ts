import { test, expect, type Page } from "@playwright/test";
import { loginAsTestAdmin, loginAsTestUser } from "./helpers/admin-login";

/**
 * Access-axis E2E — `access.{app}.{module}.{page}`.
 *
 * The discovery payload (`GET /api/v1/modules`) is filtered SERVER-SIDE by
 * the caller's access grants: what a user cannot reach is simply absent —
 * never emitted and re-hidden client-side (non-disclosure, not obfuscation).
 *
 * The non-admin actor (`e2e_test_user`, role `e2e_user`) holds:
 *   - `access.system.job`  → Job Handler module under the System app
 *   - `customer.read.all/single` → CRM entity APIs (the crm module itself
 *     is undeclared → open to authenticated users)
 *   - NO `access.system.settings`, NO is_admin → Settings must be absent
 *     EVERYWHERE: payload, launcher, sidebar, breadcrumb.
 *
 * The admin actor (`is_admin`) implicitly holds `access.system` → Settings
 * visible — but ONLY because it lives under the system root; a business
 * root (crm) is not covered by admin-ness.
 */

const LAUNCHER_TRIGGER = "[data-testid='app-launcher-trigger']";
const LAUNCHER_APPS = "[data-testid='app-launcher-apps']";
const LAUNCHER_MODULES = "[data-testid='app-launcher-modules']";
const LAUNCHER_OPTION = "[role='option']";

type NavLink = { id: string; href: string; access?: string; children?: NavLink[] };
type ModuleInfo = {
  id: string;
  part_of: string;
  route_prefixes?: string[];
  nav?: NavLink[];
  home?: Record<string, string>;
  enabled?: boolean;
};

async function fetchModules(page: Page): Promise<ModuleInfo[]> {
  const res = await page.request.get("/api/v1/modules");
  expect(res.ok(), "GET /api/v1/modules must succeed for any authenticated user").toBeTruthy();
  const body = await res.json();
  return (body.modules ?? body) as ModuleInfo[];
}

async function openLauncher(page: Page) {
  await page.locator(LAUNCHER_TRIGGER).first().click();
  await page.locator(LAUNCHER_APPS).first().waitFor({ state: "visible", timeout: 10000 });
}

async function launcherSelectApp(page: Page, root: string) {
  await page
    .locator(`${LAUNCHER_APPS} ${LAUNCHER_OPTION}[data-app-root="${root}"]`)
    .first()
    .click();
}

test.describe("access axis — server-side discovery filtering", () => {
  test("non-admin: payload omits the gated module; open modules stay", async ({ page }) => {
    await loginAsTestUser(page);
    const modules = await fetchModules(page);
    const ids = modules.map((m) => m.id);

    // Settings declares access 'access.system.settings' — the e2e_user
    // role does not grant it and the actor is not admin → absent.
    expect(ids, "settings must be absent from the filtered payload").not.toContain("settings");
    // Undeclared modules are open to authenticated users.
    expect(ids).toContain("job");
    expect(ids).toContain("crm");
    // And the discovery doc carries the enriched fields the shell needs —
    // nav + per-root home for every module it lists.
    for (const m of modules.filter((x) => (x.route_prefixes?.length ?? 0) > 0)) {
      expect(m.nav?.length, `module '${m.id}' must embed its filtered nav`).toBeGreaterThan(0);
      expect(m.home, `module '${m.id}' must carry per-root home`).toBeTruthy();
    }
  });

  test("non-admin: launcher System column shows job/crm, never settings", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
    // Wait for the shell to settle — the job nav must be rendered before
    // the launcher trigger is interactive.
    await page
      .locator("[data-sidebar='content'] a[href='/system/job/job-schedules']")
      .first()
      .waitFor({ state: "visible", timeout: 15000 });
    await openLauncher(page);
    await launcherSelectApp(page, "system");

    await expect(
      page.locator(`${LAUNCHER_MODULES} ${LAUNCHER_OPTION}[data-module-id="job"]`).first(),
      "job must appear under the System app for an authorized user",
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator(`${LAUNCHER_MODULES} ${LAUNCHER_OPTION}[data-module-id="settings"]`),
      "settings must NOT appear — the module is access-gated",
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("non-admin: sidebar on a job page carries no settings links", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
    await page
      .locator("[data-sidebar='content'] a[href]")
      .first()
      .waitFor({ state: "visible", timeout: 15000 });

    const hrefs = await page
      .locator("[data-sidebar='content'] a[href]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect(
      hrefs.filter((h) => h?.startsWith("/system/settings")),
      "no /system/settings links may render for a user without the grant",
    ).toEqual([]);
    // Job nav renders (the module is reachable).
    expect(hrefs.some((h) => h === "/system/job/job-schedules")).toBeTruthy();
  });

  test("non-admin: direct URL to a gated module's page → non-disclosure", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto("/system/settings/profile", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);

    // The module is absent from the payload → the route resolves unowned:
    // the breadcrumb renders at most the app root, NEVER a Settings module
    // segment; the sidebar shows no settings nav.
    const bc = page.locator('nav[aria-label="breadcrumb"]');
    const bcText = (await bc.textContent().catch(() => "")) ?? "";
    expect(bcText, "breadcrumb must not disclose the gated module").not.toContain("Settings");
    expect(bcText).not.toContain("Profile");

    const hrefs = await page
      .locator("[data-sidebar='content'] a[href]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect(hrefs.filter((h) => h?.startsWith("/system/settings"))).toEqual([]);
  });

  test("admin: inherits access.system → Settings module everywhere", async ({ page }) => {
    await loginAsTestAdmin(page);
    const modules = await fetchModules(page);
    expect(modules.map((m) => m.id)).toContain("settings");

    await page.goto("/system/settings/profile", { waitUntil: "domcontentloaded" });
    const bc = page.locator('nav[aria-label="breadcrumb"]');
    const items = bc.locator("li[data-slot='breadcrumb-item']");
    await expect(items).toHaveCount(3, { timeout: 15000 });
    const texts = (await bc.locator("li").allTextContents())
      .map((x) => x.trim())
      .filter((x) => x && x !== "/");
    // System / Settings / Profile — the gated module is fully reachable.
    expect(texts[1]).toBe("Settings");
    expect(texts[2]).toBe("Profile");
  });
});
