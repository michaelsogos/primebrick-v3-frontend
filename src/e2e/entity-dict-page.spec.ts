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

/** Deterministic Translator API stub — every pair 'available', output
 *  `[MT] <text>`; `delay` slows each translate so the AI-busy indicator
 *  is observable mid-flight. */
async function stubTranslator(page: import("@playwright/test").Page, delay = 0) {
  await page.addInitScript((ms) => {
    (window as unknown as { Translator: unknown }).Translator = {
      availability: async () => "available",
      create: async () => ({
        translate: async (text: string) => {
          if (ms > 0) await new Promise((r) => setTimeout(r, ms));
          return `[MT] ${text}`;
        },
        destroy: () => {},
      }),
    };
  }, delay);
}

test.describe("entity dict page (/crm/settings/customer_types)", () => {
  test("resolves the dict archetype and renders rows", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto(DICT_URL, { waitUntil: "domcontentloaded" });

    const dictPage = page.getByTestId("entity-dict-page");
    await expect(dictPage).toBeVisible({ timeout: 30000 });
    await expect(dictPage).toHaveAttribute("data-entity", "customer_type");

    // The toolbar contract — the two-level ELT anatomy: level 1 hosts the
    // scoped search left and CTAs right; level 2 is the shared
    // SELECT ALL | FILTER | BULK ACTIONS bar (same component, same
    // behaviour — the select-all lives in the bar's leading zone).
    await expect(page.getByTestId("dict-toolbar-select-all")).toBeVisible();
    await expect(
      page.getByTestId("bulk-actions-toolbar").getByTestId("dict-toolbar-select-all"),
    ).toBeVisible();
    await expect(page.getByTestId("dict-search")).toBeVisible();
    await expect(page.getByTestId("dict-toolbar-add")).toBeVisible();
    await expect(page.getByTestId("bulk-actions-toolbar")).toBeVisible();
    await expect(page.getByTestId("bulk-actions-toggle")).toBeVisible();

    // customer_type is soft-delete enabled → the three-view deletion
    // group is wired exactly like the entity list toolbar; the canonical
    // refresh CTA is always present (by design, not a meta action).
    await expect(page.getByTestId("dict-deletion-filter")).toBeVisible();
    await expect(page.getByTestId("dict-refresh")).toBeVisible();
    await expect(page.getByTestId("dict-refresh")).toBeEnabled();

    // The search-scope CTA opens the real `entity.searchIn` sheet — the
    // same panel ELT owns (search-in-all + one row per searchable column).
    await expect(page.getByTestId("dict-search-scope")).toBeVisible();
    await page.getByTestId("dict-search-scope").click();
    await expect(page.getByTestId("search-in-all")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("search-in-all")).not.toBeVisible();

    // The funnel CTA opens the shared `entity.filters` sheet — the same
    // panel ELT owns (standard/advanced mode tabs).
    const dictFilters = page.getByTestId("dict-filters");
    await expect(dictFilters).toBeVisible();
    await dictFilters.click();
    await expect(page.getByTestId("filters-mode-standard")).toBeVisible();
    await page.keyboard.press("Escape");

    // Selection drives the bulk mode: selecting all rows surfaces the
    // shared bulk-delete CTA (enabled); the dict-local revert stays gated
    // on tainted rows only.
    await page.getByTestId("dict-toolbar-select-all").click();
    const bulkDelete = page.getByTestId("entity-bulk-delete");
    await expect(bulkDelete).toBeVisible();
    await expect(bulkDelete).toBeEnabled();
    await expect(page.getByTestId("dict-toolbar-bulk-revert")).not.toBeVisible();

    // The toggle returns the lower bar to the filters side; deselecting
    // keeps the anatomy intact.
    await page.getByTestId("bulk-actions-toggle").click();
    await page.getByTestId("dict-toolbar-select-all").click();
  });

  test("sheet anatomy: colored key badge, coverage chips, EN gate, AI review", async ({
    page,
  }) => {
    await stubTranslator(page, 350);
    await loginAsTestAdmin(page);
    await page.goto(DICT_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 30000 });

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

    // Sheet title — the management phrasing ("Manage Translations"),
    // not the bare noun, served from system.settings.translations.title.
    await expect(sheet.getByText("Manage Translations")).toBeVisible();

    // LINE 1 — the FULL key renders as a colored dot-notation badge
    // (full path is the badge text AND the title), before the lang combo.
    const keyBadge = sheet.getByTestId("i18n-editor-key");
    await expect(keyBadge).toBeVisible({ timeout: 5000 });
    await expect(keyBadge).toHaveText(FULL_KEY);
    await expect(keyBadge).toHaveAttribute("title", FULL_KEY);
    const badgeLeadsPicker = await sheet.evaluate((el) => {
      const badge = el.querySelector('[data-testid="i18n-editor-key"]');
      const combo = el.querySelector('[data-testid="i18n-editor-preview-lang"]');
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

    // HEADER — the easy⇄powered engine segmented toggle: easy is the
    // default-pressed segment (browser Translator API); powered arms the
    // POC MT worker. One toggle for the whole sheet.
    await expect(sheet.getByTestId("i18n-editor-engine-toggle")).toBeVisible();
    await expect(sheet.getByTestId("i18n-editor-engine-easy")).toHaveAttribute("aria-pressed", "true");
    await expect(sheet.getByTestId("i18n-editor-engine-powered")).toHaveAttribute("aria-pressed", "false");

    // LINE 3 — the two comboboxes: preview picker + update langs multi.
    await expect(sheet.getByTestId("i18n-editor-preview-lang")).toBeVisible();
    await expect(sheet.getByTestId("i18n-editor-update-langs")).toBeVisible();

    // Update-multi badges use the default multiBadge="icon-label" — flag
    // glyph AND the language name (en-GB is the default selection). The
    // icon-only mode stays in ComboSelect but has no consumers today.
    const updateCombo = sheet.getByTestId("i18n-editor-update-langs");
    await expect(updateCombo.locator(".fi.fi-gb")).toHaveCount(1);
    await expect(updateCombo.getByText("British English", { exact: true })).toHaveCount(1);

    // Swap CTA — the icon button between the combos exchanges preview ↔
    // update, enabled only while the update multi holds ONE language.
    const swapBtn = sheet.getByTestId("i18n-editor-swap");
    await expect(swapBtn).toBeEnabled(); // update multi defaults to [en-GB]
    await sheet.getByTestId("i18n-editor-preview-lang").click();
    await page.getByRole("option", { name: "Italiano" }).click();
    await swapBtn.click(); // preview en-GB → it-IT swap: update=[it-IT]
    await expect(sheet.getByTestId("i18n-editor-row-it-IT")).toBeVisible();
    await expect(sheet.getByTestId("i18n-editor-row-en-GB")).toHaveCount(0);
    await swapBtn.click(); // back — update=[en-GB]
    await expect(sheet.getByTestId("i18n-editor-row-en-GB")).toBeVisible();
    await sheet.getByTestId("i18n-editor-preview-lang").click();
    await page.getByRole("option", { name: "British English" }).click();

    // EN gate — update multi defaults to en-GB (no EN anywhere), Save
    // disabled, the * marker sits in that row's chrome.
    const saveBtn = sheet.getByTestId("i18n-editor-save");
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeDisabled();
    await expect(
      sheet.getByTestId("i18n-editor-update-caption").getByText("*", { exact: true }),
    ).toBeVisible();
    // No EN base → preview hidden.
    await expect(sheet.getByTestId("i18n-editor-base")).toHaveCount(0);
    // Missing status icon = amber semantic.
    await expect(sheet.getByTestId("i18n-editor-status-en-GB")).toHaveClass(/amber-500/);

    // Type the EN value → status turns Draft (sky), coverage 1/7, Save arms.
    await sheet.getByTestId("i18n-editor-value-en-GB").fill("E2E proof");
    await expect(sheet.getByTestId("i18n-editor-status-en-GB")).toHaveClass(/sky-500/);
    await expect(sheet.getByTestId("i18n-editor-coverage")).toHaveText("1/7");
    await expect(saveBtn).toBeEnabled();
    await expect(
      sheet.getByTestId("i18n-editor-update-caption").getByText("*", { exact: true }),
    ).toHaveCount(0);

    // The EN preview appears — a DISABLED field (PrimeField anatomy,
    // never editable) carrying the draft text.
    const baseCard = sheet.getByTestId("i18n-editor-base");
    await expect(baseCard).toBeVisible();
    await expect(baseCard).toBeDisabled();
    await expect(baseCard).toHaveValue("E2E proof");
    await expect(sheet.getByTestId("i18n-editor-base-copy")).toBeVisible();
    // Icons ride the in-box chrome top-right — same convention as the
    // translate areas.
    await expect(sheet.getByTestId("i18n-editor-base-icons")).toHaveClass(/absolute/);

    // Eraser CTA (editable overlay) — clears the draft back to empty:
    // status Missing, coverage 0/7, Save disarmed; refilling re-arms.
    const clearBtn = sheet.getByTestId("i18n-editor-clear-en-GB");
    await expect(clearBtn).toBeEnabled();
    await clearBtn.click();
    await expect(sheet.getByTestId("i18n-editor-value-en-GB")).toHaveValue("");
    await expect(sheet.getByTestId("i18n-editor-status-en-GB")).toHaveClass(/amber-500/);
    await expect(sheet.getByTestId("i18n-editor-coverage")).toHaveText("0/7");
    await expect(saveBtn).toBeDisabled();
    // While the SOURCE is empty the AI icon stays MOUNTED but greyed on
    // every non-source row — visibility is never the gate.
    await sheet.getByTestId("i18n-editor-missing-fr-FR").click();
    await expect(sheet.getByTestId("i18n-editor-ai-suggest-fr-FR")).toBeDisabled();
    await sheet.getByTestId("i18n-editor-value-en-GB").fill("E2E proof");
    await expect(sheet.getByTestId("i18n-editor-ai-suggest-fr-FR")).toBeEnabled();
    await expect(sheet.getByTestId("i18n-editor-coverage")).toHaveText("1/7");
    await expect(saveBtn).toBeEnabled();

    // Italiano's missing chip ADDS it to the update multi-select — a second
    // editor row appears with the Missing (amber) status icon.
    await sheet.getByTestId("i18n-editor-missing-it-IT").click();
    await expect(sheet.getByTestId("i18n-editor-row-it-IT")).toBeVisible();
    await expect(sheet.getByTestId("i18n-editor-value-it-IT")).toBeVisible();
    await expect(sheet.getByTestId("i18n-editor-status-it-IT")).toHaveClass(/amber-500/);
    // …and with 3 selections the update combo collapses to the summary
    // chip (multiSummaryAt defaults to 1) — "3 selected", no flag badges.
    await expect(updateCombo.locator(".fi")).toHaveCount(0);
    await expect(updateCombo).toContainText("3 selected");
    // …and with TWO update languages the swap CTA greys out.
    await expect(swapBtn).toBeDisabled();

    // Per-language AI suggestion — while the translator runs, the
    // canonical assistant busy indicator (AiIcon + "Generating…" +
    // typing dots) is up; a disabled inline preview then renders under
    // the row and the indicator retires — no "here you go" text.
    // The suggest CTA stays MOUNTED through the op — disabled, never
    // unmounted (re-callable as soon as the op ends).
    const suggestBtn = sheet.getByTestId("i18n-editor-ai-suggest-it-IT");
    await suggestBtn.click();
    await expect(sheet.getByTestId("i18n-editor-ai-busy")).toBeVisible();
    await expect(sheet.getByTestId("i18n-editor-ai-dots")).toBeVisible();
    await expect(suggestBtn).toBeDisabled();
    const suggestion = sheet.getByTestId("i18n-editor-suggestion-it-IT");
    await expect(suggestion).toBeVisible();
    await expect(suggestion).toHaveClass(/bg-muted/);
    await expect(suggestion).toContainText("[MT] E2E proof");
    // Suggestion icons — same right-float contract as the base preview,
    // and the float box is exactly one line-height tall (h-[1lh]) so
    // the icons center ON the docked text line, never bottom-aligned.
    await expect(sheet.getByTestId("i18n-editor-suggestion-icons-it-IT")).toHaveClass(/float-right/);
    await expect(sheet.getByTestId("i18n-editor-suggestion-icons-it-IT")).toHaveClass(/h-\[1lh\]/);
    await expect(sheet.getByTestId("i18n-editor-base-icons")).toHaveClass(/absolute/);
    await expect(sheet.getByTestId("i18n-editor-ai-busy")).toHaveCount(0);
    // Re-callable: a second click regenerates and OVERWRITES the prior box.
    await expect(suggestBtn).toBeEnabled();
    await suggestBtn.click();
    await expect(suggestion).toContainText("[MT] E2E proof");
    await sheet.getByTestId("i18n-editor-suggestion-accept-it-IT").click();
    await expect(sheet.getByTestId("i18n-editor-value-it-IT")).toHaveValue("[MT] E2E proof");
    await expect(sheet.getByTestId("i18n-editor-status-it-IT")).toHaveClass(/sky-500/);

    // Generate-all — review list: rows per uncovered lang, accept-all fills
    // every draft; coverage reaches 7/7.
    await sheet.getByTestId("i18n-editor-generate-all").click();
    const results = sheet.getByTestId("i18n-editor-results");
    await expect(results).toBeVisible({ timeout: 5000 });
    await expect(results.getByTestId("i18n-editor-result-fr-FR")).toContainText("[MT] E2E proof");
    // Accept-all stays disabled while the generation loop is busy —
    // Playwright waits for it to arm once every result is in.
    await expect(sheet.getByTestId("i18n-editor-accept-all")).toBeEnabled();
    await sheet.getByTestId("i18n-editor-accept-all").click();
    await expect(sheet.getByTestId("i18n-editor-coverage")).toHaveText("7/7");

    // Locale picker parity with the top bar: native labels + flags,
    // never raw ISO tags as the option name. Enter on the focused
    // trigger — a center mouse-click can land on a selected badge's
    // remove-X (clears the selection instead of opening the popover).
    const updateComboPicker = sheet.getByTestId("i18n-editor-update-langs");
    await updateComboPicker.focus();
    await updateComboPicker.press("Enter");
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
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 30000 });

    // First saved row — its label_key is a crm.* key with rows in every
    // language, so the sheet opens on the Saved state.
    const cta = page.getByTestId("dict-cell-translations").first();
    await expect(cta).toBeEnabled({ timeout: 5000 });
    await cta.click();

    const sheet = page.getByRole("dialog");
    await expect(sheet.getByTestId("i18n-editor-key")).toBeVisible({ timeout: 5000 });
    // Coverage reflects real seeded rows (this key isn't necessarily
    // translated in every language) — any non-zero count means a Saved row.
    await expect(sheet.getByTestId("i18n-editor-coverage")).toHaveText(/[1-7]\/7/, {
      timeout: 5000,
    });
    // Land on en-GB explicitly — seeded rows always carry English. The
    // update multi-select may already hold it (app-language default), so
    // only open the picker when the row isn't mounted.
    if ((await sheet.getByTestId("i18n-editor-value-en-GB").count()) === 0) {
      // Same badge-X hazard — keyboard open is geometry-proof.
      const updateCombo = sheet.getByTestId("i18n-editor-update-langs");
      await updateCombo.focus();
      await updateCombo.press("Enter");
      await page.getByRole("option", { name: "British English" }).click();
      await page.keyboard.press("Escape");
    }
    // Saved status = emerald semantic; the textarea accepts input
    // (the test admin holds translation.update.single).
    await expect(sheet.getByTestId("i18n-editor-status-en-GB")).toHaveClass(/emerald-500/, {
      timeout: 5000,
    });
    const valueArea = sheet.getByTestId("i18n-editor-value-en-GB");
    await expect(valueArea).toBeEditable();

    // Editing a saved value flips the status to Modified (sky) — the
    // pending write is an UPDATE (uuid+version ride the queue entry).
    await valueArea.fill("E2E touched value");
    await expect(sheet.getByTestId("i18n-editor-status-en-GB")).toHaveClass(/sky-500/);

    // Save queues under the dict page's owner — the cell shows the +N
    // pending badge after the sheet closes.
    await sheet.getByTestId("i18n-editor-save").click();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId("dict-cell-label-key").first()).toContainText("+1");
  });
});

