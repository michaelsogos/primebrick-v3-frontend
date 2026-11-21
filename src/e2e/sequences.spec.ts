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

  test("settings dict page renders — label resolved, api dict never fetched", async ({ page }) => {
    // is_reserved platform rows (api gateway) own no dict — the shell/ELT
    // must never request one. Intercept and count: any fetch is a bug.
    let apiFetches = 0;
    await page.route("**/system/translations/api/*", (r) => {
      apiFetches++;
      return r.continue();
    });
    // Dict table surface comes up — the builtin list endpoint answers.
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
    expect(apiFetches).toBe(0);
  });
});
