/**
 * entity-op confirm gate — the `runEntityOp` construction guarantee on
 * the dict archetype: every delete/restore surface shows the confirm
 * dialog BEFORE the request, cancel issues ZERO requests, confirm issues
 * exactly one. The incident this fixes: `EntityDictPage.deleteRow` once
 * fired `apiFetch(DELETE)` raw — a user deleted a `customer_link_type`
 * row with no dialog at all.
 *
 * Real lifecycle on a throwaway row (create → UI delete → UI restore →
 * API purge): no mocks — request counts are the empirical assertion.
 *
 * Surfaces covered (this slice = dict; ELT converge is a follow-up):
 *   dict row delete · dict bulk delete · dict row restore · dict bulk restore
 */
import { test, expect, type Page, type Request } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

import { extJsonParse } from '@primebrick/core/ext-json';
const DICT_URL = "/crm/settings/customer_link_types";
const API = "/svc/crm/api/v1/entities/customer_link_type";
let seq = 0;
const tmpCode = () => `e2e_gate_${Date.now().toString(36)}_${seq++}`;
const tmpLabel = (code: string) => `crm.entities.customer_link_type.rows.${code}`;

/** Request counters for the entity under test. */
function watchEntity(page: Page) {
  const counts = { del: 0, bulkDelete: 0, restore: 0 };
  page.on("request", (req: Request) => {
    const url = req.url();
    if (!url.includes("/entities/customer_link_type/")) return;
    if (req.method() === "DELETE") counts.del += 1;
    if (req.method() === "POST" && url.includes("/bulk-delete")) counts.bulkDelete += 1;
    if (req.method() === "POST" && url.includes("/restore")) counts.restore += 1;
  });
  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes("/entities/customer_link_type/")) return;
    if (["DELETE", "POST"].includes(res.request().method())) {
      console.log(`[watch] ${res.request().method()} ${url} -> ${res.status()}`);
    }
  });
  return counts;
}

