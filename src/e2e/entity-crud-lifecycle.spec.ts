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

const BASE = "/api/v1/entities";
const TS = Date.now();
const CUSTOMER_CODE = `E2E-${TS}`;

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

    // meta advertises purge.single enabled, delete.single/restore.single off
    const metaRes = await api.get(`${BASE}/role_mapping/meta`);
    expect(metaRes.status()).toBe(200);
    const meta = await metaRes.json();
    const byOp = Object.fromEntries(meta.actions.map((a: { op: string }) => [a.op, a]));
    expect(byOp["purge.single"].enabled).toBe(true);
    expect(byOp["delete.single"].enabled).toBe(false);
    expect(byOp["restore.single"].enabled).toBe(false);
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
});
