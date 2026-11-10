/**
 * entity-dict-page-lifecycle — the whole dict-page row lifecycle driven
 * through the UI only: create via the draft row → edit → per-row revert
 * → re-edit → bulk revert → chevron reorder → save → persisted order →
 * soft-delete → deletion-filter view → bulk restore → final soft-delete.
 * No API calls for anything the page can do itself, no mocks.
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
  });

  test("create → revert → bulk-revert → reorder → delete → restore", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsTestAdmin(page);
    await page.goto(DICT_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid^="selectable-row-"]').first()).toBeVisible();

    // ── 1. CREATE via the draft row ──────────────────────────────────
    await page.getByTestId("dict-toolbar-add").click();
    const draft = page.getByTestId("dict-draft-row");
    await expect(draft).toBeVisible();

    await draft.locator('[data-dict-cell="code"] input').fill(CODE);
    // The label_key cell is the TranslationKeyCell combo — a custom.*
    // key is typed straight into its searchbox and committed on Enter.
    await draft.locator('[data-dict-cell="label_key"]').click();
    const keySearch = page.getByPlaceholder(/entities\.customer_type\.rows\./);
    await keySearch.fill(BASE_KEY);
    await keySearch.press("Enter");

    const saveBtn = page.getByTestId("dict-bulk-save");
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expect(draft).toHaveCount(0);

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
    // Both swapped rows are tainted; ours shows the per-row revert.
    await expect(row.getByTestId("dict-row-revert")).toBeVisible();
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    // Save succeeded → taints re-baseline (revert icons retire).
    await expect(row.getByTestId("dict-row-revert")).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 5000 });
    const orderAfterReload = await rowOrder(page);
    expect(orderAfterReload.indexOf(ourTestid)).toBeLessThan(
      orderAfterReload.indexOf(neighbourTestid),
    );

    // ── 5. SOFT-DELETE via the row CTA ──────────────────────────────
    await ourRow(page).getByTestId("dict-row-delete").click();
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
    await expect(deletedRow).toHaveCount(0); // leaves the deleted view

    // Back to live view — the row is restored.
    await page.getByTestId("dict-deletion-filter-non_deleted").click();
    await expect(ourRow(page)).toBeVisible();

    // ── 7. FINAL UI DELETE → physical cleanup rides afterAll ────────
    await ourRow(page).getByTestId("dict-row-delete").click();
    await expect(page.locator(`[title="${CODE}"]`)).toHaveCount(0);
  });
});
