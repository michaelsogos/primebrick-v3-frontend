import { test, expect, type Page } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

// Shared Edge session + one ephemeral actor: parallel workers race the same
// login surface. Ordering evidence is sequential user truth, never concurrency.
test.describe.configure({ mode: "serial" });

/* Nav leaf ordering — the end-user contract (2026-11-27, user-ratified):
 *
 *   pinned    — a leaf carrying explicit `order` occupies its position
 *   unpinned  — every other leaf fills the remaining slots ALPHABETICALLY
 *               by the translated label, in the app's language
 *   sequences — last BY DESIGN in the settings sibling (structural pin,
 *               never a merge side effect)
 *
 * The spec reads the VISIBLE sidebar labels in DOM order and verifies the
 * property on those very strings — no hardcoded translations, no payload
 * inspection: the truth as the user sees it.
 *
 * Scope: every leaf array — the crm root node (/crm customers page) and
 * the crm-settings sibling node (any /crm/settings/* page).
 */

/** Visible sidebar leaf labels+hrefs in DOM order, scoped to one prefix. */
async function sidebarLeaves(page: Page, hrefPrefix: string): Promise<{ label: string; href: string }[]> {
  const anchors = page.locator(`[data-sidebar="sidebar"] a[href^="${hrefPrefix}"]`);
  await expect(anchors.first(), "at least one sidebar leaf is visible").toBeVisible({ timeout: 5_000 });
  const out: { label: string; href: string }[] = [];
  for (const a of await anchors.all()) {
    const label = ((await a.textContent()) ?? "").trim();
    const href = (await a.getAttribute("href")) ?? "";
    if (label && href) out.push({ label, href });
  }
  return out;
}

function expectAlphabetical(labels: string[], context: string): void {
  const sorted = [...labels].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  expect(labels, `${context}: unpinned leaves must be alphabetical by their visible label`).toEqual(sorted);
}

test.describe("nav leaf ordering — pinned + alphabetical + last-by-design", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("crm-settings sibling — unpinned leaves alphabetical, sequences last by design", async ({ page }) => {
    await page.goto("/crm/settings/customer_types", { waitUntil: "domcontentloaded" });
    const leaves = await sidebarLeaves(page, "/crm/settings");
    expect(leaves.length, "the settings sibling carries several leaves").toBeGreaterThan(5);

    const last = leaves[leaves.length - 1];
    expect(last.href, "sequences closes the settings sibling — last by design").toBe("/crm/settings/sequences");

    const unpinned = leaves.slice(0, -1).map((l) => l.label);
    expectAlphabetical(unpinned, "crm-settings");
  });

  test("crm root — customers pinned first, every other leaf alphabetical", async ({ page }) => {
    await page.goto("/crm/customers", { waitUntil: "domcontentloaded" });
    // Root leaves only — settings leaves nest deeper and never appear here.
    const all = await sidebarLeaves(page, "/crm");
    const leaves = all.filter((l) => !l.href.startsWith("/crm/settings"));
    expect(leaves.length, "the root module carries several leaves").toBeGreaterThan(2);

    expect(leaves[0].href, "customers is pinned first in the root module").toBe("/crm/customers");

    const unpinned = leaves.slice(1).map((l) => l.label);
    expectAlphabetical(unpinned, "crm root");
  });

  test("the app launcher mega-menu carries the SAME ordering — one rule, every surface", async ({ page }) => {
    // The user-caught incoherence (2026-11-27): the sidebar sorted but the
    // launcher preview read the raw payload. Ordering is a property of the
    // leaves, never of one component.
    await page.goto("/crm/settings/customer_types", { waitUntil: "domcontentloaded" });
    await page.getByTestId("app-launcher-trigger").click();
    const panel = page.getByTestId("app-launcher-panel");
    await expect(panel, "the launcher panel opens").toBeVisible({ timeout: 5_000 });
    // Walk the columns like the user does: pick the crm app root (the
    // favorites pseudo-root is the panel default and shows no module
    // pages), then preview the Settings module row.
    const appRows = panel.locator('[data-launcher-col="0"] [data-launcher-row]');
    await expect(appRows.first(), "the apps column lists entries").toBeVisible({ timeout: 5_000 });
    await appRows.last().click();
    const moduleRows = panel.locator('[data-launcher-col="1"] [data-launcher-row]');
    await expect(moduleRows.first(), "the modules column lists entries").toBeVisible({ timeout: 5_000 });
    await moduleRows.last().hover();
    // The preview column lists the active module's pages as option rows
    // (div[data-launcher-row] — keyboard-driven, never anchors).
    const rows = panel.locator('[data-launcher-col="2"] [data-launcher-row]');
    await expect(rows.first(), "the preview lists the settings leaves").toBeVisible({ timeout: 5_000 });
    const labels: string[] = [];
    for (const r of await rows.all()) {
      labels.push(((await r.textContent()) ?? "").trim());
    }
    expect(labels.length, "the preview carries the full sibling").toBeGreaterThan(5);
    expect(labels[labels.length - 1], "sequences closes the launcher preview too").toBe("Sequences");
    expectAlphabetical(labels.slice(0, -1), "app launcher preview");
  });
});
