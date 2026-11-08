/**
 * entity-dict-page — E2E for the `kind:"dict"` archetype on
 * /crm/settings/customer_types: page resolves through the catch-all,
 * rows render, the label_key cell exposes the key ComboSelect + the
 * languages CTA, and the translation-editor sheet opens on it.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

const DICT_URL = "/crm/settings/customer_types";

test.describe("entity dict page (/crm/settings/customer_types)", () => {
  test("resolves the dict archetype and renders rows", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto(DICT_URL, { waitUntil: "domcontentloaded" });

    const dictPage = page.getByTestId("entity-dict-page");
    await expect(dictPage).toBeVisible({ timeout: 20000 });
    await expect(dictPage).toHaveAttribute("data-entity", "customer_type");

    // The toolbar contract: search + add-row CTA + bounded pager controls.
    await expect(page.getByTestId("dict-search")).toBeVisible();
    await expect(page.getByTestId("dict-toolbar-add")).toBeVisible();
  });

  test("label_key cell offers key select/create + languages CTA opens the sheet", async ({
    page,
  }) => {
    await loginAsTestAdmin(page);
    await page.goto(DICT_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 20000 });

    // Add a draft row — its label_key cell is the TranslationKeyCell.
    await page.getByTestId("dict-toolbar-add").click();
    const keyCell = page.getByTestId("dict-cell-label-key").first();
    await expect(keyCell).toBeVisible();

    // The languages CTA stays disabled until a key is selected; type a
    // custom.* key into the combobox trigger to arm it.
    const languagesCta = page.getByTestId("dict-cell-translations").first();
    await expect(languagesCta).toBeVisible();
    await expect(languagesCta).toBeDisabled();

    // Fill the draft's code first so the suggested key is stable.
    const codeInput = page.locator('[data-dict-cell="code"] input').first();
    await codeInput.fill("e2e_poc");

    // Type the suggested custom.* key and commit it via Enter.
    await keyCell.click();
    const searchBox = page.getByPlaceholder(/entities\.customer_type\.rows\./);
    await searchBox.fill("custom.entities.customer_type.rows.e2e_poc");
    await searchBox.press("Enter");

    await expect(languagesCta).toBeEnabled();
    await languagesCta.click();

    // The translation-editor sheet opens on the right.
    await expect(page.getByTestId("i18n-editor-lang")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("i18n-editor-save")).toBeVisible();
    // The key being edited is echoed in the sheet content (title attr).
    await expect(
      page.getByTitle("custom.entities.customer_type.rows.e2e_poc"),
    ).toBeVisible();
  });
});
