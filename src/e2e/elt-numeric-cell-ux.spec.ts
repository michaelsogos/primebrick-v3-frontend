/**
 * ELT numeric cell UX — `type:"number"` columns render right-aligned with
 * tabular digits and locale-formatted values (group + decimal separators
 * via formatListCellValue). The wiring being proven: the cell's generic
 * branch routes through the injected formatter — the seam that had been
 * bypassed (raw toDisplayString, left-aligned).
 *
 * Surface: /system/job/job_runs — job_run list, `fire_seq`/`redelivery_count`
 * are default_visible number columns on a self-populating entity.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

test.use({ actionTimeout: 5000 });

test("number cells render right-aligned, tabular digits, locale-formatted", async ({ page }) => {
  await loginAsTestAdmin(page);
  await page.goto("/system/job/job_runs", { waitUntil: "domcontentloaded" });
  // The list defaults to outcome "Dispatched" (always empty once runs settle)
  // — widen to "All" so the completed runs surface.
  await page.getByRole("button", { name: "All", exact: true }).click();
  const firstRow = page.locator("table tbody tr").first();
  await expect(firstRow).toBeVisible({ timeout: 5_000 });

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

  // The Duration column carries the fixed Intl unit (`uom.unit:
  // "millisecond"` on job_run meta) — its cells render style:"unit"
  // output: `<grouped number> ms`. Runs without a duration show the
  // blankish dash, so scan a few rows for a populated one.
  const headTexts = await page.locator("table thead th").allTextContents();
  const durIdx = headTexts.findIndex((t) => t.trim() === "Duration");
  expect(durIdx).toBeGreaterThan(-1);
  // th/td align 1:1 — the checkbox column exists on both sides.
  const rows = page.locator("table tbody tr");
  const rowCount = await rows.count();
  let sawUnit = false;
  for (let i = 0; i < Math.min(rowCount, 25); i++) {
    const text = (await rows.nth(i).locator("td").nth(durIdx).textContent())?.trim() ?? "";
    if (text === "-" || text === "") continue;
    expect(text).toMatch(/^-?[\d.,\s]+\s*ms$/u);
    sawUnit = true;
    break;
  }
  expect(sawUnit).toBe(true);
});
