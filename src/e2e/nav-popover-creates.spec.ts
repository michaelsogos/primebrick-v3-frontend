import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

test.describe.configure({ mode: "serial" });

/* Popover create leaves — end-user contract (user-ratified 2026-11-27):
 *
 *   create leaves are visible in the POPOVER — never in the sidebar,
 *   which stays flat single-level (no multilevel nav, user-verbatim).
 *
 * The spec walks the launcher columns exactly like the user does (same
 * mechanics as nav-leaf-ordering.spec.ts) and reads the rows that render
 * in the preview column. The evidence is the DOM the user sees. */
test.beforeEach(async ({ page }) => {
  await loginAsTestAdmin(page);
});

test("the popover preview lists create leaves for standard entities — and the sidebar does NOT", async ({ page }) => {
  await page.goto("/crm/customer_accounts", { waitUntil: "domcontentloaded" });
  // Sidebar truth first: flat leaves, zero create entries, zero expanders.
  await expect(page.locator('a[href="/crm/customer_accounts"]').first()).toBeVisible({ timeout: 10_000 });
  const sidebarCreates = await page.locator('[data-sidebar="sidebar"] a[href$="/create"]').count();
  expect(sidebarCreates, "the sidebar carries NO create leaves — flat single-level, user-ratified").toBe(0);

  await page.getByTestId("app-launcher-trigger").click();
  const panel = page.getByTestId("app-launcher-panel");
  await expect(panel, "the launcher panel opens").toBeVisible({ timeout: 10_000 });
  // Walk the columns: crm app root, then the CRM module row.
  const appRows = panel.locator('[data-launcher-col="0"] [data-launcher-row]');
  await expect(appRows.first()).toBeVisible({ timeout: 10_000 });
  await appRows.last().click();
  const moduleRows = panel.locator('[data-launcher-col="1"] [data-launcher-row]');
  await expect(moduleRows.first()).toBeVisible({ timeout: 10_000 });
  // The CRM root module — first row is the root module, settings is a sibling.
  await moduleRows.first().hover();
  const rows = panel.locator('[data-launcher-col="2"] [data-launcher-row]');
  await expect(rows.first(), "the preview lists the crm leaves").toBeVisible({ timeout: 10_000 });

  // The hidden channel carries the creates — reveal it through the panel's
  // own switch (canonical testid), never a text guess.
  await page.locator("#app-launcher-show-all-switch").click();
  // The app's own source of truth (e2e doc: assertions of completeness) —
  // does the discovery payload the FE consumes even carry nav_hidden?
  const apiTruth = await page.evaluate(async () => {
    const res = await fetch("/api/v1/modules", { credentials: "include" });
    const mods = await res.json();
    const crm = (mods.modules ?? []).find((m) => m.id === "crm");
    return { nav_hidden_count: (crm?.nav_hidden ?? []).length, keys: Object.keys(crm ?? {}).filter((k) => k.includes("nav")) };
  });
  console.log("api truth:", JSON.stringify(apiTruth));

  const labels: string[] = [];
  for (const r of await rows.all()) {
    labels.push(((await r.textContent()) ?? "").trim());
  }
  console.log("popover preview rows:", JSON.stringify(labels));
  await page.screenshot({ path: "popover-evidence.png" });

  // End-user property: every standard entity with create permission shows
  // its create entry in the popover preview. Create rows link to /create.
  const createLabels = labels.filter((l) => /nav.create|Nuov|New/i.test(l));
  console.log("create rows visible in popover:", createLabels.length, JSON.stringify(createLabels));
  expect(createLabels.length, "the popover lists the auto-wired create leaves").toBeGreaterThanOrEqual(3);
});
