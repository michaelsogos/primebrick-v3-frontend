/**
 * entity-dict-draft-lifecycle — the composer→pending leg of the dict
 * create flow, driven through the UI only:
 *
 *   NEW → composer (draft chip + info/40 accent, NEW gated, ✓ gated)
 *   → validation errors inline (charset rule + dup probe)
 *   → ✓ confirm → pending row appended with the SOLID info accent
 *   → discard / undo-drop / pending-only bulk delete (zero-server)
 *   → empty label_key commits the convention suggestion at save
 *
 * `entity-dict-page-lifecycle.spec.ts` owns the saved-row lifecycle and
 * the extras sheet; this file owns everything upstream of persistence.
 * The `e2e_dl_` code prefix is this file's cleanup boundary — specs run
 * on parallel workers, so each file sweeps only its own prefix.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";
import { getPool } from "./helpers/db";

const DICT_URL = "/crm/settings/customer_types";
/** Unique run code — also the afterAll cleanup predicate. */
const CODE = `e2e_dl_${Date.now().toString(36)}`;

test.describe.serial("dict draft lifecycle — composer → pending", () => {
  test.afterAll(async () => {
    await getPool().query(
      `DELETE FROM crm.customer_types WHERE code LIKE 'e2e_dl_%'`,
    );
  });

  test("composer gates, draft state, validation + probe, pending accent, save", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAsTestAdmin(page);
    await page.goto(DICT_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-testid^="selectable-row-"]').first()).toBeVisible();

    const addBtn = page.getByTestId("dict-toolbar-add");
    await addBtn.click();
    const draft = page.getByTestId("dict-draft-row");
    await expect(draft).toBeVisible();

    // ── Draft state anatomy (task 9): the chip joins the state
    //    vocabulary and the accent is the immature leg of the "to be
    //    saved" info pipeline (info/40 → info → none). ──
    await expect(draft.getByText("Draft")).toBeVisible();
    await expect(draft).toHaveClass(/border-l-info\/40/);

    // ── Single-composer gate + confirm gate on empty composer ──
    await expect(addBtn).toBeDisabled();
    const confirmBtn = draft.getByTestId("dict-draft-confirm");
    await expect(confirmBtn).toBeDisabled();
    const codeInput = draft.locator('[data-dict-cell="code"] input');

    // ── Charset rule: not-snake → inline error, ✓ stays gated ──
    await codeInput.fill("BAD-CODE!");
    await expect(draft.getByTestId("dict-cell-error")).toBeVisible();
    await expect(confirmBtn).toBeDisabled();

    // ── Dup probe: an EXISTING code → error swaps, gate holds ──
    const existingCode = await page
      .locator('[data-testid^="selectable-row-"] .font-mono[title]')
      .first()
      .getAttribute("title");
    expect(existingCode).toBeTruthy();
    await codeInput.fill(existingCode!);
    await expect(draft.getByTestId("dict-cell-error")).toBeVisible({ timeout: 10_000 });
    await expect(confirmBtn).toBeDisabled();

    // ── Valid unique code → errors retire, ✓ arms ──
    const okCode = `${CODE}_ok`;
    await codeInput.fill(okCode);
    await expect(draft.getByTestId("dict-cell-error")).toHaveCount(0, { timeout: 10_000 });
    // label_key left EMPTY on purpose — the suggestion commits at save
    // (covered by its own test); required fields are code-only-gated
    // where label_key is suggestion-optional.
    await expect(confirmBtn).toBeEnabled();

    // ── Confirm → pending appended with the SOLID info accent ──
    await confirmBtn.click();
    await expect(draft).toHaveCount(0);
    await expect(addBtn).toBeEnabled();
    const pending = page.getByTestId("selectable-row-d1");
    await expect(pending).toBeVisible();
    // `border-l-info` without `/40` — the confirmed leg of the pipeline.
    await expect(pending).toHaveClass(/border-l-info(?!\/)/);
    await expect(pending.getByTestId("dict-pending-undo")).toBeVisible();

    // ── Save persists the pending row to the DB ──
    const saveBtn = page.getByTestId("dict-bulk-save");
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expect(pending).toHaveCount(0, { timeout: 15_000 });
    const { rows } = await getPool().query(
      `SELECT code FROM crm.customer_types WHERE code = $1`,
      [okCode],
    );
    expect(rows).toHaveLength(1);
  });

  test("composer discard + pending undo + pending-only bulk delete", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsTestAdmin(page);
    await page.goto(DICT_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-testid^="selectable-row-"]').first()).toBeVisible();

    // Zero-server proof: discard, undo and pending bulk-drop are pure
    // client operations — no POST to the entities endpoint may fire.
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/entities/")) posts.push(r.url());
    });

    const addBtn = page.getByTestId("dict-toolbar-add");

    // ── ✕ discard: composer dies, no pending created, NEW re-arms ──
    await addBtn.click();
    const draft = page.getByTestId("dict-draft-row");
    await draft.locator('[data-dict-cell="code"] input').fill(`${CODE}_x`);
    await draft.getByTestId("dict-draft-discard").click();
    await expect(draft).toHaveCount(0);
    await expect(addBtn).toBeEnabled();
    await expect(page.locator('[data-testid="selectable-row-d1"]')).toHaveCount(0);

    // ── ✓ confirm → pending d2 (seq never reuses); undo drops it ──
    await addBtn.click();
    const draft2 = page.getByTestId("dict-draft-row");
    await draft2.locator('[data-dict-cell="code"] input').fill(`${CODE}_y`);
    await draft2.locator('[data-dict-cell="label_key"]').click();
    const keySearch = page.getByPlaceholder(/entities\.customer_type\.rows\./);
    await keySearch.fill(`custom.entities.customer_type.rows.${CODE}_y`);
    await keySearch.press("Enter");
    await draft2.getByTestId("dict-draft-confirm").click();
    const pending = page.locator('[data-testid="selectable-row-d2"]');
    await expect(pending).toBeVisible();
    await pending.getByTestId("dict-pending-undo").click();
    await expect(pending).toHaveCount(0);

    // ── pending selection → bulk delete partitions: local drop only ──
    await addBtn.click();
    const draft3 = page.getByTestId("dict-draft-row");
    await draft3.locator('[data-dict-cell="code"] input').fill(`${CODE}_z`);
    await draft3.locator('[data-dict-cell="label_key"]').click();
    await keySearch.fill(`custom.entities.customer_type.rows.${CODE}_z`);
    await keySearch.press("Enter");
    await draft3.getByTestId("dict-draft-confirm").click();
    const pending3 = page.locator('[data-testid="selectable-row-d3"]');
    await expect(pending3).toBeVisible();

    // The pending participates in selection like any saved row; a
    // pending-only selection drops locally — no confirm dialog, no request.
    await pending3.getByRole("checkbox").check();
    await page.getByTestId("entity-bulk-delete").click();
    await expect(pending3).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("dict-bulk-save")).toBeDisabled();

    expect(posts).toEqual([]);
  });

  test("empty label_key commits the convention suggestion at save", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsTestAdmin(page);
    await page.goto(DICT_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-testid^="selectable-row-"]').first()).toBeVisible();

    await page.getByTestId("dict-toolbar-add").click();
    const draft = page.getByTestId("dict-draft-row");
    const sugCode = `${CODE}_sug`;
    await draft.locator('[data-dict-cell="code"] input').fill(sugCode);
    // Unique code, label_key EMPTY → probe clears, ✓ arms.
    await expect(draft.getByTestId("dict-cell-error")).toHaveCount(0, { timeout: 10_000 });
    await expect(draft.getByTestId("dict-draft-confirm")).toBeEnabled();
    await draft.getByTestId("dict-draft-confirm").click();

    const pending = page.locator('[data-testid="selectable-row-d1"]');
    await expect(pending).toBeVisible();
    await page.getByTestId("dict-bulk-save").click();
    await expect(pending).toHaveCount(0, { timeout: 15_000 });

    // The persisted label_key is the convention suggestion, not an echo.
    const { rows } = await getPool().query(
      `SELECT label_key FROM crm.customer_types WHERE code = $1`,
      [sugCode],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].label_key).toBe(`custom.entities.customer_type.rows.${sugCode}`);
  });
});
