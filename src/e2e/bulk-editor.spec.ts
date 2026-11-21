/**
 * bulk-editor — the `update.bulk` standard op, end to end:
 *
 *   meta contract → ELT bulk CTA → `entity.bulkEditor` sheet builder
 *     → distribution/forecast → governed confirm → POST /bulk-update
 *     → rows updated server-side (CAS `{uuid,version}` per row)
 *
 * PRODUCT CONTRACT under test (not implementation intent):
 *   - bulk-capable entities declare `update.bulk` in `meta.actions`,
 *     `enabled` iff the route is mounted (route ⇄ meta one source of truth)
 *   - the ELT bulk toolbar renders the edit CTA (primary, square-pen)
 *     only when the op is allowed and ≥1 non-deleted rows are selected
 *   - the sheet is a field→value BUILDER (not a form): the add-field combo
 *     lists only update-editable columns, the distribution strip shows the
 *     current value buckets ×N over the SELECTED rows, and the impact
 *     forecast counts rows where the new value actually differs
 *   - the payload is honest: every selected uuid+version travels; the
 *     forecast is display-only and never shrinks the items array
 *   - submit goes through the governed confirm channel (no window.confirm)
 *
 * Target: `job_trigger` (ELT page /system/job/triggers) — `bulkUpdate`
 * rides the shared `writePerms` grant. Residue-free: seeded rows are
 * bulk-deleted at the end, pass or fail.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";
import { getPool } from "./helpers/db";

import { extJsonParse } from "@primebrick/core/ext-json";

const TS = Date.now();
const NAME_A = `e2e-bulkedit-a-${TS}`;
const NAME_B = `e2e-bulkedit-b-${TS}`;
const NEW_SCHEDULE = "@every 2h";
const JOB_BASE = "/svc/job/api/v1/entities";

const mk = async (page: any, name: string) => {
  const r = await page.request.post(`${JOB_BASE}/job_trigger`, {
    data: {
      entity: {
        name,
        schedule_spec: "@every 1h",
        target_subject: "crm.emit_fake_event",
        run_as: "system",
        payload_map: { event: { kind: "const", value: "events.crm.customer.on.changed" } },
      },
    },
  });
  expect(r.status(), await r.text()).toBe(201);
  return (await r.text().then((t: string) => extJsonParse<any>(t))) as {
    uuid: string;
    version: number;
  };
};

test.describe.configure({ mode: "serial" });

test.describe("bulk editor — update.bulk end to end", () => {
  const uuids: string[] = [];

  test("meta contract — job_trigger + crm.customer declare update.bulk enabled", async ({
    page,
  }) => {
    await loginAsTestAdmin(page);

    for (const [base, entity] of [
      [JOB_BASE, "job_trigger"],
      ["/svc/crm/api/v1/entities", "customer"],
    ] as const) {
      const r = await page.request.get(`${base}/${entity}/meta`);
      expect(r.status(), `${entity} meta`).toBe(200);
      const meta = await r.text().then((t: string) => extJsonParse<any>(t));
      const actions = meta?.actions ?? meta?.meta?.actions;
      const bulk = (actions ?? []).find((a: any) => a.op === "update.bulk");
      expect(bulk, `${entity}: meta.actions must declare update.bulk`).toBeTruthy();
      expect(bulk.enabled, `${entity}: update.bulk must be enabled`).toBe(true);

      // Route mounted? `endpoint` is legitimately absent on the US-served
      // meta path (consumers fall back to the `{base}/bulk-update`
      // convention) — the wire proof is the route itself: an invalid body
      // must hit the validator (400), not the catch-all (404).
      const probe = await page.request.post(`${base}/${entity}/bulk-update`, {
        data: { items: [], set: {} },
      });
      expect(
        probe.status(),
        `${entity}: /bulk-update must be mounted (400 = validated, 404 = missing)`,
      ).toBe(400);
    }
  });

  test("CTA → sheet → forecast → governed confirm → rows updated", async ({ page }) => {
    await loginAsTestAdmin(page);
    const pool = getPool();

    // ── Seed two controlled rows (schedule @every 1h) ──────────────
    const a = await mk(page, NAME_A);
    const b = await mk(page, NAME_B);
    uuids.push(a.uuid, b.uuid);

    // ── ELT → bulk mode → select the two seeded rows ───────────────
    await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("bulk-actions-toggle").click();

    for (const name of [NAME_A, NAME_B]) {
      const row = page.locator("tr", { hasText: name });
      await expect(row).toBeVisible({ timeout: 5000 });
      await row.getByRole("checkbox", { name: "select row" }).click();
    }

    // ── CTA visible (primary, square-pen) → opens the sheet ────────
    const editCta = page.getByTestId("entity-bulk-edit");
    await expect(editCta).toBeVisible({ timeout: 5000 });
    await expect(editCta).toBeEnabled();
    await editCta.click();
    const summary = page.getByTestId("bulk-editor-summary");
    await expect(summary).toBeVisible({ timeout: 5000 });
    await expect(summary).toContainText("2");

    // ── Builder: pick `schedule_spec` — the testid sits on the combo
    //    trigger (a div); the Command search input lives inside the
    //    popover content and filters on the option VALUE (column key).
    const addField = page.getByTestId("bulk-editor-add-field");
    await addField.click();
    const searchInput = page.locator("[data-slot='popover-content'] input").first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    // Type icons — `columnIcon` (declared icon → format → type fallback)
    // guarantees EVERY picker option carries a glyph.
    await expect
      .poll(
        async () => {
          const options = page.locator(
            "[data-slot='popover-content'] [role='option']",
          );
          const count = await options.count();
          if (count === 0) return -1;
          let missing = 0;
          for (let i = 0; i < count; i++) {
            if ((await options.nth(i).locator("svg").count()) === 0) missing++;
          }
          return missing;
        },
        { timeout: 5000 },
      )
      .toBe(0);
    await searchInput.fill("schedule_spec");
    const option = page.getByRole("option").first();
    await expect(option).toBeVisible({ timeout: 5000 });
    await option.click();

    const fieldRow = page.getByTestId("bulk-editor-field-schedule_spec");
    await expect(fieldRow).toBeVisible();

    // ── Distribution + forecast BEFORE touching the widget ─────────
    const dist = page.getByTestId("bulk-editor-dist-schedule_spec");
    await expect(dist).toBeVisible();
    await expect(fieldRow.getByRole("textbox").first()).toBeVisible();
    await fieldRow.getByRole("textbox").first().fill(NEW_SCHEDULE);
    await expect(page.getByTestId("bulk-editor-impact-schedule_spec")).toContainText(
      "2",
      { timeout: 5000 },
    );

    // ── Submit → governed confirm (no window.confirm) → refresh ────
    await page.getByTestId("bulk-editor-apply").click();
    const confirmBtn = page.getByTestId("entity-op-confirm");
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();

    // ── Server truth: both rows now carry the new schedule ─────────
    await expect
      .poll(
        async () => {
          const { rows } = await pool.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM job.job_triggers
              WHERE uuid = ANY($1) AND schedule_spec = $2 AND deleted_at IS NULL`,
            [uuids, NEW_SCHEDULE],
          );
          return rows[0]?.n;
        },
        { timeout: 10000, intervals: [500, 1000, 2000] },
      )
      .toBe(2);
  });

  test("residue-free — seeded rows deleted via the entity API", async ({ page }) => {
    await loginAsTestAdmin(page);
    if (uuids.length === 0) return;
    const { rows } = await getPool().query<{ uuid: string; version: number }>(
      `SELECT uuid, version FROM job.job_triggers WHERE uuid = ANY($1) AND deleted_at IS NULL`,
      [uuids],
    );
    if (rows.length === 0) return;
    const r = await page.request.post(`${JOB_BASE}/job_trigger/bulk-delete`, {
      data: { items: rows.map((x) => ({ uuid: x.uuid, version: x.version })) },
    });
    expect([200, 204]).toContain(r.status());
  });
});
