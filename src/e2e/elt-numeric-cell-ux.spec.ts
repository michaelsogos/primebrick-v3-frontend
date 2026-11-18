/**
 * ELT numeric cell UX — `type:"number"` columns render right-aligned with
 * tabular digits and locale-formatted values (group + decimal separators
 * via formatListCellValue). The wiring being proven: the cell's generic
 * branch routes through the injected formatter — the seam that had been
 * bypassed (raw toDisplayString, left-aligned).
 *
 * Surface: /system/job/runs — job_run list, `fire_seq`/`redelivery_count`
 * are default_visible number columns on a self-populating entity.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

test.use({ actionTimeout: 5000 });

test("number cells render right-aligned, tabular digits, locale-formatted", async ({ page }) => {
  await loginAsTestAdmin(page);
  await page.goto("/system/job/runs", { waitUntil: "domcontentloaded" });
  // The list defaults to outcome "Dispatched" (always empty once runs settle)
  // — widen to "All" so the completed runs surface.
  await page.getByRole("button", { name: "All", exact: true }).click();
  const firstRow = page.locator("table tbody tr").first();
  await expect(firstRow).toBeVisible({ timeout: 30000 });

  // The numeric anatomy: right-aligned + tabular digits on the data cell.
  const numericCells = firstRow.locator("td.text-right.tabular-nums");
  await expect(numericCells.first()).toBeVisible();

  // Every numeric cell's content is a formatted number — digits + locale
  // separators only, never the raw wire string or a translation key.
  const texts = await numericCells.allTextContents();
  expect(texts.length).toBeGreaterThan(0);
  for (const text of texts) {
    expect(text.trim()).toMatch(/^-?[\d.,\s%]+([a-zA-Z€$£]{1,4})?$/u);
  }
});
