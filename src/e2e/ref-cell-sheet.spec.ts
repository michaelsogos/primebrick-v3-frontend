import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/**
 * ref-cell-sheet — the DECIDED `type:"ref"` "link" anatomy (POC: audit
 * `*_by` actor columns → `user_profile`, inherited by every entity via
 * `@Ref` on the Auditable/Deletable mixins).
 *
 * Contract under test (product, not implementation):
 *   - the cell is medium-weight TEXT (underline on hover only) — NOT a badge
 *   - TEXT click opens the `entity.record` sheet — the record readonly
 *   - a trailing ExternalLink CTA is revealed on row hover and opens the
 *     target's resolved `/list` route pre-filtered in a NEW TAB — the
 *     sheet stays closed
 *   - unresolved actors display the raw uuid fallback and the sheet shows
 *     the honest not-found state (stale refs must not be invented)
 *   - `created_by` is a `default_visible:false` system column → enabled
 *     through the column picker before the cell exists
 *
 * Surface: /crm/customers — real entity list. Rows seeded by previous E2E
 * runs carry destroyed actors (uuid text = unresolved); rows seeded by the
 * dev bootstrap carry live actors (resolved display_name text).
 */
const CUSTOMERS = "/crm/customers";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** First rendered ref cell whose text is a resolved name (live actor). */
async function resolvedCell(page: import("@playwright/test").Page) {
  const cells = page.getByTestId(/^ref-cell-created_by-text$/);
  const count = await cells.count();
  for (let i = 0; i < count; i++) {
    const text = ((await cells.nth(i).innerText()) ?? "").trim();
    if (text && !UUID_RE.test(text)) return cells.nth(i);
  }
  return null;
}

test.describe("ref cell — link anatomy + entity.record sheet", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto(CUSTOMERS, { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30000 });

    // Enable the hidden-by-default system column through the column picker.
    await page.getByRole("button", { name: "Columns" }).click();
    const toggle = page.getByTestId("columns-toggle-created_by");
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await toggle.click();
    await page.keyboard.press("Escape");

    const cell = page.getByTestId("ref-cell-created_by-text").first();
    await expect(cell).toBeVisible({ timeout: 15000 });
  });

  test("ref cell is text anatomy — font-medium, not a badge", async ({ page }) => {
    const cell = page.getByTestId("ref-cell-created_by-text").first();
    await expect(cell).toHaveClass(/font-medium/);
    // The badge anatomy renders a bordered pill — absent under "link".
    await expect(cell.locator("..")).not.toHaveClass(/badge/);
  });

  test("text click opens the entity.record sheet with the live record", async ({ page }) => {
    const cell = await resolvedCell(page);
    test.skip(!cell, "no row with a live actor on this page — all refs unresolved");
    const name = (await cell!.innerText()).trim();
    await cell!.click();

    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 15000 });
    // The resolved display name appears inside the rendered record.
    await expect(sheet).toContainText(name, { timeout: 15000 });
    await expect(sheet).not.toContainText("Record not found");
  });

  test("unresolved actor — uuid text still opens the sheet, honest not-found state", async ({
    page,
  }) => {
    const cells = page.getByTestId(/^ref-cell-created_by-text$/);
    let target: import("@playwright/test").Locator | null = null;
    const count = await cells.count();
    for (let i = 0; i < count; i++) {
      const text = ((await cells.nth(i).innerText()) ?? "").trim();
      if (UUID_RE.test(text)) {
        target = cells.nth(i);
        break;
      }
    }
    test.skip(!target, "no unresolved actor on this page");
    await target!.click();
    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 15000 });
    await expect(sheet).toContainText(/not found/i, { timeout: 15000 });
  });

  test("external-link CTA opens the filtered target list in a new tab — sheet stays closed", async ({
    page,
  }) => {
    const row = page.locator("table tbody tr").first();
    await row.hover();
    const ext = page.getByTestId("ref-cell-created_by-ext").first();
    await expect(ext).toBeVisible();

    const [newTab] = await Promise.all([page.context().waitForEvent("page"), ext.click()]);
    await newTab.waitForLoadState("domcontentloaded");
    // Census-resolved list route carrying the canonical uuid filter term.
    const url = newTab.url();
    expect(url).toContain("filters%5B0%5D%5Bfield%5D=uuid");
    expect(url).toContain("filters%5B0%5D%5Bvalue%5D=");
    expect(url).not.toContain("/crm/customers");
    await expect(page.getByTestId("entity-record-sheet")).toHaveCount(0);
    await newTab.close();
  });
});
