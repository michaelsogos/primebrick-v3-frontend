/**
 * entity-dict-page — E2E for the `kind:"dict"` archetype on
 * /crm/settings/customer_types: page resolves through the catch-all,
 * rows render, the label_key cell exposes the key ComboSelect + the
 * languages CTA, and the translation-editor sheet opens on it.
 *
 * The sheet anatomy v2 is covered end-to-end with a deterministic
 * `Translator` stub (Chromium does not ship the built-in AI API).
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

const DICT_URL = "/crm/settings/customer_types";

/** Deterministic Translator API stub — every pair 'available', output `[MT] <text>`. */
async function stubTranslator(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    (window as unknown as { Translator: unknown }).Translator = {
      availability: async () => "available",
      create: async () => ({
        translate: async (text: string) => `[MT] ${text}`,
        destroy: () => {},
      }),
    };
  });
}

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

  test("sheet anatomy: colored key badge, coverage chips, EN gate, AI review", async ({
    page,
  }) => {
    await stubTranslator(page);
    await loginAsTestAdmin(page);
    await page.goto(DICT_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 20000 });

    // Add a draft row — its label_key cell is the TranslationKeyCell.
    await page.getByTestId("dict-toolbar-add").click();
    const keyCell = page.getByTestId("dict-cell-label-key").first();
    await expect(keyCell).toBeVisible();

    const languagesCta = keyCell.getByTestId("dict-cell-translations");
    await expect(languagesCta).toBeVisible();
    await expect(languagesCta).toBeDisabled();

    // Fill the draft's code first so the suggested key is stable.
    await page.locator('[data-dict-cell="code"] input').first().fill("e2e_poc");

    // Type the suggested custom.* key and commit it via Enter.
    await keyCell.click();
    const searchBox = page.getByPlaceholder(/entities\.customer_type\.rows\./);
    await searchBox.fill("custom.entities.customer_type.rows.e2e_poc");
    await searchBox.press("Enter");

    await expect(languagesCta).toBeEnabled();
    await languagesCta.click();

    const sheet = page.getByRole("dialog");
    const FULL_KEY = "custom.entities.customer_type.rows.e2e_poc";

    // LINE 1 — the FULL key renders as a colored dot-notation badge
    // (full path is the badge text AND the title), before the lang combo.
    const keyBadge = sheet.getByTestId("i18n-editor-key");
    await expect(keyBadge).toBeVisible({ timeout: 10000 });
    await expect(keyBadge).toHaveText(FULL_KEY);
    await expect(keyBadge).toHaveAttribute("title", FULL_KEY);
    const badgeLeadsPicker = await sheet.evaluate((el) => {
      const badge = el.querySelector('[data-testid="i18n-editor-key"]');
      const combo = el.querySelector('[data-testid="i18n-editor-lang"]');
      return (
        !!badge &&
        !!combo &&
        !!(badge.compareDocumentPosition(combo) & Node.DOCUMENT_POSITION_FOLLOWING)
      );
    });
    expect(badgeLeadsPicker).toBe(true);

    // HEAD — coverage badge 0/7 + one clickable flag chip per uncovered lang.
    await expect(sheet.getByTestId("i18n-editor-coverage")).toHaveText("0/7");
    for (const l of ["it-IT", "fr-FR", "de-DE"])
      await expect(sheet.getByTestId(`i18n-editor-missing-${l}`)).toBeVisible();

    // EN gate — selector defaults to en-GB (no EN anywhere), Save disabled,
    // the * marker + message are visible.
    const saveBtn = sheet.getByTestId("i18n-editor-save");
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeDisabled();
    await expect(sheet.getByTestId("i18n-editor-en-required")).toBeVisible();
    // No EN base → LINE 2 hidden.
    await expect(sheet.getByTestId("i18n-editor-base")).toHaveCount(0);
    // Missing status badge = amber semantic.
    await expect(sheet.getByTestId("i18n-editor-status")).toHaveClass(/amber-500/);

    // Type the EN value → status turns Draft (sky), coverage 1/7, Save arms.
    await sheet.getByTestId("i18n-editor-value").fill("E2E proof");
    await expect(sheet.getByTestId("i18n-editor-status")).toHaveClass(/sky-500/);
    await expect(sheet.getByTestId("i18n-editor-coverage")).toHaveText("1/7");
    await expect(saveBtn).toBeEnabled();
    await expect(sheet.getByTestId("i18n-editor-en-required")).toHaveCount(0);

    // Jump to Italiano through its missing chip — LINE 2 EN base appears
    // (Base badge + readonly text + copy CTA), status back to Missing.
    await sheet.getByTestId("i18n-editor-missing-it-IT").click();
    const baseCard = sheet.getByTestId("i18n-editor-base");
    await expect(baseCard).toBeVisible();
    await expect(baseCard.getByTestId("i18n-editor-base-text")).toHaveValue("E2E proof");
    await expect(sheet.getByTestId("i18n-editor-base-copy")).toBeVisible();
    await expect(sheet.getByTestId("i18n-editor-status")).toHaveClass(/amber-500/);

    // Per-language AI suggestion — card below the textarea, accept fills it.
    await sheet.getByTestId("i18n-editor-ai-suggest").click();
    const suggestion = sheet.getByTestId("i18n-editor-suggestion");
    await expect(suggestion).toBeVisible();
    await expect(suggestion).toContainText("[MT] E2E proof");
    await sheet.getByTestId("i18n-editor-suggestion-accept").click();
    await expect(sheet.getByTestId("i18n-editor-value")).toHaveValue("[MT] E2E proof");
    await expect(sheet.getByTestId("i18n-editor-status")).toHaveClass(/sky-500/);

    // Generate-all — review list: rows per uncovered lang, accept-all fills
    // every draft; coverage reaches 7/7.
    await sheet.getByTestId("i18n-editor-generate-all").click();
    const results = sheet.getByTestId("i18n-editor-results");
    await expect(results).toBeVisible({ timeout: 15000 });
    await expect(results.getByTestId("i18n-editor-result-fr-FR")).toContainText("[MT] E2E proof");
    await sheet.getByTestId("i18n-editor-accept-all").click();
    await expect(sheet.getByTestId("i18n-editor-coverage")).toHaveText("7/7");

    // Locale picker parity with the top bar: native labels + flags,
    // never raw ISO tags as the option name.
    await sheet.getByTestId("i18n-editor-lang").click();
    await expect(page.getByRole("option", { name: "Italiano" })).toBeVisible();
    await expect(page.getByRole("option", { name: "it-IT", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // No Cancel CTA — the sheet commits only through Save, dismisses via X.
    await expect(sheet.getByRole("button", { name: /cancel|annulla/i })).toHaveCount(0);
  });

  test("saved key — editable row, Modified status, owner-scoped queueing", async ({
    page,
  }) => {
    await loginAsTestAdmin(page);
    await page.goto(DICT_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 20000 });

    // First saved row — its label_key is a crm.* key with rows in every
    // language, so the sheet opens on the Saved state.
    const cta = page.getByTestId("dict-cell-translations").first();
    await expect(cta).toBeEnabled({ timeout: 15000 });
    await cta.click();

    const sheet = page.getByRole("dialog");
    await expect(sheet.getByTestId("i18n-editor-key")).toBeVisible({ timeout: 10000 });
    // Coverage reflects real seeded rows (this key isn't necessarily
    // translated in every language) — any non-zero count means a Saved row.
    await expect(sheet.getByTestId("i18n-editor-coverage")).toHaveText(/^[1-7]\/7/, {
      timeout: 10000,
    });
    // Land on en-GB explicitly — seeded rows always carry English.
    await sheet.getByTestId("i18n-editor-lang").click();
    await page.getByRole("option", { name: "British English" }).click();
    // Saved status = emerald semantic; the textarea accepts input
    // (the test admin holds translation.update.single).
    await expect(sheet.getByTestId("i18n-editor-status")).toHaveClass(/emerald-500/, {
      timeout: 10000,
    });
    const valueArea = sheet.getByTestId("i18n-editor-value");
    await expect(valueArea).toBeEditable();

    // Editing a saved value flips the status to Modified (sky) — the
    // pending write is an UPDATE (uuid+version ride the queue entry).
    await valueArea.fill("E2E touched value");
    await expect(sheet.getByTestId("i18n-editor-status")).toHaveClass(/sky-500/);

    // Save queues under the dict page's owner — the cell shows the +N
    // pending badge after the sheet closes.
    await sheet.getByTestId("i18n-editor-save").click();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId("dict-cell-label-key").first()).toContainText("+1");
  });
});
