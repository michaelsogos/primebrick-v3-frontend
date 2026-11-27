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
import { loginAsTestAdmin, E2E_USER_USERNAME } from "./helpers/admin-login";

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
  const body = (await res.text().then((t) => extJsonParse<unknown>(t))) as {
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
    const body = (await list.text().then((t) => extJsonParse<unknown>(t)).catch(() => null)) as {
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
  await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 5_000 });
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
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
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
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
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
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
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
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    expect(counts.restore).toBe(1);

    await cleanupTempRow(page, code);
  });
});

// ============================================================================
// ELT surfaces — the same construction guarantee on the standard
// EntityListTable (row dropdown menu + bulk toolbar). Fixture: an
// `email_template` row on the emailsender service (Deletable entity,
// two-field create).
// ============================================================================

const TPL_URL = "/system/emailsender/templates";
const TPL_API = "/svc/emailsender/api/v1/entities/email_template";

function watchTpl(page: Page) {
  const counts = { del: 0, bulkDelete: 0, restore: 0 };
  page.on("request", (req: Request) => {
    const url = req.url();
    if (!url.includes("/entities/email_template/")) return;
    if (req.method() === "DELETE") counts.del += 1;
    if (req.method() === "POST" && url.includes("/bulk-delete")) counts.bulkDelete += 1;
    if (req.method() === "POST" && url.includes("/restore")) counts.restore += 1;
  });
  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes("/entities/email_template/")) return;
    if (["DELETE", "POST"].includes(res.request().method())) {
      console.log(`[watch] ${res.request().method()} ${url} -> ${res.status()}`);
    }
  });
  return counts;
}