/**
 * Non-EN dict values — the seeded-value layer the en-GB run cannot see.
 * The it-IT locale makes `navigator.languages` resolve uiLang to it-IT,
 * so every $t lookup reads the real Italian rows: a seeded expression
 * ("{count === 1 ? ...}") would render literally here while passing
 * every en-GB pin.
 */
test.describe("it-IT seeded values (locale-driven uiLang)", () => {
  test.use({ locale: "it-IT" });

  test("summary chip renders the real it-IT plural — never raw expressions", async ({
    page,
  }) => {
    await loginAsTestAdmin(page);
    await page.goto(DICT_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 30000 });

    // Same draft-key flow → open the translation editor sheet.
    await page.getByTestId("dict-toolbar-add").click();
    const keyCell = page.getByTestId("dict-cell-label-key").first();
    const languagesCta = keyCell.getByTestId("dict-cell-translations");
    await page.locator('[data-dict-cell="code"] input').first().fill("e2e_it_plural");
    await keyCell.click();
    const searchBox = page.getByPlaceholder(/entities\.customer_type\.rows\./);
    await searchBox.fill("custom.entities.customer_type.rows.e2e_it_plural");
    await searchBox.press("Enter");
    await languagesCta.click();

    const sheet = page.getByRole("dialog");
    await expect(sheet.getByTestId("i18n-editor-key")).toBeVisible({ timeout: 5000 });

    // Fresh key → no EN text → loadAll() forces updateLangs=['en-GB']
    // (the mount default overrides the uiLang pick). Adding it-IT through
    // its missing chip makes 2 selections → the summary chip must show
    // the REAL Italian plural ("2 selezionati"), never raw expression
    // text leaking from a seeded value. The coverage badge proves
    // loadAll() resolved before we click.
    await expect(sheet.getByTestId("i18n-editor-coverage")).toHaveText(/\/7/);
    const updateCombo = sheet.getByTestId("i18n-editor-update-langs");
    await sheet.getByTestId("i18n-editor-missing-it-IT").click();
    await expect(updateCombo).toContainText("2 selezionati");
    await expect(updateCombo).not.toContainText("{");
    await expect(updateCombo).not.toContainText("===");
  });
});
