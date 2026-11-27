import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";
import { extJsonParse } from "./helpers/nats";

const CRM = "/svc/crm/api/v1/entities";

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

  test("the table CELL renders the localized unit prose — never the canonical literal", async ({ page }) => {
    // Seed a sequence whose revive cadence is the exact user-screenshot
    // value, then read the list cell in the Italian session.
    const RUN = Math.random().toString(36).slice(2, 10);
    const NAME = `e2e-revcell-${RUN}`;
    const cr = await page.request.post(`${CRM}/sequence`, {
      data: {
        entity: {
          name: NAME,
          pattern: `R${RUN.slice(-4)}{seq:3}-{sez}`,
          step: "1",
          start: "1",
          tz: "UTC",
          sez: "2026-01-15",
          revive_every: "2 years",
          revive_slot: "sez",
        },
      },
    });
    expect([200, 201], `create: ${await cr.text()}`).toContain(cr.status());
    const created = extJsonParse<{ entity?: { uuid: string; version: number } } & { uuid: string; version: number }>(
      await cr.text(),
    );
    const seq = (created.entity ?? created) as { uuid: string; version: number };

    try {
      await page.goto(SEQUENCES, { waitUntil: "domcontentloaded" });
      await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 5_000 });

      // revive_every is NOT a default-visible column — enable it through the
      // columns picker, the same gesture the user makes.
      await page.getByRole("button", { name: /colonne|columns/i }).first().click();
      const reviveToggle = page.getByTestId("columns-toggle-revive_every");
      await expect(reviveToggle, "revive_every row exists in the columns panel").toBeVisible({ timeout: 5_000 });
      await reviveToggle.click();
      await page.keyboard.press("Escape");

      // The list is paged — the seeded row is found through the server-side
      // search, never assumed on page one.
      await page.getByTestId("entity-search").locator("input").fill(NAME);
      const row = page.locator("table tbody tr", { hasText: NAME }).first();
      await expect(row, "the seeded sequence row is listed").toBeVisible({ timeout: 5_000 });
      const cell = row.getByTestId("revive-cell-display").first();
      await expect(cell, "the cell renders localized unit prose, never '2 years'").toHaveText("2 anni", {
        timeout: 5_000,
      });
    } finally {
      // Version-aware cleanup — the generation lifecycle may have bumped the row.
      const current = await page.request.get(`${CRM}/sequence/${seq.uuid}`).catch(() => null);
      let version = seq.version;
      if (current?.ok()) {
        const body = extJsonParse<{ entity?: { version?: number }; version?: number }>(await current.text());
        version = body.entity?.version ?? body.version ?? version;
      }
      await page.request.delete(`${CRM}/sequence/${seq.uuid}?version=${version}`).catch(() => {});
    }
  });
});
