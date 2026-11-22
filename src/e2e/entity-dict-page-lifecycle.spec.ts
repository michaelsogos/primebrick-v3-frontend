/**
 * entity-dict-page-lifecycle — the saved-row lifecycle driven through
 * the UI only: create via the composer→pending flow → edit → per-row
 * revert → re-edit → bulk revert → chevron reorder → save → persisted
 * order → soft-delete → deletion-filter view → bulk restore → final
 * soft-delete. Plus the extras sheet end-to-end (pending AND saved).
 * No API calls for anything the page can do itself, no mocks.
 *
 * The composer→pending leg (discard, gates, validation, accents) lives
 * in `entity-dict-draft-lifecycle.spec.ts` — this file's `e2e_lc_` code
 * prefix is its cleanup boundary.
 *
 * The ONLY non-UI step is the physical cleanup: dict entities expose no
 * purge CTA (delete is soft-only), so the ad-hoc row is removed by a
 * direct DELETE in afterAll — the same role entity-crud-lifecycle's
 * soft residue plays when no purge exists.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";
import { getPool } from "./helpers/db";

const DICT_URL = "/crm/settings/customer_types";
/** link_types carries `inverse_label_key` — the live extras surface. */
const LINK_DICT_URL = "/crm/settings/customer_link_types";
/** Unique run code — also the afterAll cleanup predicate. */
const CODE = `e2e_lc_${Date.now().toString(36)}`;
const BASE_KEY = `custom.entities.customer_type.rows.${CODE}`;
const EDITED_KEY = `${BASE_KEY}_edited`;

/** Row locator scoped to the ad-hoc row — the code badge carries
 *  title=<code> and is the row's immutable identity on the page. */
function ourRow(page: import("@playwright/test").Page) {
  return page
    .locator('[data-testid^="selectable-row-"]')
    .filter({ has: page.locator(`[title="${CODE}"]`) });
}

/** DOM-ordered list of every mounted row testid — the order the page
 *  is actually rendering (displayRows), not a derived assertion. */
