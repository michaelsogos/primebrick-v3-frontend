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

/** DOM-ordered row testids — the order the page actually renders. */
async function rowOrder(page: import("@playwright/test").Page): Promise<string[]> {
  return page
    .locator('[data-testid^="selectable-row-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid") ?? ""));
}

test.describe.serial("dict draft lifecycle — composer → pending", () => {
  test.afterAll(async () => {
    await getPool().query(
      `DELETE FROM crm.customer_types WHERE code LIKE 'e2e_dl_%'`,
    );
    await getPool().query(
      `DELETE FROM crm.customer_link_types WHERE code LIKE 'e2e_dl_%'`,
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

    // ── Draft state anatomy (task 9): the accent is the immature leg of
    //    the "to be saved" info pipeline (info/40 → info → none). ──
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
    await expect(pending.getByTestId("dict-pending-delete")).toBeVisible();

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
    await pending.getByTestId("dict-pending-delete").click();
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

  test("draft persistence — taints + pending survive reload, RESET clears all", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAsTestAdmin(page);
    await page.goto(DICT_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-testid^="selectable-row-"]').first()).toBeVisible();

    // ── Taint a saved row (label_key edit → taint marker) ──
    const firstRow = page.locator('[data-testid^="selectable-row-"]').first();
    await firstRow.getByTestId("dict-cell-label-key").click();
    const keySearch = page.getByPlaceholder(/entities\.customer_type\.rows\./);
    await keySearch.fill(`custom.entities.customer_type.rows.${CODE}_taint`);
    await keySearch.press("Enter");
    await expect(firstRow.getByTestId("dict-row-revert")).toBeVisible();

    // ── Confirm a pending row ──
    await page.getByTestId("dict-toolbar-add").click();
    const draft = page.getByTestId("dict-draft-row");
    await draft.locator('[data-dict-cell="code"] input').fill(`${CODE}_rs`);
    await draft.locator('[data-dict-cell="label_key"]').click();
    await keySearch.fill(`custom.entities.customer_type.rows.${CODE}_rs`);
    await keySearch.press("Enter");
    await draft.getByTestId("dict-draft-confirm").click();
    const pending = page.getByTestId("selectable-row-d1");
    await expect(pending).toBeVisible();
    await expect(page.getByTestId("dict-reset")).toBeEnabled();

    // Draft write is debounced 400ms — wait until the slot carries the
    // pending entry `"id":"d1"` (composer-only docs have no pendings
    // entries; the pending's code alone can't discriminate the write
    // that ran while the composer was still open).
    await page.waitForFunction(() => {
      const k = Object.keys(localStorage).find((x) => x.startsWith("pb:dict-draft:"));
      return !!k && (localStorage.getItem(k) ?? "").includes('"id":"d1"');
    });

    // ── RELOAD → both legs restore: the pending row (same d1 id) and
    //    the tainted row (revert marker back). ──
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-testid^="selectable-row-"]').first()).toBeVisible({
      timeout: 30000,
    });
    const restoredPending = page.getByTestId("selectable-row-d1");
    await expect(restoredPending).toBeVisible();
    await expect(restoredPending.locator(`[title="${CODE}_rs"]`)).toBeVisible();
    await expect(restoredPending).toHaveClass(/border-l-info(?!\/)/);
    // The taint survived — the row's revert marker is back (the saved
    // row carries no _rs title; locate by its revert icon count).
    await expect(page.getByTestId("dict-row-revert").first()).toBeVisible();
    await expect(page.getByTestId("dict-bulk-save")).toBeEnabled();

    // ── RESET → all work dies locally: pending gone, taint reverted,
    //    save+reset disarm, draft slot removed — zero server requests. ──
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/entities/")) posts.push(r.url());
    });
    await page.getByTestId("dict-reset").click();
    await expect(restoredPending).toHaveCount(0);
    await expect(page.getByTestId("dict-row-revert")).toHaveCount(0);
    await expect(page.getByTestId("dict-bulk-save")).toBeDisabled();
    await expect(page.getByTestId("dict-reset")).toBeDisabled();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.keys(localStorage).some((k) => k.startsWith("pb:dict-draft:")),
        ),
      )
      .toBe(false);
    expect(posts).toEqual([]);
  });

  test("drag-drop reorders a pending row across the saved boundary", async ({ page }) => {
    test.setTimeout(90_000);
    await loginAsTestAdmin(page);
    await page.goto(DICT_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-testid^="selectable-row-"]').first()).toBeVisible();

    // ── Confirm a pending row — appended LAST (sort seed = max+10) ──
    await page.getByTestId("dict-toolbar-add").click();
    const draft = page.getByTestId("dict-draft-row");
    const dragCode = `${CODE}_dnd`;
    await draft.locator('[data-dict-cell="code"] input').fill(dragCode);
    await draft.locator('[data-dict-cell="label_key"]').click();
    const keySearch = page.getByPlaceholder(/entities\.customer_type\.rows\./);
    await keySearch.fill(`custom.entities.customer_type.rows.${dragCode}`);
    await keySearch.press("Enter");
    await draft.getByTestId("dict-draft-confirm").click();
    const pending = page.getByTestId("selectable-row-d1");
    await expect(pending).toBeVisible();
    const beforeDrag = await rowOrder(page);
    expect(beforeDrag.at(-1)).toBe("selectable-row-d1");

    // ── Drag the pending's grip ABOVE the saved neighbour right before
    //    it — a pending crosses the saved boundary mid-drag; the visual
    //    order must change immediately (effective-sort chain). Both rows
    //    must be in-viewport for the drag, so the pending is scrolled
    //    into view first and the target is its previous sibling. ──
    await pending.scrollIntoViewIfNeeded();
    const prevTestid = beforeDrag[beforeDrag.length - 2];
    const prevRow = page.getByTestId(prevTestid);
    await pending.getByTestId("dict-row-drag").dragTo(prevRow, {
      targetPosition: { x: 8, y: 4 },
    });
    await expect
      .poll(async () => {
        const o = await rowOrder(page);
        return o.indexOf("selectable-row-d1") === o.indexOf(prevTestid) - 1;
      })
      .toBe(true);

    // ── Save → reload → the dragged order persisted: our row still sits
    //    immediately before that same neighbour. ──
    await page.getByTestId("dict-bulk-save").click();
    await expect(pending).toHaveCount(0, { timeout: 15_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-testid^="selectable-row-"]').first()).toBeVisible({
      timeout: 30000,
    });
    const ourRow = page
      .locator('[data-testid^="selectable-row-"]')
      .filter({ has: page.locator(`[title="${dragCode}"]`) });
    const ourTestid = await ourRow.getAttribute("data-testid");
    expect(ourTestid).toBeTruthy();
    const reloadedOrder = await rowOrder(page);
    expect(reloadedOrder.indexOf(ourTestid!)).toBe(
      reloadedOrder.indexOf(prevTestid) - 1,
    );
  });

  test("drag-drop climbs through a duplicate-sort tie block (link types)", async ({
    page,
  }) => {
    // Regression: customer_link_types carries a real tie block (~40 rows
    // sharing sort=990). Before the strict-rank fix, a pending dragged
    // above a tied saved row was reassigned the same 990 and the seq
    // tiebreak bounced it back below the whole block — the drag was
    // capped at the saved/pending boundary.
    test.setTimeout(90_000);
    await loginAsTestAdmin(page);
    await page.goto("/crm/settings/customer_link_types", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-testid^="selectable-row-"]').first()).toBeVisible();

    // ── Confirm a pending row — appended LAST (sort seed = max+10) ──
    await page.getByTestId("dict-toolbar-add").click();
    const draft = page.getByTestId("dict-draft-row");
    const dragCode = `${CODE}_tie`;
    await draft.locator('[data-dict-cell="code"] input').fill(dragCode);
    await draft.locator('[data-dict-cell="label_key"]').click();
    const keySearch = page.getByPlaceholder(/entities\.customer_link_type\.rows\./);
    await keySearch.fill(`custom.entities.customer_link_type.rows.${dragCode}`);
    await keySearch.press("Enter");
    await draft.getByTestId("dict-draft-confirm").click();
    const pending = page.getByTestId("selectable-row-d1");
    await expect(pending).toBeVisible();
    const beforeDrag = await rowOrder(page);
    expect(beforeDrag.at(-1)).toBe("selectable-row-d1");

    // ── Drag above the previous saved row — a row inside the 990 tie
    //    block. The strict-rank pass must keep the pending ABOVE it
    //    (previously it tied at 990 and bounced below the block). ──
    await pending.scrollIntoViewIfNeeded();
    const prevTestid = beforeDrag[beforeDrag.length - 2];
    const prevRow = page.getByTestId(prevTestid);
    await pending.getByTestId("dict-row-drag").dragTo(prevRow, {
      targetPosition: { x: 8, y: 4 },
    });
    await expect
      .poll(async () => {
        const o = await rowOrder(page);
        return o.indexOf("selectable-row-d1") === o.indexOf(prevTestid) - 1;
      })
      .toBe(true);

    // ── Climb one more position — inside the tie block, not just over
    //    its edge. ──
    const mid = await rowOrder(page);
    const aboveTestid = mid[mid.indexOf("selectable-row-d1") - 1];
    await pending.getByTestId("dict-row-drag").dragTo(page.getByTestId(aboveTestid), {
      targetPosition: { x: 8, y: 4 },
    });
    await expect
      .poll(async () => {
        const o = await rowOrder(page);
        return o.indexOf("selectable-row-d1") === o.indexOf(aboveTestid) - 1;
      })
      .toBe(true);

    // ── Save → reload → the dragged order persisted exactly. ──
    await page.getByTestId("dict-bulk-save").click();
    await expect(pending).toHaveCount(0, { timeout: 15_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-testid^="selectable-row-"]').first()).toBeVisible({
      timeout: 30000,
    });
    const ourRow = page
      .locator('[data-testid^="selectable-row-"]')
      .filter({ has: page.locator(`[title="${dragCode}"]`) });
    const ourTestid = await ourRow.getAttribute("data-testid");
    expect(ourTestid).toBeTruthy();
    const reloadedOrder = await rowOrder(page);
    expect(reloadedOrder.indexOf(ourTestid!)).toBe(
      reloadedOrder.indexOf(aboveTestid) - 1,
    );
  });

  test("pager eye filters — modified-only + selected-only client views", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAsTestAdmin(page);
    await page.goto(DICT_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-testid^="selectable-row-"]').first()).toBeVisible();
    const allRows = await page.locator('[data-testid^="selectable-row-"]').count();
    expect(allRows).toBeGreaterThan(2);

    // ── Taint one saved row + confirm a pending → modified count = 2 ──
    const firstRow = page.locator('[data-testid^="selectable-row-"]').first();
    await firstRow.getByTestId("dict-cell-label-key").click();
    const keySearch = page.getByPlaceholder(/entities\.customer_type\.rows\./);
    await keySearch.fill(`custom.entities.customer_type.rows.${CODE}_ef`);
    await keySearch.press("Enter");
    await expect(firstRow.getByTestId("dict-row-revert")).toBeVisible();

    await page.getByTestId("dict-toolbar-add").click();
    const draft = page.getByTestId("dict-draft-row");
    await draft.locator('[data-dict-cell="code"] input').fill(`${CODE}_ef`);
    await draft.locator('[data-dict-cell="label_key"]').click();
    await keySearch.fill(`custom.entities.customer_type.rows.${CODE}_ef2`);
    await keySearch.press("Enter");
    await draft.getByTestId("dict-draft-confirm").click();
    await expect(page.getByTestId("selectable-row-d1")).toBeVisible();

    // ── Modified-only eye → exactly the 2 modified entries render;
    //    every untouched row is hidden — pure client filter. ──
    const modEye = page.getByTestId("dict-filter-modified");
    await expect(modEye).toBeVisible();
    await modEye.click();
    await expect(page.locator('[data-testid^="selectable-row-"]')).toHaveCount(2);
    await expect(page.getByTestId("selectable-row-d1")).toBeVisible();
    // The range label reports the filtered subset, not the server total.
    await expect(page.getByTestId("dict-range")).toContainText("/ 2");
    // Reorder affordances are gated off in the filtered view.
    await expect(page.getByTestId("dict-row-move-up")).toHaveCount(0);

    // ── Toggle off → the full chain is back. ──
    await modEye.click();
    await expect(page.locator('[data-testid^="selectable-row-"]')).toHaveCount(
      allRows + 1,
    );

    // ── ELT parity: selection eye — select 2 rows (1 saved + pending),
    //    filter shows exactly those. ──
    const secondRow = page.locator('[data-testid^="selectable-row-"]').nth(1);
    await firstRow.getByRole("checkbox").check();
    await page.getByTestId("selectable-row-d1").getByRole("checkbox").check();
    const selEye = page.getByTestId("dict-filter-selected");
    await expect(selEye).toBeVisible();
    await selEye.click();
    await expect(page.locator('[data-testid^="selectable-row-"]')).toHaveCount(2);
    await expect(page.getByTestId("dict-range")).toContainText("/ 2");
    // The tainted row still shows its revert affordance inside the
    // filtered subset — filters never strip row chrome.
    await expect(firstRow.getByTestId("dict-row-revert")).toBeVisible();
    await selEye.click();
    await expect(page.locator('[data-testid^="selectable-row-"]')).toHaveCount(
      allRows + 1,
    );
    await expect(secondRow).toBeVisible();
  });

  test("composer label_key offers the convention suggestion as first option", async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsTestAdmin(page);
    await page.goto(DICT_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-testid^="selectable-row-"]').first()).toBeVisible();

    await page.getByTestId("dict-toolbar-add").click();
    const draft = page.getByTestId("dict-draft-row");
    const searchInput = page.getByPlaceholder(/custom\.entities\.customer_type\.rows\./);
    const items = page.getByRole("option");

    // ── Config-create pattern, EMPTY code: placeholder/search show the
    // sample convention key, defaultSearch seeds the code-scoped prefix
    // and the Create row offers that same scoped path.
    await draft.locator('[data-dict-cell="label_key"]').click();
    await expect(searchInput).toHaveValue("entities.customer_type.rows.my_custom_code");
    await page.keyboard.press("Escape");

    // ── Code typed → defaultSearch = prefix INCLUDING the code segment.
    const probeCode = `${CODE}_sg`;
    await draft.locator('[data-dict-cell="code"] input').fill(probeCode);
    const expectedKey = `custom.entities.customer_type.rows.${probeCode}`;

    // The suggestion is the trigger placeholder while the value is empty.
    await expect(draft.getByTestId("dict-cell-label-key")).toContainText("rows.");

    await draft.locator('[data-dict-cell="label_key"]').click();
    await expect(items.first()).toBeVisible();
    await expect(searchInput).toHaveValue(`entities.customer_type.rows.${probeCode}`);
    // The suggestion option matches the scoped filter and stays first.
    await expect(items.first()).toContainText(`rows.${probeCode}`);

    // Selecting the suggestion commits the full custom.* key.
    await items.first().click();
    await expect(draft.getByTestId("dict-cell-label-key")).toContainText("rows.");
    await draft.getByTestId("dict-draft-confirm").click();
    await expect(page.getByTestId("dict-draft-row")).toHaveCount(0);
    const row = page.locator(`[data-testid^="selectable-row-"]`, { hasText: probeCode }).first();
    await expect(row).toContainText(expectedKey);
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
