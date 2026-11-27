/**
 * ELT generic JSONB cell — `format:"json"` columns that hit the generic
 * fallback (not mapper widgets, not condition chips) render the canonical
 * cell-link anatomy: a "View" text link, no icon, opening the registered
 * `entity.jsonViewer` sheet. The wiring being proven: JsonCellViewer
 * shares CellAffordance with ref/mapper cells — no invented anatomy.
 *
 * Surface: /system/job/job_runs — job_run.report is a default_visible
 * format:"json" column; maintenance reports are objects → generic
 * fallback on every populated row.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

test.use({ actionTimeout: 5000 });

test("generic json cell renders link-only 'View' CTA opening the sheet", async ({ page }) => {
  await loginAsTestAdmin(page);
  await page.goto("/system/job/job_runs", { waitUntil: "domcontentloaded" });
  // Same default-filter caveat as the numeric spec — widen to "All".
  await page.getByRole("button", { name: "All", exact: true }).click();
  const rows = page.locator("table tbody tr");
  await expect(rows.first()).toBeVisible({ timeout: 5_000 });

  // Reports live on the older maintenance runs — the default created-desc
  // sort shows only recent executor rows (report null). Sort "Fire #"
  // ascending to surface the oldest runs, all report-populated.
  await page.getByRole("columnheader", { name: "Fire #", exact: true }).click();
  await expect(rows.first()).toBeVisible();

  // Locate the Report column (format:"json", default_visible on job_run).
  const headTexts = await page.locator("table thead th").allTextContents();
  const reportIdx = headTexts.findIndex((t) => t.trim() === "Report");
  expect(reportIdx).toBeGreaterThan(-1);

  // A populated report cell carries the single text link — th/td align
  // 1:1; blankish cells render the dash, so scan rows for a link.
  let link;
  for (let i = 0; i < Math.min(await rows.count(), 25); i++) {
    const btn = rows
      .nth(i)
      .locator("td")
      .nth(reportIdx)
      .getByRole("button", { name: "View", exact: true });
    if (await btn.count()) {
      link = btn.first();
      break;
    }
  }
  expect(link, "no 'View' link found in the Report column").toBeDefined();
  await expect(link!).toBeVisible();

  // The anatomy: text only — the braces icon is gone for good.
  expect(await link!.locator("svg").count()).toBe(0);

  // Click opens the registered entity.jsonViewer sheet — unchanged path.
  await link!.click();
  await expect(page.locator('[data-slot="sheet-content"], [role="dialog"]').first()).toBeVisible();
});