async function createTempTemplate(page: Page, code: string): Promise<{ uuid: string; version: number }> {
  const res = await page.request.post(TPL_API, {
    data: { entity: { code, language_iso: "en", subject: `E2E gate ${code}` } },
  });
  expect(res.ok(), `temp template create failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = (await res.text().then((t) => extJsonParse<unknown>(t))) as {
    uuid?: string;
    version?: number;
    entity?: { uuid?: string; version?: number };
  };
  const uuid = body.uuid ?? body.entity?.uuid;
  expect(uuid).toBeTruthy();
  return { uuid: uuid as string, version: body.version ?? body.entity?.version ?? 1 };
}

async function cleanupTempTemplate(page: Page, code: string): Promise<void> {
  const findIn = async (deleted: "ONLY" | "EXCLUDED") => {
    const list = await page.request
      .get(`${TPL_API}/list?deleted_records=${deleted}&page_size=50`)
      .catch(() => null);
    if (!list?.ok()) return undefined;
    const body = (await list.text().then((t) => extJsonParse<unknown>(t)).catch(() => null)) as {
      rows?: Array<{ uuid?: string; code?: string; version?: number }>;
      items?: Array<{ uuid?: string; code?: string; version?: number }>;
    } | null;
    return (body?.rows ?? body?.items ?? []).find((r) => r.code === code);
  };
  const gone = await findIn("ONLY");
  if (gone?.uuid) {
    await page.request
      .delete(`${TPL_API}/${gone.uuid}/purge`, { params: { version: String(gone.version ?? 0) } })
      .catch(() => undefined);
    return;
  }
  const live = await findIn("EXCLUDED");
  if (live?.uuid) {
    await page.request
      .delete(`${TPL_API}/${live.uuid}`, { params: { version: String(live.version ?? 0) } })
      .catch(() => undefined);
  }
}

/** ELT row carrying our temp code (table rows are `tr` elements). */
function tplRow(page: Page, code: string) {
  return page.locator("tr").filter({ hasText: code });
}

/** Row dropdown trigger — aria-label is `system.entities.list.row_actions`. */
function rowMenuTrigger(row: ReturnType<typeof tplRow>) {
  return row.getByRole("button", { name: /row actions|azioni riga/i });
}

async function gotoTemplates(page: Page) {
  await page.goto(TPL_URL, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("entity-search")).toBeVisible({ timeout: 5_000 });
}

async function searchTpl(page: Page, code: string) {
  await page.getByTestId("entity-search").locator("input").fill(code);
  await expect(tplRow(page, code)).toBeVisible({ timeout: 5_000 });
}

// ---- job_trigger fixture — the only service entity exposing the full
// op set (delete/restore/bulkDelete/bulkRestore) on a standard ELT page.
// `target_subject` is validated against census.callables → the real
// `emailsender.send` is used; with no schedule/event the trigger never
// arms, so no email can ever leave. ----

const TRIGGERS_URL = "/system/job/job_triggers";
const TRIGGERS_API = "/svc/job/api/v1/entities/job_trigger";

function watchTrigger(page: Page) {
  const counts = { del: 0, bulkDelete: 0, restore: 0 };
  page.on("request", (req: Request) => {
    const url = req.url();
    if (!url.includes("/entities/job_trigger/")) return;
    if (req.method() === "DELETE") counts.del += 1;
    if (req.method() === "POST" && url.includes("/bulk-delete")) counts.bulkDelete += 1;
    if (req.method() === "POST" && url.includes("/restore")) counts.restore += 1;
  });
  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes("/entities/job_trigger/")) return;
    if (["DELETE", "POST"].includes(res.request().method())) {
      console.log(`[watch] ${res.request().method()} ${url} -> ${res.status()}`);
    }
  });
  return counts;
}

async function createTempTrigger(page: Page, name: string): Promise<{ uuid: string; version: number }> {
  const res = await page.request.post(TRIGGERS_API, {
    data: {
      entity: {
        name,
        // A declared emit that cannot fire inside the E2E window —
        // subscribes to nothing that happens, sends nothing anywhere.
        event_subject: "events.crm.customer.on.high_value",
        target_subject: "emailsender.send",
        run_as: "author",
        // Required callable payload fields, const-bound — the trigger has
        // no schedule/event so it can never arm, let alone send.
        payload_map: {
          templateCode: { kind: "const", value: "e2e_probe" },
          languageIso: { kind: "const", value: "en" },
          to: { kind: "const", value: "e2e@example.invalid" },
        },
      },
    },
  });
  expect(res.ok(), `temp trigger create failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = (await res.text().then((t) => extJsonParse<unknown>(t))) as {
    uuid?: string;
    version?: number;
    entity?: { uuid?: string; version?: number };
  };
  const uuid = body.uuid ?? body.entity?.uuid;
  expect(uuid).toBeTruthy();
  return { uuid: uuid as string, version: body.version ?? body.entity?.version ?? 1 };
}

async function cleanupTempTrigger(page: Page, name: string): Promise<void> {
  const findIn = async (deleted: "ONLY" | "EXCLUDED") => {
    const list = await page.request
      .get(`${TRIGGERS_API}/list?deleted_records=${deleted}&page_size=50`)
      .catch(() => null);
    if (!list?.ok()) return undefined;
    const body = (await list.text().then((t) => extJsonParse<unknown>(t)).catch(() => null)) as {
      rows?: Array<{ uuid?: string; name?: string; version?: number }>;
      items?: Array<{ uuid?: string; name?: string; version?: number }>;
    } | null;
    return (body?.rows ?? body?.items ?? []).find((r) => r.name === name);
  };
  const gone = await findIn("ONLY");
  if (gone?.uuid) {
    await page.request
      .delete(`${TRIGGERS_API}/${gone.uuid}/purge`, { params: { version: String(gone.version ?? 0) } })
      .catch(() => undefined);
    return;
  }
  const live = await findIn("EXCLUDED");
  if (live?.uuid) {
    await page.request
      .delete(`${TRIGGERS_API}/${live.uuid}`, { params: { version: String(live.version ?? 0) } })
      .catch(() => undefined);
  }
}

async function gotoTriggers(page: Page) {
  await page.goto(TRIGGERS_URL, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("entity-search")).toBeVisible({ timeout: 5_000 });
}

async function searchTrigger(page: Page, name: string) {
  await page.getByTestId("entity-search").locator("input").fill(name);
  await expect(page.locator("tr").filter({ hasText: name })).toBeVisible({ timeout: 5_000 });
}

test.describe("entity-op confirm gate — ELT surfaces", () => {
  test.describe.configure({ mode: "serial" });

  test("ELT row delete — menu dialog intercepts; cancel = zero DELETE; confirm = one", async ({ page }) => {
    const code = tmpCode();
    await loginAsTestAdmin(page);
    await createTempTemplate(page, code);
    const counts = watchTpl(page);
    await gotoTemplates(page);
    await searchTpl(page, code);

    const target = tplRow(page, code);
    await rowMenuTrigger(target).click();
    await page.getByRole("menuitem", { name: /delete|elimin/i }).last().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /cancel|annulla/i }).click();
    await expect(dialog).not.toBeVisible();
    expect(counts.del).toBe(0);
    await expect(target).toBeVisible();

    await rowMenuTrigger(target).click();
    await page.getByRole("menuitem", { name: /delete|elimin/i }).last().click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /delete|elimin/i }).last().click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    expect(counts.del).toBe(1);
    await expect(tplRow(page, code)).not.toBeVisible();

    await cleanupTempTemplate(page, code);
  });

  test("ELT bulk delete — BulkDeleteDialog intercepts; cancel = zero; confirm = one POST", async ({ page }) => {
    const name = tmpCode();
    await loginAsTestAdmin(page);
    await createTempTrigger(page, name);
    const counts = watchTrigger(page);
    await gotoTriggers(page);
    await searchTrigger(page, name);

    const target = page.locator("tr").filter({ hasText: name });
    await target.getByRole("checkbox").click();
    const bulkDeleteCta = page.getByTestId("entity-bulk-delete");
    await expect(bulkDeleteCta).toBeVisible();
    await bulkDeleteCta.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /cancel|annulla/i }).click();
    await expect(dialog).not.toBeVisible();
    expect(counts.bulkDelete).toBe(0);

    if (await bulkDeleteCta.isDisabled()) {
      await target.getByRole("checkbox").click();
    }
    await bulkDeleteCta.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /disable|delete|disabilit|elimin/i }).last().click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    expect(counts.bulkDelete).toBe(1);
    await expect(page.locator("tr").filter({ hasText: name })).not.toBeVisible();

    await cleanupTempTrigger(page, name);
  });

  test("ELT row restore — RestoreDialog intercepts via menu; confirm = one POST", async ({ page }) => {
    const name = tmpCode();
    await loginAsTestAdmin(page);
    const row = await createTempTrigger(page, name);
    const del = await page.request.delete(`${TRIGGERS_API}/${row.uuid}`, {
      params: { version: String(row.version) },
    });
    expect(del.ok()).toBeTruthy();

    const counts = watchTrigger(page);
    await gotoTriggers(page);
    await page.getByTestId("entity-deletion-filter-deleted").click();
    await searchTrigger(page, name);

    const target = page.locator("tr").filter({ hasText: name });
    await rowMenuTrigger(target).click();
    await page.getByRole("menuitem", { name: /enable|restore|riattiv|ripristin/i }).last().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /cancel|annulla/i }).click();
    await expect(dialog).not.toBeVisible();
    expect(counts.restore).toBe(0);

    await rowMenuTrigger(target).click();
    await page.getByRole("menuitem", { name: /enable|restore|riattiv|ripristin/i }).last().click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /enable|restore|riattiv|ripristin/i }).last().click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    expect(counts.restore).toBe(1);

    await page.getByTestId("entity-deletion-filter-non_deleted").click();
    await searchTrigger(page, name);
    await cleanupTempTrigger(page, name);
  });
});

