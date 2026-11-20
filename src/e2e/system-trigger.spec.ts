/**
 * system-trigger — permanent regression for the module-declared trigger
 * contract, live against the AI partition-maintenance system trigger:
 *
 *   - the materialized row anchors on `system_key` and projects
 *     `is_system` (calculated — the ONE system flag, never a second truth)
 *   - its schedule mirror is trigger-owned (`trigger_uuid` NOT NULL) —
 *     the engine is the only materialization path
 *   - code-owned contract fields (event/target/run_as/payload_map/
 *     system_key) reject user edits with `system_trigger_immutable`
 *   - user-owned fields (name, schedule_spec) edit normally
 *   - users cannot claim system rows via the entity API (POST with
 *     system_key → 400)
 *
 * Read/write go through the canonical entity API (the SAME path the form
 * rides); DB reads verify the mirror state directly.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";
import { getPool } from "./helpers/db";

import { extJsonStringify, extJsonParse } from '@primebrick/core/ext-json';
const JOB_API = "/svc/job/api/v1";
const SYS_KEY = "ai.partition_maintenance";

test.describe("system trigger — ai.partition_maintenance", () => {
  test.describe.configure({ mode: "serial" });

  test("materialized row, trigger-owned mirror, frozen contract, user-owned edits", async ({ page }) => {
    await loginAsTestAdmin(page);
    const pool = getPool();

    // ── S0: the materialized system row exists, once, anchored on system_key
    const t = await pool.query(
      `SELECT uuid, name, system_key, target_subject, run_as, event_subject, schedule_spec,
              (system_key IS NOT NULL) AS is_system
       FROM job.job_triggers WHERE system_key = $1 AND deleted_at IS NULL`,
      [SYS_KEY],
    );
    expect(t.rows).toHaveLength(1);
    const trig = t.rows[0] as {
      uuid: string; name: string; target_subject: string; run_as: string;
      event_subject: string | null; schedule_spec: string; is_system: boolean;
    };
    expect(trig.is_system).toBe(true);
    expect(trig.target_subject).toBe("ai.partition_maintenance");
    expect(trig.run_as).toBe("system");
    expect(trig.event_subject).toBeNull();

    // ── S1: the mirror is trigger-owned (no kind, no orphans)
    const s = await pool.query(
      `SELECT schedule_subject, status, trigger_uuid FROM job.job_schedules WHERE trigger_uuid = $1`,
      [trig.uuid],
    );
    expect(s.rows.length).toBeGreaterThanOrEqual(1);
    const armed = s.rows.find((r: { status: string }) => r.status === "armed") as
      | { schedule_subject: string }
      | undefined;
    expect(armed).toBeDefined();
    expect(armed!.schedule_subject).toBe(`jobs.schedule.job.${trig.uuid}`);

    // ── S2: the served row projects is_system + system_key
    const get = await page.request.get(`${JOB_API}/entities/job_trigger/${trig.uuid}`);
    expect(get.ok()).toBeTruthy();
    const served = (await get.text().then((t) => extJsonParse<any>(t))) as Record<string, unknown>;
    expect(served.is_system).toBe(true);
    expect(served.system_key).toBe(SYS_KEY);
    const version = served.version as number;

    // ── S3: code-owned contract is frozen — target_subject edit → 400
    const frozen = await page.request.put(`${JOB_API}/entities/job_trigger/${trig.uuid}`, {
      data: { entity: { target_subject: "emailsender.send", version } },
    });
    expect(frozen.status()).toBe(400);
    expect(extJsonStringify(await frozen.text().then((t) => extJsonParse<any>(t)))).toContain("system_trigger_immutable");

    // system_key may never be shed or swapped — the field is `immutable`,
    // a stronger guarantee than the system-trigger rule (it fires first).
    const shed = await page.request.put(`${JOB_API}/entities/job_trigger/${trig.uuid}`, {
      data: { entity: { system_key: null, version } },
    });
    expect(shed.status()).toBe(400);
    expect(extJsonStringify(await shed.text().then((t) => extJsonParse<any>(t)))).toContain("immutable");

    // users cannot claim system rows — POST carrying system_key → 400
    const claim = await page.request.post(`${JOB_API}/entities/job_trigger`, {
      data: {
        entity: {
          name: `e2e-sys-claim-${Date.now()}`,
          system_key: "e2e.claim",
          target_subject: "emailsender.send",
          run_as: "author",
          schedule_spec: "@every 1h",
        },
      },
    });
    expect(claim.status()).toBe(400);
    expect(extJsonStringify(await claim.text().then((t) => extJsonParse<any>(t)))).toContain("immutable");

    // ── S4: user-owned fields edit — rename round-trips via the same API
    const renamed = "ai-partition-maintenance-e2e";
    const put = await page.request.put(`${JOB_API}/entities/job_trigger/${trig.uuid}`, {
      data: { entity: { name: renamed, version } },
    });
    expect(put.status(), extJsonStringify(await put.text().then((t) => extJsonParse<any>(t)).catch(() => null))).toBe(200);
    const cur = await page.request.get(`${JOB_API}/entities/job_trigger/${trig.uuid}`);
    const after = (await cur.text().then((t) => extJsonParse<any>(t))) as { name: string; version: number };
    expect(after.name).toBe(renamed);
    const back = await page.request.put(`${JOB_API}/entities/job_trigger/${trig.uuid}`, {
      data: { entity: { name: trig.name, version: after.version } },
    });
    expect(back.ok()).toBeTruthy();
  });
});
