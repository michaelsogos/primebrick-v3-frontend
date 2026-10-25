import { test, expect, type Page } from "@playwright/test";
import { loginAsTestAdmin, loginAsTestUser } from "./helpers/admin-login";

/**
 * Access-axis E2E — `access.{app}.{module}.{leaf}`.
 *
 * The discovery payload (`GET /api/v1/modules`) is filtered SERVER-SIDE by
 * the caller's access grants. A module with ZERO reachable leaves stays in
 * the payload flagged `accessible:false` (+ `nav_hidden`) so the launcher's
 * reveal switch can render it disabled — it is never navigable.
 *
 * Grants are EXACT leaf keys or `.*` wildcards only — bare namespaces are
 * illegal, `is_admin` inherits nothing (administrators role carries the
 * explicit `access.system.*` + `access.crm.*` wildcards).
 *
 * The non-admin actor (`e2e_test_user`, role `e2e_user`) holds:
 *   - `access.system.job.*` → every Job Handler leaf under the System app
 *   - `customer.read.all/single` → CRM entity APIs only — WITHOUT
 *     `access.crm.*` the crm module stays navigation-inaccessible (the two
 *     axes are deliberately separate)
 *   - NO `access.system.settings.*` → Settings is fully inaccessible
 */

const LAUNCHER_TRIGGER = "[data-testid='app-launcher-trigger']";
const LAUNCHER_APPS = "[data-testid='app-launcher-apps']";
const LAUNCHER_MODULES = "[data-testid='app-launcher-modules']";
const LAUNCHER_OPTION = "[role='option']";
const LAUNCHER_SHOW_ALL = "[data-testid='app-launcher-show-all']";

type NavLink = { id: string; href: string; default?: boolean; children?: NavLink[] };
type ModuleInfo = {
  id: string;
  part_of: string;
  route_prefixes?: string[];
  nav?: NavLink[];
  nav_hidden?: NavLink[];
  accessible?: boolean;
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
  test("non-admin: only job is accessible; gated modules stay flagged", async ({ page }) => {
    await loginAsTestUser(page);
    const modules = await fetchModules(page);
    const byId = new Map(modules.map((m) => [m.id, m]));

    // Job is the only accessible module for this actor.
    const job = byId.get("job");
    expect(job, "job must be present").toBeTruthy();
    expect(job!.accessible, "job must be navigable").not.toBe(false);
    expect(
      (job!.nav ?? []).length,
      "job must embed its access-filtered nav",
    ).toBeGreaterThan(0);

    // Settings/crm: zero reachable leaves → present but flagged, their
    // dropped nav carried in nav_hidden for the reveal switch.
    for (const id of ["settings", "crm"] as const) {
      const m = byId.get(id);
      expect(m, `'${id}' must stay in the payload for the reveal switch`).toBeTruthy();
      expect(m!.accessible, `'${id}' must be flagged inaccessible`).toBe(false);
      expect(
        (m!.nav ?? []).length,
        `'${id}' nav must be empty — nothing reachable`,
      ).toBe(0);
      expect(
        (m!.nav_hidden ?? []).length,
        `'${id}' nav_hidden must carry its dropped leaves`,
      ).toBeGreaterThan(0);
    }
  });

  test("non-admin: launcher hides settings until the reveal switch is on", async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
    await page
      .locator("[data-sidebar='content'] a[href='/system/job/job-schedules']")
      .first()
      .waitFor({ state: "visible", timeout: 15000 });
    await openLauncher(page);
    await launcherSelectApp(page, "system");

    // Default mode: only navigable modules — settings absent entirely.
    await expect(
      page.locator(`${LAUNCHER_MODULES} ${LAUNCHER_OPTION}[data-module-id="job"]`).first(),
      "job must appear under the System app",
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator(`${LAUNCHER_MODULES} ${LAUNCHER_OPTION}[data-module-id="settings"]`),
      "settings must be hidden while the reveal switch is off",
    ).toHaveCount(0);

    // Reveal ON: settings appears DISABLED — visible, never navigable.
    await page.locator(LAUNCHER_SHOW_ALL).first().click();
    const settingsRow = page.locator(
      `${LAUNCHER_MODULES} ${LAUNCHER_OPTION}[data-module-id="settings"]`,
    );
    await expect(settingsRow, "settings must appear disabled with reveal on").toBeVisible();
    await expect(settingsRow.first()).toHaveAttribute("aria-disabled", "true");
    await expect(
      settingsRow.locator("[data-testid='launcher-cta']").first(),
      "the hidden module's GOTO CTA must be disabled",
    ).toBeDisabled();
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
    expect(hrefs.some((h) => h === "/system/job/job-schedules")).toBeTruthy();
  });

  test("non-admin: direct URL to a gated page → deny + RFC notification + safe redirect", async ({
    page,
  }) => {
    await loginAsTestUser(page);
    // First land somewhere reachable so the shell + discovery payload load.
    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
    await page
      .locator("[data-sidebar='content'] a[href='/system/job/job-schedules']")
      .first()
      .waitFor({ state: "visible", timeout: 15000 });

    await page.goto("/system/settings/profile", { waitUntil: "domcontentloaded" });

    // The URL guard denies: RFC7807 notification + redirect to the safe
    // page — the System root's only accessible module default leaf.
    await page.waitForURL("**/system/job/job-schedules", { timeout: 15000 });
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: "ACCESS_DENIED" }).first(),
      "an ACCESS_DENIED notification must surface the denied page",
    ).toBeVisible({ timeout: 10000 });

    // And the settled page is the job default, not settings.
    const hrefs = await page
      .locator("[data-sidebar='content'] a[href]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect(hrefs.filter((h) => h?.startsWith("/system/settings"))).toEqual([]);
  });

  test("admin: explicit access.* wildcards → every module reachable", async ({ page }) => {
    await loginAsTestAdmin(page);
    const modules = await fetchModules(page);
    const byId = new Map(modules.map((m) => [m.id, m]));

    // administrators carries access.system.* + access.crm.* — nothing is
    // inherited by is_admin; the grants are explicit rows.
    for (const id of ["settings", "job", "crm"] as const) {
      const m = byId.get(id);
      expect(m, `'${id}' must be present`).toBeTruthy();
      expect(m!.accessible, `'${id}' must be navigable for admin`).not.toBe(false);
      expect((m!.nav ?? []).length).toBeGreaterThan(0);
    }

    await page.goto("/system/settings/profile", { waitUntil: "domcontentloaded" });
    const bc = page.locator('nav[aria-label="breadcrumb"]');
    const items = bc.locator("li[data-slot='breadcrumb-item']");
    await expect(items).toHaveCount(3, { timeout: 15000 });
    const texts = (await bc.locator("li").allTextContents())
      .map((x) => x.trim())
      .filter((x) => x && x !== "/");
    expect(texts[1]).toBe("Settings");
    expect(texts[2]).toBe("Profile");
  });
});