async function createTempRow(page: Page, code: string): Promise<{ uuid: string; version: number }> {
  const res = await page.request.post(API, {
    data: {
      entity: {
        code,
        label_key: tmpLabel(code),
        inverse_label_key: `${tmpLabel(code)}.inverse`,
        sort: 990,
      },
    },
  });
  expect(res.ok(), `temp row create failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = (await res.text().then((t) => extJsonParse<any>(t))) as {
    uuid?: string;
    version?: number;
    entity?: { uuid?: string; version?: number };
  };
  const uuid = body.uuid ?? body.entity?.uuid;
  expect(uuid).toBeTruthy();
  return { uuid: uuid as string, version: body.version ?? body.entity?.version ?? 1 };
}

/** Best-effort cleanup — purge hard-deletes where the entity registers
 *  the route (soft-delete-only entities like `customer_link_type` have
 *  no purge permission → the call is a tolerated 404); a live leftover
 *  (restore tests end with the row alive) is re-soft-deleted so it
 *  leaves the visible list. Versions come from the list responses,
 *  never guessed. */
async function cleanupTempRow(page: Page, code: string): Promise<void> {
  const findIn = async (deleted: "ONLY" | "EXCLUDED") => {
    const list = await page.request
      .get(`${API}/list?deleted_records=${deleted}&page_size=50`)
      .catch(() => null);
    if (!list?.ok()) return undefined;
    const body = (await list.text().then((t) => extJsonParse<any>(t)).catch(() => null)) as {
      rows?: Array<{ uuid?: string; code?: string; version?: number }>;
      items?: Array<{ uuid?: string; code?: string; version?: number }>;
    } | null;
    return (body?.rows ?? body?.items ?? []).find((r) => r.code === code);
  };
  const gone = await findIn("ONLY");
  if (gone?.uuid) {
    await page.request
      .delete(`${API}/${gone.uuid}/purge`, { params: { version: String(gone.version ?? 0) } })
      .catch(() => undefined);
    return;
  }
  const live = await findIn("EXCLUDED");
  if (live?.uuid) {
    await page.request
      .delete(`${API}/${live.uuid}`, { params: { version: String(live.version ?? 0) } })
      .catch(() => undefined);
  }
}

/** The row whose title carries our temp code. */
function tempRow(page: Page, code: string) {
  return page
    .getByTestId("entity-dict-page")
    .locator("[data-testid^='selectable-row-']")
    .filter({ hasText: code });
}

async function gotoDict(page: Page) {
  await page.goto(DICT_URL, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 30000 });
}

test.describe("entity-op confirm gate — dict surfaces", () => {
  test.describe.configure({ mode: "serial" });

  test("row delete — dialog intercepts; cancel = zero DELETE; confirm = one", async ({ page }) => {
    const code = tmpCode();
    await loginAsTestAdmin(page);
    await createTempRow(page, code);
    const counts = watchEntity(page);
    await gotoDict(page);

    const target = tempRow(page, code);
    await expect(target).toBeVisible();
    await target.getByTestId("dict-row-delete").click();

    // THE GATE — the dialog must appear before any request leaves.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Cancel → zero requests, dialog closes, row untouched.
    await dialog.getByRole("button", { name: /cancel|annulla/i }).click();
    await expect(dialog).not.toBeVisible();
    expect(counts.del).toBe(0);
    await expect(target).toBeVisible();

    // Confirm → exactly one DELETE request.
    await target.getByTestId("dict-row-delete").click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /delete|elimin/i }).last().click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
    expect(counts.del).toBe(1);
    await expect(tempRow(page, code)).not.toBeVisible();

    await cleanupTempRow(page, code);
  });

  test("bulk delete — BulkDeleteDialog intercepts; cancel = zero; confirm = one POST", async ({ page }) => {
    const code = tmpCode();
    await loginAsTestAdmin(page);
    await createTempRow(page, code);
    const counts = watchEntity(page);
    await gotoDict(page);

    const target = tempRow(page, code);
    await expect(target).toBeVisible();
    await target.getByRole("checkbox").click();
    const bulkDeleteCta = page.getByTestId("entity-bulk-delete");
    await expect(bulkDeleteCta).toBeVisible();
    await bulkDeleteCta.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /cancel|annulla/i }).click();
    await expect(dialog).not.toBeVisible();
    expect(counts.bulkDelete).toBe(0);
    await expect(target).toBeVisible();

    // Cancel keeps the selection — re-check only if it was cleared.
    if (await bulkDeleteCta.isDisabled()) {
      await target.getByRole("checkbox").click();
    }
    await bulkDeleteCta.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /delete|elimin/i }).last().click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
    expect(counts.bulkDelete).toBe(1);
    await expect(tempRow(page, code)).not.toBeVisible();

    await cleanupTempRow(page, code);
  });

  test("row restore — RestoreDialog (warning twin) intercepts; cancel = zero; confirm = one", async ({ page }) => {
    const code = tmpCode();
    await loginAsTestAdmin(page);
    const row = await createTempRow(page, code);
    // Pre-delete the temp row via API — the restore surface needs a
    // soft-deleted record in the `deleted` view.
    const del = await page.request.delete(`${API}/${row.uuid}`, {
      params: { version: String(row.version) },
    });
    expect(del.ok()).toBeTruthy();

    const counts = watchEntity(page);
    await gotoDict(page);
    await page.getByTestId("dict-deletion-filter-deleted").click();

    const target = tempRow(page, code);
    await expect(target).toBeVisible();
    await target.getByTestId("dict-row-restore").click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /cancel|annulla/i }).click();
    await expect(dialog).not.toBeVisible();
    expect(counts.restore).toBe(0);

    await target.getByTestId("dict-row-restore").click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /restore|ripristin/i }).last().click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
    expect(counts.restore).toBe(1);

    // Back in the live view the row is alive again — real restore landed.
    await page.getByTestId("dict-deletion-filter-non_deleted").click();
    await expect(tempRow(page, code)).toBeVisible();
    await cleanupTempRow(page, code);
  });

  test("bulk restore — BulkRestoreDialog intercepts; cancel = zero; confirm = per-row restores", async ({ page }) => {
    const code = tmpCode();
    await loginAsTestAdmin(page);
    const row = await createTempRow(page, code);
    const del = await page.request.delete(`${API}/${row.uuid}`, {
      params: { version: String(row.version) },
    });
    expect(del.ok()).toBeTruthy();

    const counts = watchEntity(page);
    await gotoDict(page);
    await page.getByTestId("dict-deletion-filter-deleted").click();

    const target = tempRow(page, code);
    await expect(target).toBeVisible();
    await target.getByRole("checkbox").click();
    const bulkRestoreCta = page.getByTestId("entity-bulk-restore");
    await expect(bulkRestoreCta).toBeVisible();
    await bulkRestoreCta.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /cancel|annulla/i }).click();
    await expect(dialog).not.toBeVisible();
    expect(counts.restore).toBe(0);

    if (await bulkRestoreCta.isDisabled()) {
      await target.getByRole("checkbox").click();
    }
    await bulkRestoreCta.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /restore|ripristin/i }).last().click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
    expect(counts.restore).toBe(1);

    await cleanupTempRow(page, code);
  });
});
