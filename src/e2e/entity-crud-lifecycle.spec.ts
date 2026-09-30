/**
 * entity-crud-lifecycle — over-the-wire entity CRUD contract test.
 *
 * Runs against the live dev stack (FE :5173 → /api proxy → BE :3001) as the
 * ephemeral E2E admin actor minted by global.setup.ts. All writes target
 * ad-hoc resources created inside the test — never pre-existing rows:
 *
 *   - customer `E2E-{ts}` is created, read, updated, stale-version-rejected,
 *     soft-deleted, restored, and soft-deleted again (the leftover row is
 *     flagged-deleted — a soft-delete entity can only be removed softly).
 *   - role_mapping purge contract is verified WITHOUT creating a row: the
 *     soft DELETE route 404s for any uuid, the purge route is gated by an
 *     MFA step-up token (403, which runs before the handler's version
 *     check), and meta.actions
 *     advertises `purge.single`/`delete.single` correctly. This keeps the
 *     run residue-free — a real role could only be removed with TOTP.
 *
 * Also verifies the canonical QS filter format end-to-end (bracket notation
 * accepted, JSON-stringified `filters=` rejected with 400).
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";
import { getPool } from "./helpers/db";

const BASE = "/api/v1/entities";
const TS = Date.now();
const CUSTOMER_CODE = `E2E-${TS}`;
const E2E_MODEL_ID = `e2e/lifecycle-${TS}`;
const E2E_ASSISTANT_KEY = `e2e_${TS}`;

test.describe.configure({ mode: "serial" });

test.describe("entity CRUD over the wire", () => {
  let uuid = "";
  let version = 0;

  test("customer: full lifecycle on an ad-hoc row", async ({ page }) => {
    await loginAsTestAdmin(page);
    const api = page.request;

    // ── hygiene: soft-delete any leftover E2E-* customers from previous
    // runs (e.g. a run that crashed mid-lifecycle). Only rows whose code
    // matches the E2E- prefix — never real data. ──────────────────────────
    const leftoversRes = await api.get(
      `${BASE}/customer/list?filters[0][field]=code&filters[0][op]=startsWith&filters[0][value]=E2E-`,
    );
    if (leftoversRes.ok()) {
      const leftovers = ((await leftoversRes.json()).rows ?? []) as Array<{ uuid: string; version: number }>;
      for (const row of leftovers) {
        await api.delete(`${BASE}/customer/${row.uuid}?version=${row.version}`);
      }
    }

    // ── create → 201 + entity (version present) ──────────────────────────
    const createRes = await api.post(`${BASE}/customer`, {
      data: { entity: { code: CUSTOMER_CODE, first_name: "E2E Lifecycle", status: "ACTIVE" } },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    expect(created.uuid).toBeTruthy();
    expect(created.code).toBe(CUSTOMER_CODE);
    expect(created.success).toBeUndefined(); // entity, not wrapper
    uuid = created.uuid;
    version = created.version;

    // ── get → 200 entity ─────────────────────────────────────────────────
    const getRes = await api.get(`${BASE}/customer/${uuid}`);
    expect(getRes.status()).toBe(200);

    // ── list with canonical QS bracket filters finds the row ────────────
    const listRes = await api.get(
      `${BASE}/customer/list?filters[0][field]=code&filters[0][op]==&filters[0][value]=${CUSTOMER_CODE}`,
    );
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    const rows = listBody.rows ?? listBody.data ?? [];
    expect(rows.some((r: { uuid: string }) => r.uuid === uuid)).toBe(true);

    // ── JSON-stringified filters are rejected (wire format removed) ──────
    const jsonRes = await api.get(
      `${BASE}/customer/list?filters=${encodeURIComponent('[{"field":"code","op":"=","value":"x"}]')}`,
    );
    expect(jsonRes.status()).toBe(400);

    // ── update → 200 entity, version bumped ──────────────────────────────
    const putRes = await api.put(`${BASE}/customer/${uuid}`, {
      data: { entity: { first_name: "E2E Lifecycle Updated", version } },
    });
    expect(putRes.status()).toBe(200);
    const updated = await putRes.json();
    expect(updated.version).toBeGreaterThan(version);
    version = updated.version;

    // ── duplicate → 200 + new uuid; audit marks the clone CLONE (E.8) ────
    const dupRes = await api.post(`${BASE}/customer/duplicate`, {
      data: { uuids: [uuid] },
    });
    expect(dupRes.status()).toBe(200);
    const dupBody = await dupRes.json();
    const cloneUuid: string = dupBody.uuids?.[0];
    expect(cloneUuid).toBeTruthy();
    expect(cloneUuid).not.toBe(uuid);
    const cloneAudit = await api.get(`${BASE}/customer/${cloneUuid}/audit?page=1&limit=10`);
    expect(cloneAudit.status()).toBe(200);
    const cloneAuditBody = await cloneAudit.json();
    const cloneActions = (cloneAuditBody.rows ?? cloneAuditBody.data ?? []).map(
      (r: { action: string }) => r.action,
    );
    expect(cloneActions).toContain("CLONE");
    // remove the clone residue (fresh row → version 1)
    const cloneGet = await api.get(`${BASE}/customer/${cloneUuid}`);
    const cloneVersion = (await cloneGet.json()).version ?? 1;
    await api.delete(`${BASE}/customer/${cloneUuid}?version=${cloneVersion}`);

    // ── delete without version → 400 VERSION_REQUIRED ────────────────────
    const noVer = await api.delete(`${BASE}/customer/${uuid}`);
    expect(noVer.status()).toBe(400);
    const noVerBody = await noVer.json();
    expect(noVerBody.internal_code).toBe("VERSION_REQUIRED");

    // ── delete with STALE version → concurrency error ────────────────────
    const stale = await api.delete(`${BASE}/customer/${uuid}?version=1`);
    expect([400, 409]).toContain(stale.status());

    // ── soft delete with the observed version → 200 entity ───────────────
    const del = await api.delete(`${BASE}/customer/${uuid}?version=${version}`);
    expect(del.status()).toBe(200);
    version = (await del.json()).version ?? version + 1;

    // ── restore → 200 entity ─────────────────────────────────────────────
    const restore = await api.post(`${BASE}/customer/${uuid}/restore?version=${version}`);
    expect(restore.status()).toBe(200);
    version = (await restore.json()).version ?? version + 1;

    // ── purge is NOT a customer capability → DELETE /:uuid/purge 404 ─────
    const purge404 = await api.delete(`${BASE}/customer/${uuid}/purge?version=${version}`);
    expect(purge404.status()).toBe(404);

    // ── final soft delete — residue is a flagged-deleted ad-hoc row ──────
    const finalDel = await api.delete(`${BASE}/customer/${uuid}?version=${version}`);
    expect(finalDel.status()).toBe(200);
  });

  test("customer meta.actions: delete.single enabled, purge.single disabled", async ({ page }) => {
    await loginAsTestAdmin(page);
    const res = await page.request.get(`${BASE}/customer/meta`);
    expect(res.status()).toBe(200);
    const meta = await res.json();
    const byOp = Object.fromEntries(meta.actions.map((a: { op: string }) => [a.op, a]));
    expect(byOp["delete.single"].enabled).toBe(true);
    expect(byOp["purge.single"].enabled).toBe(false);
    expect(byOp["restore.single"].enabled).toBe(true);
    expect(byOp["duplicate.bulk"].enabled).toBe(true); // E.8: customer opted IN
  });

  test("role_mapping: hard-delete contract without touching any row", async ({ page }) => {
    await loginAsTestAdmin(page);
    const api = page.request;
    const rand = crypto.randomUUID();

    // soft DELETE route does not exist → 404 for any uuid
    const soft = await api.delete(`${BASE}/role_mapping/${rand}?version=1`);
    expect(soft.status()).toBe(404);

    // purge (with or without ?version) → MFA step-up gate runs BEFORE the
    // handler body, so the wire contract is 403 + mfa_step_up_required.
    // (VERSION_REQUIRED itself is proven by the customer delete test above.)
    const mfaNoVer = await api.delete(`${BASE}/role_mapping/${rand}/purge`);
    expect(mfaNoVer.status()).toBe(403);
    const mfa = await api.delete(`${BASE}/role_mapping/${rand}/purge?version=1`);
    expect(mfa.status()).toBe(403);
    const mfaBody = await mfa.json();
    expect(mfaBody.extra?.mfa_step_up_required ?? mfaBody.mfa_step_up_required).toBe(true);

    // meta advertises purge.single enabled, delete.single/restore.single off,
    // duplicate.bulk off (E.8 opt-out)
    const metaRes = await api.get(`${BASE}/role_mapping/meta`);
    expect(metaRes.status()).toBe(200);
    const meta = await metaRes.json();
    const byOp = Object.fromEntries(meta.actions.map((a: { op: string }) => [a.op, a]));
    expect(byOp["purge.single"].enabled).toBe(true);
    expect(byOp["delete.single"].enabled).toBe(false);
    expect(byOp["restore.single"].enabled).toBe(false);
    expect(byOp["duplicate.bulk"].enabled).toBe(false);

    // E.9 — list delegated to the generic service: read-only check that the
    // wire contract still works (200 + rows array). Hard-delete entity: no
    // deleted_at predicate, no deleter join — a regression would 500 here.
    const list = await api.get(`${BASE}/role_mapping/list?page=1&page_size=5`);
    expect(list.status()).toBe(200);
    const listBody = await list.json();
    expect(Array.isArray(listBody.rows)).toBe(true);
    for (const row of listBody.rows) {
      expect(row).toHaveProperty("uuid");
      expect(row).toHaveProperty("idp_role");
    }
  });

  test("customer export: meta-derived pipeline over the wire (E.7)", async ({ page }) => {
    await loginAsTestAdmin(page);
    const api = page.request;

    // CSV export — meta-derived columns/labels, same filter builder as list.
    const res = await api.get(`${BASE}/customer/export?file_type=csv`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(res.headers()["content-disposition"]).toMatch(/attachment; filename="customer-export-.*\.csv"/);
    const csv = await res.text();
    // the template ships 3 column cells (uuid/code/first_name) — the header
    // row is the line whose labels come from `system.entities.customer.fields.*`
    // via the translations service.
    const headerLine = csv.split("\n").find((l) => l.includes("UUID"));
    expect(headerLine).toBeTruthy();
    expect(headerLine!.split(",")).toHaveLength(3);

    // filters propagate into the export stream (same builder as list)
    const filtered = await api.get(
      `${BASE}/customer/export?file_type=csv&filters[0][field]=code&filters[0][op]==&filters[0][value]=__no_such_code__`,
    );
    expect(filtered.status()).toBe(200);
    const filteredCsv = await filtered.text();
    // preamble + header only — no data row matches the impossible filter
    for (const line of filteredCsv.trim().split("\n")) {
      expect(line).not.toContain("__no_such_code__");
    }
  });

  test("organization: read-only list — user_count via GROUP BY aggregate (E.3a)", async ({ page }) => {
    await loginAsTestAdmin(page);
    const api = page.request;

    // READ-ONLY by design: org writes sync Casdoor (external IdP), so the
    // lifecycle test intentionally does NOT create/update/delete orgs.
    // What we verify over the wire is the grouped aggregate query: the list
    // must answer 200 with a numeric user_count per row — a broken GROUP BY
    // (e.g. unprojected join column) would 500 here.
    const res = await api.get(`${BASE}/organization/list?page=1&page_size=25`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.page).toBe("number");
    expect(typeof body.total === "number" || typeof body.total === "string").toBe(true);
    for (const row of body.rows) {
      expect(row).toHaveProperty("uuid");
      expect(row).toHaveProperty("idp_code");
      expect(typeof row.user_count).toBe("number");
      expect(row.user_count).toBeGreaterThanOrEqual(0);
    }
  });

  test("ai_model + ai_cerebellum: lifecycle on ad-hoc rows (E.10)", async ({ page }) => {
    await loginAsTestAdmin(page);
    const api = page.request;
    const pool = getPool();

    // ── hygiene: drop leftovers from crashed runs (unique E2E prefixes) ──
    await pool.query(`DELETE FROM ai_cerebellum WHERE assistant_key = $1`, [E2E_ASSISTANT_KEY]);
    await pool.query(`DELETE FROM ai_models WHERE model_id = $1`, [E2E_MODEL_ID]);

    // ── ai_model create → 201 + entity (power_level derived from
    // working_set_mb by beforeCreate hook) ────────────────────────────────
    const modelRes = await api.post(`${BASE}/ai_model`, {
      data: {
        entity: {
          model_id: E2E_MODEL_ID,
          name: `E2E Model ${TS}`,
          engine_type: "onnx",
          dtype: "q4f16",
          working_set_mb: 2500,
        },
      },
    });
    expect(modelRes.status()).toBe(201);
    const model = await modelRes.json();
    expect(model.uuid).toBeTruthy();
    expect(model.model_id).toBe(E2E_MODEL_ID);
    expect(model.power_level).toBeGreaterThanOrEqual(1);
    let modelVersion = model.version;

    // ── ai_model update → version bump ──────────────────────────────────
    const modelPut = await api.put(`${BASE}/ai_model/${model.uuid}`, {
      data: { entity: { name: `E2E Model ${TS} v2`, version: modelVersion } },
    });
    expect(modelPut.status()).toBe(200);
    modelVersion = (await modelPut.json()).version;

    // ── ai_cerebellum create → bound to the model just created ──────────
    const cereRes = await api.post(`${BASE}/ai_cerebellum`, {
      data: {
        entity: {
          assistant_key: E2E_ASSISTANT_KEY,
          model_id: E2E_MODEL_ID,
          name: "default",
          temperature: 0.5,
        },
      },
    });
    expect(cereRes.status()).toBe(201);
    const cere = await cereRes.json();
    expect(cere.uuid).toBeTruthy();

    // ── cerebellum name-uniqueness guard: same name for same pair → 4xx ─
    const dupName = await api.post(`${BASE}/ai_cerebellum`, {
      data: {
        entity: {
          assistant_key: E2E_ASSISTANT_KEY,
          model_id: E2E_MODEL_ID,
          name: "default",
        },
      },
    });
    expect([400, 409, 422]).toContain(dupName.status());

    // ── audit endpoint works on the delegated generic service ───────────
    // (writeAudit is fire-and-forget — poll briefly until the row lands)
    let auditActions: string[] = [];
    for (let i = 0; i < 10; i++) {
      const auditRes = await api.get(`${BASE}/ai_model/${model.uuid}/audit?page=1&limit=10`);
      expect(auditRes.status()).toBe(200);
      const body = await auditRes.json();
      auditActions = ((body.data ?? body.rows ?? []) as Array<{ action: string }>).map(
        (r) => r.action,
      );
      if (auditActions.length > 0) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    expect(auditActions).toContain("INSERT");

    // ── duplicate is OFF for both entities (E.8 opt-out) → route 404 ────
    const dupModel = await api.post(`${BASE}/ai_model/duplicate`, { data: { uuids: [model.uuid] } });
    expect(dupModel.status()).toBe(404);
    const dupCere = await api.post(`${BASE}/ai_cerebellum/duplicate`, { data: { uuids: [cere.uuid] } });
    expect(dupCere.status()).toBe(404);

    // ── delete is MFA step-up gated → 403 without a TOTP token ──────────
    const delNoMfa = await api.delete(`${BASE}/ai_model/${model.uuid}?version=${modelVersion}`);
    expect(delNoMfa.status()).toBe(403);

    // ── cleanup: hard-delete the ad-hoc rows + their audit residue ──────
    // (API delete needs a TOTP step-up token the ephemeral actor lacks;
    //  direct SQL mirrors what the dal purge path would do.)
    await pool.query(`DELETE FROM ai_cerebellum_audit WHERE entity_uuid = $1`, [cere.uuid]);
    await pool.query(`DELETE FROM ai_cerebellum WHERE uuid = $1`, [cere.uuid]);
    await pool.query(`DELETE FROM ai_models_audit WHERE entity_uuid = $1`, [model.uuid]);
    await pool.query(`DELETE FROM ai_models WHERE uuid = $1`, [model.uuid]);
  });
});