async function rowOrder(page: import("@playwright/test").Page): Promise<string[]> {
  return page
    .locator('[data-testid^="selectable-row-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid") ?? ""));
}

test.describe.serial("dict lifecycle — UI-only on an ad-hoc row", () => {
  test.afterAll(async () => {
    // Physical cleanup — no purge CTA exists on dict entities, so the
    // sweep covers both live and soft-deleted leftovers of this prefix
    // (current run + any previously crashed run).
    await getPool().query(
      `DELETE FROM crm.customer_types WHERE code LIKE 'e2e_lc_%'`,
    );
    await getPool().query(
      `DELETE FROM crm.customer_link_types WHERE code LIKE 'e2e_lc_%'`,
    );
  });

  test("create → revert → bulk-revert → reorder → delete → restore", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsTestAdmin(page);
    await page.goto(DICT_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid^="selectable-row-"]').first()).toBeVisible();

    // ── 1. CREATE via the composer→pending lifecycle ─────────────────
    const addBtn = page.getByTestId("dict-toolbar-add");
    await addBtn.click();
    const draft = page.getByTestId("dict-draft-row");
    await expect(draft).toBeVisible();

    // Single-composer gate: NEW stays disabled while the composer is
    // open; ✓ is gated on composer validity (code + label_key).
    await expect(addBtn).toBeDisabled();
    const confirmBtn = draft.getByTestId("dict-draft-confirm");
    await expect(confirmBtn).toBeDisabled();

    await draft.locator('[data-dict-cell="code"] input').fill(CODE);
    // The label_key cell is the TranslationKeyCell combo — a custom.*
    // key is typed straight into its searchbox and committed on Enter.
    await draft.locator('[data-dict-cell="label_key"]').click();
    const keySearch = page.getByPlaceholder(/entities\.customer_type\.rows\./);
    await keySearch.fill(BASE_KEY);
    await keySearch.press("Enter");

    // Valid composer → ✓ arms → confirm pushes a pending row (client
    // move, zero server): composer gone, NEW re-enabled, the pending
    // renders appended as a DictRow with the INFO "da salvare" accent.
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();
    await expect(draft).toHaveCount(0);
    await expect(addBtn).toBeEnabled();
    const pending = page.getByTestId("selectable-row-d1");
    await expect(pending).toBeVisible();
    await expect(pending).toHaveClass(/border-l-info/);
    await expect(pending.getByTestId("dict-pending-delete")).toBeVisible();

    const saveBtn = page.getByTestId("dict-bulk-save");
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expect(pending).toHaveCount(0);

    // The saved row carries the code badge — capture its row testid
    // (selectable-row-<uuid>) once; it is our anchor for the whole run.
    const row = ourRow(page);
    await expect(row).toBeVisible();
    const ourTestid = (await row.getAttribute("data-testid"))!;
    expect(ourTestid).toMatch(/^selectable-row-/);
    // New row lands last (sort = max + gap, sort asc default).
    const orderAfterCreate = await rowOrder(page);
    expect(orderAfterCreate.at(-1)).toBe(ourTestid);

    // ── 2. EDIT → per-row REVERT (Undo2, in-memory) ─────────────────
    const keyCell = row.getByTestId("dict-cell-label-key");
    await keyCell.click();
    await keySearch.fill(EDITED_KEY);
    await keySearch.press("Enter");
    // Tainted → the per-row revert icon mounts.
    const rowRevert = row.getByTestId("dict-row-revert");
    await expect(rowRevert).toBeVisible();
    await rowRevert.click();
    await expect(rowRevert).toHaveCount(0);
    await expect(keyCell).toContainText(BASE_KEY);

    // ── 3. RE-EDIT → BULK REVERT (Undo2 + count badge) ──────────────
    await keyCell.click();
    await keySearch.fill(EDITED_KEY);
    await keySearch.press("Enter");
    await expect(row.getByTestId("dict-row-revert")).toBeVisible();
    // Selecting the row flips the shared bar to bulk mode and arms the
    // dict-local revert with the selected-tainted count.
    await row.getByRole("checkbox").check();
    const bulkRevert = page.getByTestId("dict-toolbar-bulk-revert");
    await expect(bulkRevert).toBeVisible();
    await expect(bulkRevert).toContainText("(1)");
    await bulkRevert.click();
    await expect(row.getByTestId("dict-row-revert")).toHaveCount(0);
    await expect(keyCell).toContainText(BASE_KEY);
    await row.getByRole("checkbox").uncheck();

    // ── 4. CHEVRON MOVE → tainted → SAVE → persisted across reload ──
    // Moving up swaps `sort` with the neighbour above — capture which
    // row that is BEFORE the move, so the persisted-order assertion is
    // about the swap, not an index.
    const orderBeforeMove = await rowOrder(page);
    const ourIdx = orderBeforeMove.indexOf(ourTestid);
    const neighbourTestid = orderBeforeMove[ourIdx - 1];
    await row.getByTestId("dict-row-move-up").click();
    // The swap is visible IMMEDIATELY — the chain is sorted by the
    // effective order value (taint shadows the server row), not by the
    // last-saved server values.
    await expect
      .poll(async () => {
        const o = await rowOrder(page);
        return o.indexOf(ourTestid) < o.indexOf(neighbourTestid);
      })
      .toBe(true);
    // Both swapped rows are tainted; ours shows the per-row revert.
    await expect(row.getByTestId("dict-row-revert")).toBeVisible();
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    // Save succeeded → taints re-baseline (revert icons retire).
    await expect(row.getByTestId("dict-row-revert")).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 5_000 });
    // After a reload the page shell mounts before the row list — waiting on
    // the page alone lets rowOrder read an empty DOM under load.
    await expect(page.locator('[data-testid^="selectable-row-"]').first()).toBeVisible({ timeout: 5_000 });
    const orderAfterReload = await rowOrder(page);
    expect(orderAfterReload.indexOf(ourTestid)).toBeLessThan(
      orderAfterReload.indexOf(neighbourTestid),
    );

    // ── 5. SOFT-DELETE via the row CTA ──────────────────────────────
    await ourRow(page).getByTestId("dict-row-delete").click();
    // Governed confirm gate — the op cannot run without the Delete click.
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.locator(`[title="${CODE}"]`)).toHaveCount(0);

    // ── 6. DELETION FILTER → deleted view → BULK RESTORE ────────────
    await page.getByTestId("dict-deletion-filter-deleted").click();
    const deletedRow = ourRow(page);
    await expect(deletedRow).toBeVisible();
    await expect(deletedRow.getByText("Deleted")).toBeVisible();
    await deletedRow.getByRole("checkbox").check();
    // Selection → bulk mode → the Trash+ArrowUp "restore" CTA (DB op),
    // enabled because every selected row is deleted.
    const bulkRestore = page.getByTestId("entity-bulk-restore");
    await expect(bulkRestore).toBeVisible();
    await expect(bulkRestore).toBeEnabled();
    await bulkRestore.click();
    // Governed confirm gate — restore cannot run without the click.
    await page.getByRole("dialog").getByRole("button", { name: "Restore" }).click();
    await expect(deletedRow).toHaveCount(0); // leaves the deleted view

    // Back to live view — the row is restored.
    await page.getByTestId("dict-deletion-filter-non_deleted").click();
    await expect(ourRow(page)).toBeVisible();

    // ── 7. FINAL UI DELETE → physical cleanup rides afterAll ────────
    await ourRow(page).getByTestId("dict-row-delete").click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.locator(`[title="${CODE}"]`)).toHaveCount(0);
  });

  test("extras sheet — pending AND saved rows edit inverse_label_key", async ({ page }) => {
    test.setTimeout(90_000);
    await loginAsTestAdmin(page);
    await page.goto(LINK_DICT_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid^="selectable-row-"]').first()).toBeVisible();

    const sheet = page.getByTestId("sheet-primary-pane");
    const exCode = `${CODE}_ex`;
    const inverseKey = `custom.entities.customer_link_type.rows.inverse.${exCode}`;

    // ── extras on the PENDING row (task 8): the CTA exists before save,
    //    edits bind to d.values and ride the pending POST ──
    await page.getByTestId("dict-toolbar-add").click();
    const draft = page.getByTestId("dict-draft-row");
    await draft.locator('[data-dict-cell="code"] input').fill(exCode);
    // label_key stays EMPTY — the suggestion commits at save (task 7).
    await draft.getByTestId("dict-draft-confirm").click();
    const pending = page.locator('[data-testid="selectable-row-d1"]');
    await expect(pending).toBeVisible();

    await pending.getByTestId("dict-row-extras").click({ timeout: 5000 });
    await expect(sheet).toBeVisible();
    // inverse_label_key is a *_key extra → TranslationKeyCell combo.
    await sheet.getByTestId("dict-cell-label-key").click();
    const keySearch = page.getByPlaceholder(/entities\.customer_link_type\.rows\./);
    await keySearch.fill(inverseKey);
    await keySearch.press("Enter");
    await page.keyboard.press("Escape"); // close the sheet — state persists

    await page.getByTestId("dict-bulk-save").click();
    await expect(pending).toHaveCount(0, { timeout: 5_000 });
    let { rows } = await getPool().query(
      `SELECT inverse_label_key FROM crm.customer_link_types WHERE code = $1`,
      [exCode],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].inverse_label_key).toBe(inverseKey);

    // ── extras on the SAVED row: edit → taint → PUT persists ──
    const saved = page
      .locator('[data-testid^="selectable-row-"]')
      .filter({ has: page.locator(`[title="${exCode}"]`) });
    await expect(saved).toBeVisible();
    const inverseKey2 = `${inverseKey}_edited`;
    await saved.getByTestId("dict-row-extras").click();
    await expect(sheet).toBeVisible();
    await sheet.getByTestId("dict-cell-label-key").click();
    await keySearch.fill(inverseKey2);
    await keySearch.press("Enter");
    await page.keyboard.press("Escape");

    await expect(saved.getByTestId("dict-row-revert")).toBeVisible(); // taint marker
    await page.getByTestId("dict-bulk-save").click();
    await expect(saved.getByTestId("dict-row-revert")).toHaveCount(0, { timeout: 5_000 });
    ({ rows } = await getPool().query(
      `SELECT inverse_label_key FROM crm.customer_link_types WHERE code = $1`,
      [exCode],
    ));
    expect(rows[0].inverse_label_key).toBe(inverseKey2);

    // ── customer_types has NO extras → no extras CTA anywhere ──
    await page.goto(DICT_URL, { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-testid^="selectable-row-"]').first()).toBeVisible();
    await expect(page.getByTestId("dict-row-extras")).toHaveCount(0);
  });
});
