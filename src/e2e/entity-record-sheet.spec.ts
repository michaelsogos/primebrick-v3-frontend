import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/* entity.record sheet — container-width responsiveness + uid label.
 *
 * The sheet measures its OWN width (`@container`): a standard sheet is
 * an xs surface, so declared multi-column `page_props.form` placements
 * collapse to one column inside it (container queries, not viewport
 * media queries — the panel is not the viewport). The uid badge label
 * names the record type dynamically as "{entity singular} ID".
 *
 * Surface: /system/job/schedules — `trigger_uuid` is a `type:"ref"`
 * column targeting job_trigger, whose declared form uses 2 columns. */

test.describe("entity.record sheet — responsive + entity id label", () => {
  test("trigger ref sheet: 1-col grid + '{entity} ID' label", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/system/job/schedules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 5_000 });

    // `trigger_uuid` isn't in the default visible set — enable it via the
    // column picker (same toggle contract as the ref-cell spec).
    await page.getByRole("button", { name: "Columns" }).first().click();
    const toggle = page.getByTestId("columns-toggle-trigger_uuid");
    await expect(toggle).toBeVisible({ timeout: 5_000 });
    await toggle.click();
    await page.keyboard.press("Escape");

    // The `trigger` column is a type:"ref" cell → text click opens the sheet.
    const triggerCell = page.getByTestId("ref-cell-trigger_uuid-text").first();
    await expect(triggerCell).toBeVisible({ timeout: 5_000 });
    await triggerCell.click();

    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("entity-record-sheet-uid-badge")).toBeVisible({ timeout: 5_000 });

    // (a) uid badge label: "{entity} ID" — job_trigger singular.
    const label = sheet.locator("label[for='record-sheet-uid-badge']");
    await expect(label).toHaveText(/ID$/);
    console.log("[probe] uid label:", await label.textContent());

    // (b) the declared 2-col form grid collapses to ONE column in-sheet.
    const grid = sheet.locator(".grid").first();
    const cols = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
    console.log("[probe] grid-template-columns:", cols);
    const colCount = cols.split(/\s+/).filter(Boolean).length;
    expect(colCount, `grid should collapse to 1 column (was: ${cols})`).toBe(1);

    // (c) placed fields must not carry a column 2 start.
    const starts = await sheet.locator("[style*='grid-column-start']").evaluateAll((els) =>
      els.map((e) => getComputedStyle(e).gridColumnStart),
    );
    console.log("[probe] computed col starts:", starts);
    for (const s of starts) expect(s).not.toBe("2");
  });
});
