/**
 * sequences — the builtin `sequence` registry, mounted BY CONSTRUCTION:
 *
 *   makeServiceRoutes auto-mounts the dal-provided builtin decl on every
 *   module — no module-authored entity, service, meta, dto or route
 *
 * PRODUCT CONTRACT under test:
 *   - `/entities/sequence/meta` + `/list` serve on a module that authored
 *     NOTHING for them (crm has no sequence decl — the mount is the
 *     framework's)
 *   - the registry is governed CRUD: create → get → list → update →
 *     delete, schema-validated (pattern grammar gate, step ≠0, IANA tz)
 *   - `entities_ns` is the module's own schema (crm) — derived, never
 *     authored
 *   - counters are NOT routed — `sequence_counter` has no surface
 *
 * Residue-free: created rows are deleted at the end, pass or fail.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";
import { extJsonParse } from "@primebrick/core/ext-json";

const CRM_BASE = "/svc/crm/api/v1/entities";
const CODE = `e2e_seq_${Date.now()}`;

test.describe("builtin sequence registry — mounted by construction", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("meta + list serve without a module-authored decl", async ({ page }) => {
    const r = await page.request.get(`${CRM_BASE}/sequence/meta`);
    expect(r.status()).toBe(200);
    const meta = extJsonParse<any>(await r.text());
    expect(meta.entity).toBe("sequence");
    expect(meta.entities_ns).toBe("crm"); // derived — never authored
    const keys = (meta.columns ?? []).map((c: any) => c.key);
    for (const k of ["code", "pattern", "step", "start", "tz", "label_key", "description_key"]) {
      expect(keys, `column ${k}`).toContain(k);
    }

    const lr = await page.request.get(`${CRM_BASE}/sequence/list`);
    expect(lr.status()).toBe(200);
  });

  test("counters are machine state — no routed surface", async ({ page }) => {
    const r = await page.request.get(`${CRM_BASE}/sequence_counter/meta`);
    expect([400, 404]).toContain(r.status());
  });

  test("governed CRUD + validation gates", async ({ page }) => {
    // grammar gate — unparseable pattern must fail
    const bad = await page.request.post(`${CRM_BASE}/sequence`, {
      data: { entity: { code: CODE, pattern: "X-{n:3}-{n:3}", step: "1", start: "1" } },
    });
    expect(bad.status()).toBeGreaterThanOrEqual(400);

    const cr = await page.request.post(`${CRM_BASE}/sequence`, {
      data: {
        entity: {
          code: CODE,
          pattern: `E2E-{seq:5}`,
          step: "1",
          start: "1",
          tz: "Europe/Rome",
          label_key: "crm.entities.sequence.rows.e2e",
        },
      },
    });
    expect([200, 201], `create: ${await cr.text()}`).toContain(cr.status());
    const created = extJsonParse<any>(await cr.text());
    const uuid = created?.entity?.uuid ?? created?.uuid;
    expect(uuid).toBeTruthy();

    try {
      const get = await page.request.get(`${CRM_BASE}/sequence/${uuid}`);
      expect(get.status()).toBe(200);
      const row = extJsonParse<any>(await get.text());
      expect(row.entity?.code ?? row.code).toBe(CODE);
      expect(String(row.entity?.step ?? row.step)).toMatch(/^1n?$/);

      // step=0 must fail
      const upd = await page.request.put(`${CRM_BASE}/sequence/${uuid}`, {
        data: { entity: { version: String(row.entity?.version ?? row.version), step: "0" } },
      });
      expect(upd.status()).toBeGreaterThanOrEqual(400);

      const list = await page.request.get(`${CRM_BASE}/sequence/list?search=${CODE}`);
      expect(list.status()).toBe(200);
      expect(await list.text()).toContain(CODE);
    } finally {
      const row = extJsonParse<any>(await (await page.request.get(`${CRM_BASE}/sequence/${uuid}`)).text());
      const version = String(row.entity?.version ?? row.version);
      await page.request.delete(`${CRM_BASE}/sequence/${uuid}`, { data: { version } });
    }
  });

  test("seq-bound column: bulk editor mounts SequenceInput — select + generate write", async ({
    page,
  }) => {
    test.setTimeout(60000);
    /* `customers.code` is @SequenceField-bound: `format:"sequence"` must
     * resolve the dedicated widget (readonly literal display + assist
     * popover), and the value crossing the wire is a DIRECTIVE — never a
     * literal. `update.bulk` rides the same governed confirm as every op.
     * Residue-free: the two ad-hoc customers are soft-deleted in finally. */
    const runId = `E2E SeqWidget ${Date.now()}`;
    const mk = async (name: string) => {
      const res = await page.request.post(`${CRM_BASE}/customer`, {
        data: { entity: { display_name: name, status: "ACTIVE" } },
      });
      expect(res.status()).toBe(201);
      const row = extJsonParse<any>(await res.text());
      expect(String(row.code)).toMatch(/^CUST-\d{5}$/);
      return row;
    };
    const a = await mk(`${runId} A`);
    const b = await mk(`${runId} B`);
    try {
      await page.goto("/crm/customers", { waitUntil: "domcontentloaded" });
      await expect(page.locator("table")).toBeVisible({ timeout: 15000 });
      await page.getByTestId("bulk-actions-toggle").click();
      for (const name of [`${runId} A`, `${runId} B`]) {
        const row = page.locator("tr", { hasText: name });
        await expect(row).toBeVisible({ timeout: 15000 });
        await row.getByRole("checkbox", { name: "select row" }).click();
      }
      await page.getByTestId("entity-bulk-edit").click();
      await expect(page.getByTestId("bulk-editor-summary")).toBeVisible();

      await page.getByTestId("bulk-editor-add-field").click();
      const searchInput = page.locator("[data-slot='popover-content'] input").first();
      await searchInput.fill("code");
      await page.getByRole("option", { name: /^code$/i }).first().click();
      const field = page.getByTestId("bulk-editor-field-code");
      const widget = field.getByTestId("sequence-input");
      await expect(widget).toBeVisible({ timeout: 5000 });
      // bulk on rows with different codes is a mixed surface — the served
      // literals never leak into the directive slot: it stays empty.
      await expect(field.locator("input").first()).toHaveValue("");

      // ── select mode — combobox over the module-local registry ──
      await field.getByTestId("sequence-input-assist").click();
      await page.getByTestId("sequence-input-mode-select").click();
      const combo = page.getByTestId("sequence-input-select");
      await expect(combo).toBeVisible({ timeout: 5000 });
      await combo.click();
      const opt = page
        .locator("[data-state='open'] [role='option']:visible")
        .filter({ hasText: "customers.code" })
        .first();
      await expect(opt).toBeVisible({ timeout: 10000 });
      await opt.click();
      await page.getByTestId("sequence-input-apply").click();
      await expect(field.locator("input").first()).toHaveValue("customers.code");
      // forecast strip — read-only `next` rendered from the registry row
      await expect(page.getByTestId("sequence-input-next")).toHaveText(/^CUST-\d{5}$/, {
        timeout: 10000,
      });

      // ── generate mode — inline pattern directive ──
      await field.getByTestId("sequence-input-assist").click();
      await page.getByTestId("sequence-input-mode-generate").click();
      await page.getByTestId("sequence-input-pattern").fill("E2E-{seq:4}");
      await page.getByTestId("sequence-input-start").fill("9001");
      await page.getByTestId("sequence-input-apply").click();
      await expect(field.locator("input").first()).toHaveValue("E2E-9001");

      await page.getByTestId("bulk-editor-apply").click();
      const confirmBtn = page.getByTestId("entity-op-confirm");
      await expect(confirmBtn).toBeVisible({ timeout: 5000 });
      await confirmBtn.click();

      // Server truth — both rows carry the SAME expr-sequence allocation:
      // {pattern} directives materialize a shared expr registry row, so the
      // two bulk claims are CONTIGUOUS on one counter. The counter persists
      // across runs — assert the contract (shape + adjacency), not the seed.
      let codes: string[] = [];
      await expect
        .poll(
          async () => {
            const ra = extJsonParse<any>(
              await (await page.request.get(`${CRM_BASE}/customer/${a.uuid}`)).text(),
            );
            const rb = extJsonParse<any>(
              await (await page.request.get(`${CRM_BASE}/customer/${b.uuid}`)).text(),
            );
            codes = [String(ra.code), String(rb.code)].sort();
            return codes.every((c) => /^E2E-\d{4}$/.test(c) && parseInt(c.slice(4), 10) >= 9001);
          },
          { timeout: 15000 },
        )
        .toBe(true);
      const nums = codes.map((c) => parseInt(c.slice(4), 10));
      expect(nums[1]! - nums[0]!).toBe(1);
    } finally {
      for (const row of [a, b]) {
        const fresh = extJsonParse<any>(
          await (await page.request.get(`${CRM_BASE}/customer/${row.uuid}`)).text(),
        );
        await page.request.delete(
          `${CRM_BASE}/customer/${row.uuid}?version=${fresh.version}`,
        );
      }
    }
  });

  test("settings list page renders — EntityTablePage archetype, sequence_set CTA wired", async ({
    page,
  }) => {
    // is_reserved platform rows (api gateway) own no dict — the shell/ELT
    // must never request one. Intercept and count: any fetch is a bug.
    let apiFetches = 0;
    await page.route("**/system/translations/api/*", (r) => {
      apiFetches++;
      return r.continue();
    });
    // The list surface comes up — the builtin list endpoint answers.
    // Attach the waiter BEFORE navigating: goto fires the fetch.
    const listReq = page.waitForResponse(
      (r) => r.url().includes("/entities/sequence/list") && r.status() === 200,
      { timeout: 15_000 },
    );
    await page.goto("/crm/settings/sequences");
    await listReq;
    // The leaf label must resolve via the parent crm dict — never the raw key
    await expect(page.locator("body")).not.toContainText("crm.settings.nav.sequences", {
      timeout: 15_000,
    });
    // kind:"list" → the EntityTablePage archetype: a real table with the
    // PoC registry row, not the settings-dictionary anatomy.
    await expect(page.locator("table")).toBeVisible({ timeout: 30_000 });
    const row = page.locator("table tbody tr", { hasText: "customers.code" }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    // The entity_op synthesis lands the `sequence_set` CTA on the row kebab —
    // the governed set-counter surface exists by construction.
    const kebab = row.locator("td").last().getByRole("button").first();
    await kebab.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const cta = menu.getByText("Set counter");
    await expect(cta).toBeVisible();

    // `sequence_set` is parametric — the authored dialog collects `next`,
    // informed by `sequence-analyze` (the strip mounts live stats).
    await cta.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const analysis = dialog.getByTestId("sequence-set-analysis");
    await expect(analysis).toContainText("Values in use", { timeout: 15000 });
    // `next` prefills from suggested_start — operator can override.
    const nextInput = dialog.getByTestId("sequence-set-next");
    await expect(nextInput).not.toHaveValue("", { timeout: 10000 });

    // Submit rides the governed chain — the meta-served confirm gate opens
    // (confirm_key → the generic gated-op DeleteDialog anatomy), cancelled
    // here: the MFA step-up + counter write paths are covered by the
    // dal/service suites.
    await dialog.getByTestId("sequence-set-submit").click();
    const confirmDialog = page.getByRole("dialog").last();
    await expect(confirmDialog.getByRole("button", { name: "Cancel" })).toBeVisible({
      timeout: 10000,
    });
    await confirmDialog.getByRole("button", { name: "Cancel" }).click();
    // The input dialog survives a cancelled confirm — close it too.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10000 });
    expect(apiFetches).toBe(0);
  });
});
