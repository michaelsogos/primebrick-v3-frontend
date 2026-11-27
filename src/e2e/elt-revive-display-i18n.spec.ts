import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/* Revive-interval DISPLAY localization — user-ratified contract (2026-11-26,
 * task 10, display-only): the canonical wire value stays the English parseable
 * literal forever; the INPUT renders localized prose when unfocused and swaps
 * to the canonical editable literal on focus. Defect proven by user screenshot:
 * "2 years" visible in an Italian UI quick filter while the interpreter strip
 * below is correctly Italian.
 *
 * Surface: /crm/settings/sequences → filters sheet → standard tab — the
 * "Rinnovo Ogni" quick filter embeds the shared ReviveIntervalInput.
 */

const SEQUENCES = "/crm/settings/sequences";

test.describe("revive-interval input display localization (it-IT session)", () => {
  test.beforeEach(async ({ page }) => {
    // Force the Italian session BEFORE the app boots — the i18n store reads
    // sessionStorage `pb.lang` at module init.
    await page.addInitScript(() => {
      sessionStorage.setItem("pb.lang", "it-IT");
    });
    await loginAsTestAdmin(page);
  });

  test("the unfocused input renders localized units, focus swaps to the canonical literal", async ({ page }) => {
    await page.goto(SEQUENCES, { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /filtri|filters/i }).first().click();
    await expect(page.getByTestId("filters-apply")).toBeVisible({ timeout: 5_000 });

    const field = page.getByTestId("revive-interval-input-field").first();
    await expect(field, "the revive quick-filter input is embedded in the sheet").toBeVisible({
      timeout: 5_000,
    });

    // Type the canonical literal — editing semantics unchanged.
    await field.click();
    await field.fill("2 years");

    // Blur — the display swaps to the localized prose.
    await page.getByTestId("filters-apply").focus();
    await expect(field, "unfocused display is localized, never the canonical English").toHaveValue(
      "2 anni",
      { timeout: 5_000 },
    );

    // Focus again — the canonical literal returns for editing.
    await field.click();
    await expect(field, "focused display is the canonical editable literal").toHaveValue("2 years");

    // Singular agreement — 1 year → 1 anno (plural-aware unit prose).
    await field.fill("1 year");
    await page.getByTestId("filters-apply").focus();
    await expect(field, "singular unit agreement in the display").toHaveValue("1 anno", {
      timeout: 5_000,
    });
  });
});
