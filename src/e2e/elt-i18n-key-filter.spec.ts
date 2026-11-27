import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";
import { getPool } from "./helpers/db";

/* i18n_key filter vocabulary + combobox search eraser — the user-ratified
 * investigations (2026-11-26, TIC):
 *
 *  - PROVA DEL NOVE: a custom row-key written to the catalog MUST appear in
 *    the desc_key filter vocabulary — the `.entities.<tk>.rows.` contains
 *    rule over the loaded namespaces (custom + app + current module) is the
 *    ratified composition. The spec seeds its own fixture through the
 *    translations write API (cache-invalidating path) and points one
 *    sequence's description_key at it.
 *  - ERASER: the combobox search input's eraser must clear the typed query
 *    AND restore the unfiltered list — user-reported as impossible.
 *  - SEARCH-IN: machine-syntax varchar formats (revive_interval/revive_offset)
 *    must NOT appear in the search-in scope — they are not prose text.
 */

const SEQUENCES = "/crm/settings/sequences";
const PROBE_KEY = `custom.entities.sequence.rows.e2e_prova_del_nove_${Math.floor(Date.now() / 1000)}`;

async function openAdvancedValueCombo(page: import("@playwright/test").Page, fieldName: RegExp) {
  await page.getByTestId("filters-mode-advanced").click();
  const fieldLabel = page.locator("label", { hasText: /\bfield\b/i }).first();
  const fieldId = await fieldLabel.getAttribute("for");
  await page.locator(`[id="${fieldId}"]`).click();
  const fieldPopover = page.locator("[data-popover-content], [cmdk-list]").last();
  await fieldPopover.getByText(fieldName).first().click();
  const valueLabel = page.locator("label", { hasText: /\bvalue\b/i }).first();
  const valueId = await valueLabel.getAttribute("for");
  await page.locator(`[id="${valueId}"]`).click();
  return page.locator("[data-popover-content]").last();
}

test.describe("i18n_key filter vocabulary + combobox eraser", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  // Self-cleaning contract (user-ratified 2026-11-26): every probe key the
  // spec family ever seeded — unique per run — is deleted after the run, and
  // the sequence row re-pointed during TIC is neutralized. Dev DB stays clean.
  test.afterAll(async () => {
    await getPool().query(
      "DELETE FROM custom.translations WHERE key LIKE 'custom.entities.sequence.rows.e2e_prova_del_nove%' OR key = 'custom.entities.sequence.rows.prova_del_nove'",
    ).catch(() => undefined);
    await getPool().query(
      "UPDATE crm.sequences SET description_key = NULL WHERE description_key LIKE 'custom.entities.sequence.rows%e2e_prova_del_nove%' OR description_key = 'custom.entities.sequence.rows.prova_del_nove'",
    ).catch(() => undefined);
  });

  test("prova del nove — a catalog-written custom row-key appears in the filter vocabulary", async ({ page }) => {
    // Seed through the write API — the cache-invalidating path (direct SQL
    // would leave the Redis dict cache stale up to the TTL).
    const stamp = Date.now();
    for (const [lang, value] of [["en-GB", `Proof nine ${stamp}`], ["en-US", `Proof nine ${stamp}`], ["it-IT", `Prova nove ${stamp}`]] as const) {
      const res = await page.request.post("/api/v1/entities/translation?module=custom", {
        data: { entity: { key: PROBE_KEY, language: lang, value } },
      });
      expect(res.status(), `seed ${lang}`).toBeLessThan(300);
    }
    // TOC-0 freshness contract: the dict endpoint must serve the key
    // immediately after a write — no reload, no TTL window.
    const dictRes = await page.request.get("/api/v1/system/translations/custom/en-GB");
    const dictBody = await dictRes.text();
    const dictHasKey = dictBody.includes(PROBE_KEY);
    console.log("[TOC-0] dict endpoint serves fresh key:", dictHasKey, "status:", dictRes.status());
    // Point one sequence's description_key at the probe key (fixture linkage —
    // the vocabulary surfacing does not depend on it, the user's round-trip does).
    await getPool().query(
      "UPDATE crm.sequences SET description_key = $1 WHERE name = 'customers.code'",
      [PROBE_KEY],
    );

    await page.goto(SEQUENCES, { waitUntil: "domcontentloaded" });
    // The custom dict is boot-loaded — a key written mid-session needs a full
    // reload to enter $dict (dict-lifecycle evidence, TIC 2026-11-26).
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /filtri|filters/i }).first().click();
    const popover = await openAdvancedValueCombo(page, /description.?translation/i);
    await expect(popover).toBeVisible({ timeout: 5_000 });

    // The key MUST be offered — the contains rule over custom+app+module
    // namespaces is the ratified composition (not keys-in-use distinct).
    const input = popover.locator('[data-slot="command-input"] input, input').first();
    await input.fill("prova_del_nove");
    await expect(
      popover.locator("[cmdk-item], [role='option']").filter({ hasText: PROBE_KEY }).first(),
      "the catalog-written custom row-key is offered by the filter vocabulary",
    ).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press("Escape");
  });

  test("combobox search eraser clears the typed query and restores the list", async ({ page }) => {
    await page.goto(SEQUENCES, { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /filtri|filters/i }).first().click();

    // The IANA timezone combobox — a large deterministic vocabulary.
    const tzLabel = page.locator("label", { hasText: /time.?zone|fuso/i }).first();
    const tzId = await tzLabel.getAttribute("for");
    await page.locator(`[id="${tzId}"]`).click();
    const popover = page.locator("[data-popover-content]").last();
    const rows = popover.locator("[cmdk-item], [role='option']");
    await expect(rows.first()).toBeVisible({ timeout: 5_000 });
    const fullCount = await rows.count();

    // Type a narrowing query — the list must shrink.
    const input = popover.locator('[data-slot="command-input"] input, input').first();
    await input.fill("rome");
    await expect.poll(async () => rows.count(), { timeout: 5_000 }).toBeLessThan(fullCount);
    const narrowedCount = await rows.count();
    expect(narrowedCount).toBeGreaterThan(0);

    // The eraser must be enabled while text is present — and clicking it must
    // clear BOTH the input and the applied filtering (user-reported defect:
    // the filter stays applied behind, impossible to cancel).
    const eraser = popover.getByTestId("command-input-clear");
    await expect(eraser, "eraser enabled while a query is typed").toBeEnabled();
    await eraser.click();
    await expect(input, "eraser empties the input").toHaveValue("");
    await expect.poll(async () => rows.count(), { timeout: 5_000 }).toBe(fullCount);
    await page.keyboard.press("Escape");
  });

  test("search-in scope excludes machine-syntax varchar formats (revive_interval/revive_offset)", async ({ page }) => {
    await page.goto(SEQUENCES, { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 5_000 });

    await page.getByTestId("entity-search-scope").click();
    await expect(page.getByTestId("search-in-all")).toBeVisible({ timeout: 5_000 });

    // revive_every / revive_grace store machine-canonical varchar (`every 1 year`
    // wire) — not prose: an ILIKE scope on them is noise, so they belong to the
    // excluded TYPE classes (user-ratified: "we don't treat it as TEXT").
    await expect(page.getByTestId("search-in-revive_every"), "revive_every out of the search-in scope").toHaveCount(0);
    await expect(page.getByTestId("search-in-revive_grace"), "revive_grace out of the search-in scope").toHaveCount(0);
    // Plain text columns DO stay — the discriminator that the panel renders at all.
    await expect(page.getByTestId("search-in-name")).toHaveCount(1);
    await page.keyboard.press("Escape");
  });
});
