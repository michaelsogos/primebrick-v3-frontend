import { test, expect, type Page, type Locator } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";
import { getPool } from "./helpers/db";

/* Combobox popover filter badges — the user-ratified contract (2026-11-26,
 * plan Part G): filters applied inside a combobox popover must be VISIBLE
 * and user-controllable, never "applied behind".
 *
 *  - PRESET-REMOVABLE badges (e.g. the translation-vocabulary scope
 *    `entities.sequence.rows.`) render as chips with X below the popover
 *    search input; removing one widens the offered catalog.
 *  - Enter commits the typed draft as a new user badge; user/preset badges
 *    combine in OR among themselves.
 *  - The uncommitted draft filters LIVE as a member of the OR group —
 *    typing a second term BROADENS the matches, never hides the first.
 *  - The popover eraser clears draft + every removable badge in one click.
 *
 * First consumer: the `format:"i18n_key"` filter combobox (CRM sequences →
 * filters → advanced → Description translation → Value).
 */

const SEQUENCES = "/crm/settings/sequences";
const STAMP = Math.floor(Date.now() / 1000);
const SCOPE_TERM = "entities.sequence.rows.";

/** Worker-parallel-safe probe keys — each test tags its own keys so the
 *  concurrent seeds never collide on the catalog unique constraint. */
function probeKey(tag: string, scope = "sequence"): string {
  return `custom.entities.${scope}.rows.e2e_${tag}_${STAMP}`;
}

async function seedProbeKeys(page: Page, keys: string[]) {
  for (const key of keys) {
    for (const lang of ["en-GB", "en-US", "it-IT"] as const) {
      const res = await page.request.post("/api/v1/entities/translation?module=custom", {
        data: { entity: { key, language: lang, value: `E2E badge probe ${key}` } },
      });
      // 409 tolerated: the probe may survive a previous interrupted run —
      // same key, same value shape, re-seeding is a no-op for the assertions.
      expect(
        [409].includes(res.status()) || res.status() < 300,
        `seed ${key} ${lang} → ${res.status()}`,
      ).toBe(true);
    }
  }
}

/** Sequences → filters sheet → advanced tab → field "Description translation"
 *  → open the Value combobox; returns the popover locator. */
async function openDescKeyValueCombo(page: Page) {
  await page.goto(SEQUENCES, { waitUntil: "domcontentloaded" });
  // Custom-dict keys written mid-session enter $dict only on a full reload
  // (boot-load lifecycle — same evidence as elt-i18n-key-filter.spec.ts).
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /filtri|filters/i }).first().click();
  await expect(page.getByTestId("filters-apply")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("filters-mode-advanced").click();
  const fieldLabel = page.locator("label", { hasText: /\bfield\b/i }).first();
  const fieldId = await fieldLabel.getAttribute("for");
  await page.locator(`[id="${fieldId}"]`).click();
  const fieldPopover = page.locator("[data-popover-content], [cmdk-list]").last();
  await fieldPopover.getByText(/description.?translation/i).first().click();
  const valueLabel = page.locator("label", { hasText: /\bvalue\b/i }).first();
  const valueId = await valueLabel.getAttribute("for");
  await page.locator(`[id="${valueId}"]`).click();
  const popover = page.locator("[data-popover-content]").last();
  await expect(popover).toBeVisible({ timeout: 5_000 });
  return popover;
}

function comboInput(popover: Locator): Locator {
  return popover.locator('[data-slot="command-input"] input, input').first();
}

async function commitBadge(popover: Locator, text: string) {
  const input = comboInput(popover);
  await input.fill(text);
  await input.press("Enter");
  await expect(input, "committing a badge empties the draft input").toHaveValue("");
}

