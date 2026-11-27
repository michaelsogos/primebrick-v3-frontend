import { extJsonStringify, extJsonParse } from "@primebrick/core/ext-json";
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
  await expect(page.locator('a[href="/crm/customer_accounts"]').first()).toBeVisible({ timeout: 5_000 });
  const sidebarCreates = await page.locator('[data-sidebar="sidebar"] a[href$="/create"]').count();
  expect(sidebarCreates, "the sidebar carries NO create leaves — flat single-level, user-ratified").toBe(0);

  await page.getByTestId("app-launcher-trigger").click();
  const panel = page.getByTestId("app-launcher-panel");
  await expect(panel, "the launcher panel opens").toBeVisible({ timeout: 5_000 });
  // Walk the columns: crm app root, then the CRM module row.
  const appRows = panel.locator('[data-launcher-col="0"] [data-launcher-row]');
  await expect(appRows.first()).toBeVisible({ timeout: 5_000 });
  await appRows.last().click();
  const moduleRows = panel.locator('[data-launcher-col="1"] [data-launcher-row]');
  await expect(moduleRows.first()).toBeVisible({ timeout: 5_000 });
  // The CRM root module — first row is the root module, settings is a sibling.
  await moduleRows.first().hover();
  const rows = panel.locator('[data-launcher-col="2"] [data-launcher-row]');
  await expect(rows.first(), "the preview lists the crm leaves").toBeVisible({ timeout: 5_000 });

  // The hidden channel carries the creates — reveal it through the panel's
  // own switch (canonical testid), never a text guess.
  await page.locator("#app-launcher-show-all-switch").click();

  const labels: string[] = [];
  for (const r of await rows.all()) {
    labels.push(((await r.textContent()) ?? "").trim());
  }
  console.log("popover preview rows:", extJsonStringify(labels));
  await page.screenshot({ path: "popover-evidence.png" });

  // End-user property: every standard entity with create permission shows
  // its create entry in the popover preview. Create rows link to /create.
  // Pairing + label contract (user-ratified 2026-11-27): every create
  // leaf carries the SAME label as the create page title ("New") and sits
  // immediately BEFORE its list leaf in the flat popover column.
  const createIdx = labels.map((l, i) => (/^New |^Nuovo /.test(l) ? i : -1)).filter((i) => i >= 0);
  console.log("create row positions:", extJsonStringify(createIdx), "of", labels.length);
  expect(createIdx.length, "the popover lists the auto-wired create leaves").toBeGreaterThanOrEqual(3);
  for (const i of createIdx) {
    const next = labels[i + 1] ?? "";
    expect(next, `the create at position ${i} immediately precedes its list leaf`).not.toMatch(/^New |^Nuovo /);
  }

  // Wired icon contract (user-ratified 2026-11-27): create pages default
  // to file-plus. The rows render DynamicIcon — lucide stamps the name in
  // the svg class list; the visible svg presence is the end-user truth.
  let filePlusCount = 0;
  for (const r of await rows.all()) {
    const t = ((await r.textContent()) ?? "").trim();
    if (!/^New |^Nuovo /.test(t)) continue;
    if ((await r.locator("svg.lucide-file-plus").count()) > 0) filePlusCount++;
  }
  console.log("create rows with file-plus icon:", filePlusCount);
  expect(filePlusCount, "every create leaf carries the wired file-plus icon").toBe(createIdx.length);
});