// ============================================================================
// Custom op `confirm_key` — user_profile suspend/reactivate ride the
// governed invoker because `actions_overrides` attaches confirm_key to
// the route-derived ops. Target: the ephemeral e2e_test_user actor —
// suspended via UI, reactivated via UI (full round trip).
// ============================================================================

const USERS_URL = "/system/settings/users";
const USERS_API = "/api/v1/entities/user_profile";

test.describe("entity-op confirm gate — custom op confirm_key", () => {
  test.describe.configure({ mode: "serial" });

  test("suspend/reactivate — confirm_key dialog gates the custom op both ways", async ({ page }) => {
    await loginAsTestAdmin(page);

    // Locate the ephemeral non-admin actor — suspending it exercises the
    // destructive-direction gate; reactivate covers the restore-twin.
    const username = E2E_USER_USERNAME;
    expect(username, "E2E_USER_USERNAME empty — globalSetup did not mint the actor").toBeTruthy();
    const list = await page.request.get(
      `${USERS_API}/list?filters[0][field]=idp_username&filters[0][op]=%3D&filters[0][value]=${encodeURIComponent(username)}&page_size=5`,
    );
    expect(list.ok(), `user_profile list failed: ${list.status()}`).toBeTruthy();
    const body = (await list.text().then((t) => extJsonParse<unknown>(t))) as {
      rows?: Array<{ uuid?: string; idp_username?: string; display_name?: string; suspended?: boolean | number | bigint }>;
      items?: Array<{ uuid?: string; idp_username?: string; display_name?: string; suspended?: boolean | number | bigint }>;
    };
    const actor = (body.rows ?? body.items ?? []).find((r) => r.idp_username === username);
    expect(actor?.uuid, `ephemeral actor ${username} not found in user_profile list`).toBeTruthy();

    const counts = { suspend: 0, reactivate: 0 };
    page.on("request", (req: Request) => {
      const url = req.url();
      if (req.method() === "POST" && url.includes("/suspend")) counts.suspend += 1;
      if (req.method() === "POST" && url.includes("/reactivate")) counts.reactivate += 1;
    });
    page.on("response", (res) => {
      const url = res.url();
      if (res.request().method() === "POST" && (url.includes("/suspend") || url.includes("/reactivate"))) {
        console.log(`[watch] POST ${url} -> ${res.status()}`);
      }
    });

    await page.goto(USERS_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-search")).toBeVisible({ timeout: 5_000 });
    await page.getByTestId("entity-search").locator("input").fill(username);
    const row = page.locator("tr").filter({ hasText: username });
    await expect(row).toBeVisible({ timeout: 5_000 });

    // ---- SUSPEND — cancel path: zero requests. ----
    await rowMenuTrigger(row).click();
    await page.getByRole("menuitem", { name: /suspend|sospendi/i }).last().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /cancel|annulla/i }).click();
    await expect(dialog).not.toBeVisible();
    expect(counts.suspend).toBe(0);

    // ---- SUSPEND — confirm path: exactly one POST /suspend. ----
    await rowMenuTrigger(row).click();
    await page.getByRole("menuitem", { name: /suspend|sospendi/i }).last().click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /suspend|sospendi/i }).last().click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    expect(counts.suspend).toBe(1);

    // ---- REACTIVATE — confirm path: exactly one POST /reactivate. ----
    await rowMenuTrigger(row).click();
    await page.getByRole("menuitem", { name: /reactivate|riattiv/i }).last().click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /reactivate|riattiv/i }).last().click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    expect(counts.reactivate).toBe(1);
  });
});
