import { test, expect, type Locator } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/* NumericInput right-alignment — user-ratified contract (2026-11-26, task 11):
 * numbers align RIGHT by convention, universally — every NumericInput on every
 * surface, not only UoM-bearing ones. The spec measures the COMPUTED text-align
 * style on real surfaces, never class presence (classes can be overridden).
 *
 * Surfaces pinned here: the sequence create-sheet numeric columns (step/start)
 * and the revive assist-popover every-N input (the UoM-bearing anatomy).
 */

const SEQUENCES = "/crm/settings/sequences";

async function expectRightAligned(input: Locator, label: string) {
  await expect(input, `${label} is rendered`).toBeVisible({ timeout: 5_000 });
  const align = await input.evaluate((el) => getComputedStyle(el).textAlign);
  expect(align, `${label} computed text-align must be right`).toBe("right");
}

test.describe("numeric-input universal right alignment", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("create-sheet numeric columns render right-aligned", async ({ page }) => {
    await page.goto(SEQUENCES, { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: /nuovo|new/i }).first().click();
    // The create sheet hosts the writable numeric columns (step/start).
    const sheet = page.locator("[data-sheet-content], [role='dialog']").last();
    await expect(sheet).toBeVisible({ timeout: 5_000 });

    // input[role="spinbutton"] is the exact NumericInput marker — a testid-
    // prefix union would also match the stepper BUTTONS ({baseTestId}-inc),
    // which are centered by construction and are not the contract target.
    const numericInputs = sheet.locator('input[role="spinbutton"]');
    const count = await numericInputs.count();
    expect(count, "the create sheet renders numeric inputs").toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expectRightAligned(numericInputs.nth(i), `create-sheet numeric input #${i}`);
    }
    await page.keyboard.press("Escape");
  });

  test("the revive assist every-N input (UoM-bearing) renders right-aligned", async ({ page }) => {
    await page.goto(SEQUENCES, { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /filtri|filters/i }).first().click();
    await expect(page.getByTestId("filters-apply")).toBeVisible({ timeout: 5_000 });

    // Open the revive quick-filter assist popover — the every-N input carries
    // the UoM adornment, the anatomy the defect was reported on.
    const field = page.getByTestId("revive-interval-input-field").first();
    await expect(field).toBeVisible({ timeout: 5_000 });
    await page.getByTestId("revive-interval-input-assist").first().click();
    const everyN = page.getByTestId("revive-interval-input-every-n").first();
    await expectRightAligned(everyN, "revive assist every-N input");
    await page.keyboard.press("Escape");
  });
});