test.describe("combobox popover filter badges (i18n_key filter vocabulary)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  // Self-cleaning contract — same family rule as elt-i18n-key-filter.spec.ts:
  // probe keys are deleted after the run, the dev DB stays clean.
  test.afterAll(async () => {
    await getPool().query(
      "DELETE FROM custom.translations WHERE key LIKE 'custom.entities.%e2e\\_%'",
    ).catch(() => undefined);
  });

  test("the vocabulary scope renders as a removable preset badge — nothing is applied behind", async ({ page }) => {
    // The E2E actor runs en-US — without fixtures the in-family catalog can be
    // genuinely empty there, so the probe guarantees listable rows.
    await seedProbeKeys(page, [probeKey("sc_alpha")]);
    const popover = await openDescKeyValueCombo(page);

    // The scope that used to hide at the options level is now a VISIBLE chip
    // below the popover search input — the core of the user complaint.
    await expect(
      popover.locator(`[data-testid="combo-filter-badge"][data-term="${SCOPE_TERM}"]`),
      "the entities.sequence.rows. scope is a visible preset badge",
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      popover.locator(`[data-testid="combo-filter-badge"][data-term="${SCOPE_TERM}"]`),
    ).toHaveAttribute("data-kind", "preset");

    // With the scope active the untyped list offers only in-family keys.
    const items = popover.locator("[cmdk-item], [role='option']");
    await expect(items.first()).toBeVisible({ timeout: 5_000 });
    const beforeTexts = await items.allInnerTexts();
    expect(beforeTexts.length).toBeGreaterThan(0);
    for (const text of beforeTexts) {
      expect(text, `untyped row is inside the scope family: ${text.slice(0, 80)}`).toContain(SCOPE_TERM);
    }

    // Removing the preset badge widens the catalog — alphabetical sorting puts
    // app.* keys first, so the head rows leave the family immediately.
    await popover
      .locator(`[data-testid="combo-filter-badge-remove"][data-term="${SCOPE_TERM}"]`)
      .click();
    await expect(
      popover.locator(`[data-testid="combo-filter-badge"][data-term="${SCOPE_TERM}"]`),
      "scope badge removed",
    ).toHaveCount(0);
    await expect
      .poll(
        async () => {
          const texts = await popover.locator("[cmdk-item], [role='option']").allInnerTexts();
          return texts.some((t) => !t.includes(SCOPE_TERM));
        },
        { timeout: 5_000 },
      )
      .toBe(true);
    await page.keyboard.press("Escape");
  });

  test("Enter commits the draft as a user badge and committed badges OR among themselves", async ({ page }) => {
    // Probes live OUTSIDE the sequence family: the scope preset alone never
    // offers them, so only the badge logic under test can surface them.
    const ALPHA_KEY = probeKey("or_alpha", "customer");
    const BETA_KEY = probeKey("or_beta", "customer");
    await seedProbeKeys(page, [ALPHA_KEY, BETA_KEY]);
    const popover = await openDescKeyValueCombo(page);
    const items = popover.locator("[cmdk-item], [role='option']");
    const alphaLeaf = `e2e_or_alpha_${STAMP}`;
    const betaLeaf = `e2e_or_beta_${STAMP}`;

    // Commit alpha — the badge appears with the user kind, the draft empties.
    await commitBadge(popover, alphaLeaf);
    await expect(
      popover.locator(`[data-testid="combo-filter-badge"][data-term="${alphaLeaf}"]`),
      "committed alpha badge visible",
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      popover.locator(`[data-testid="combo-filter-badge"][data-term="${alphaLeaf}"]`),
    ).toHaveAttribute("data-kind", "user");

    // Only alpha matches now — beta does not contain the alpha term.
    await expect(items.filter({ hasText: ALPHA_KEY }).first()).toBeVisible({ timeout: 5_000 });
    await expect(items.filter({ hasText: BETA_KEY })).toHaveCount(0);

    // Commit beta — OR semantics: BOTH probes are now offered even though no
    // single key matches both terms.
    await commitBadge(popover, betaLeaf);
    await expect(
      items.filter({ hasText: ALPHA_KEY }).first(),
      "alpha probe survives beta's commit — OR, not replacement",
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      items.filter({ hasText: BETA_KEY }).first(),
      "beta probe listed by its own badge",
    ).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press("Escape");
  });

  test("the uncommitted draft filters live inside the OR group — typing broadens, never replaces", async ({ page }) => {
    const ALPHA_KEY = probeKey("dr_alpha", "customer");
    const BETA_KEY = probeKey("dr_beta", "customer");
    await seedProbeKeys(page, [ALPHA_KEY, BETA_KEY]);
    const popover = await openDescKeyValueCombo(page);
    const items = popover.locator("[cmdk-item], [role='option']");
    const alphaLeaf = `e2e_dr_alpha_${STAMP}`;
    const betaLeaf = `e2e_dr_beta_${STAMP}`;

    await commitBadge(popover, alphaLeaf);
    await expect(items.filter({ hasText: BETA_KEY })).toHaveCount(0);

    // Type beta as a DRAFT (no Enter): it joins the OR group live — beta's
    // probe appears while alpha's stays. AND semantics would empty the list
    // here (no key contains both terms); replacement semantics would hide alpha.
    await comboInput(popover).fill(betaLeaf);
    await expect(
      items.filter({ hasText: BETA_KEY }).first(),
      "draft term matches join the OR group live",
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      items.filter({ hasText: ALPHA_KEY }).first(),
      "the committed badge's matches survive the draft — OR never narrows away",
    ).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press("Escape");
  });

  test("the popover eraser clears draft plus every removable badge in one click", async ({ page }) => {
    await seedProbeKeys(page, [probeKey("er_alpha")]);
    const popover = await openDescKeyValueCombo(page);
    const alphaLeaf = `e2e_er_alpha_${STAMP}`;

    await commitBadge(popover, alphaLeaf);
    const input = comboInput(popover);
    await input.fill("draft-residue");

    // Eraser is enabled with badges + draft even though they are not the input text.
    const eraser = popover.getByTestId("command-input-clear");
    await expect(eraser, "eraser enabled with removable state present").toBeEnabled({ timeout: 5_000 });
    await eraser.click();

    await expect(input, "draft cleared").toHaveValue("");
    // Every removable badge is gone — user AND preset (the scope included,
    // user-ratified: "testo + tutti i rimovibili").
    await expect(
      popover.locator('[data-testid="combo-filter-badge"][data-kind="user"]'),
      "user badges cleared",
    ).toHaveCount(0);
    await expect(
      popover.locator('[data-testid="combo-filter-badge"][data-kind="preset"]'),
      "preset badges cleared",
    ).toHaveCount(0);
    await expect(eraser, "eraser disabled once nothing removable remains").toBeDisabled();
    await page.keyboard.press("Escape");
  });
});
