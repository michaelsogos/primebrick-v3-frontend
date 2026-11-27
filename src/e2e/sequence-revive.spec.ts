/**
 * sequence-revive — the generation lifecycle, live end to end:
 *
 *   expire → successor clone (sezionale incremented via derivePeriodLabel,
 *   name re-based as `<base>#<slot>`, counter namespaced by the NEW uuid
 *   so it restarts at `start`) → grace-window coexistence (the retired
 *   generation still serves pinned directives until `switch_at`) →
 *   physical switch (soft-delete, history stays queryable) →
 *   pinned-uuid honesty (`SequenceNotFound`, never a silent cross-uuid
 *   follow — Q6).
 *
 * The trigger under test is the REAL coordination chain: an `@at`
 * one-shot trigger armed on `crm.sequence_revive` rides the full JH
 * pipeline — arm → JetStream schedule → due → forwarder (service-secret
 * headers, the Layer-2 the callable enforces) → the SAME callable the
 * system job fires — so a `succeeded` row lands in `job.job_runs` as
 * first-class governance evidence, not a test-side shortcut.
 * `expire_at`/`switch_at` are derived anchors (never write keys), so the
 * due state is staged by SQL backdate on the fixture rows the spec owns.
 *
 * Serial + residue-free: created sequences/customers are deleted at the
 * end, pass or fail.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";
import { drainNats, extJsonParse, extJsonStringify } from "./helpers/nats";
import { declareTrigger, deleteTrigger, waitForRuns } from "./helpers/job-chain";
import { getPool } from "./helpers/db";

const CRM = "/svc/crm/api/v1/entities";
const RUN = Date.now().toString(36);
const NAME = `e2e-rev-${RUN}`;

type SeqRow = Record<string, unknown> & { uuid: string; version?: number };

/** Poll the table until `pred` holds — the callable is fire-and-forget
 *  (pub/sub work item), so the effect IS the observable reply. */
async function waitRow(uuid: string, pred: (r: Record<string, unknown> | null) => boolean, timeoutMs = 15_000): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await getPool().query(
      `SELECT uuid, name, sez, binding_key, expire_at, switch_at, default_from,
              revived_from, revived_at, revived_by, deleted_at
         FROM crm.sequences WHERE uuid = $1`,
      [uuid],
    );
    const row = (res.rows[0] ?? null) as Record<string, unknown> | null;
    if (pred(row)) return row!;
    if (Date.now() > deadline) throw new Error(`row ${uuid} never satisfied predicate — last: ${extJsonStringify(row)}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function waitSuccessor(fromUuid: string, timeoutMs = 15_000): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await getPool().query(
      `SELECT uuid, name, sez, binding_key, expire_at, switch_at, default_from,
              revived_from, revived_at, revived_by, deleted_at
         FROM crm.sequences WHERE revived_from = $1 AND deleted_at IS NULL`,
      [fromUuid],
    );
    if (res.rows[0]) return res.rows[0] as Record<string, unknown>;
    if (Date.now() > deadline) throw new Error(`no successor for ${fromUuid} appeared`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const createdSeqs: string[] = [];
const createdCustomers: string[] = [];
const createdTriggers: string[] = [];

/** Arm a one-shot trigger on the revive callable — the full JH chain
 *  (schedule → due → forwarder) fires it ~2-4s after materialize. */
async function fireRevive(
  page: import("@playwright/test").Page,
  tag: string,
): Promise<{ uuid: string; schedule_subject: string }> {
  const at = new Date(Date.now() + 2_000).toISOString();
  const t = await declareTrigger(page.request, {
    name: `e2e-rev-fire-${tag}-${RUN}`,
    schedule_spec: `@at ${at}`,
    target_subject: "crm.sequence_revive",
    run_as: "system",
  });
  createdTriggers.push(t.uuid);
  return t;
}

async function seqGet(page: import("@playwright/test").Page, uuid: string): Promise<SeqRow> {
  const r = await page.request.get(`${CRM}/sequence/${uuid}`);
  expect(r.status(), await r.text()).toBe(200);
  const row = extJsonParse<{ entity?: SeqRow } & SeqRow>(await r.text());
  return (row.entity ?? row) as SeqRow;
}

async function seqDelete(page: import("@playwright/test").Page, uuid: string): Promise<void> {
  const row = await seqGet(page, uuid).catch(() => null);
  if (!row || row.deleted_at) return;
  await page.request
    .delete(`${CRM}/sequence/${uuid}?version=${row.version}`)
    .catch((e) => console.warn(`[revive] seq delete ${uuid}: ${String(e)}`));
}

async function createCustomer(
  page: import("@playwright/test").Page,
  seqUuid: string,
  tag: string,
): Promise<{ status: number; body: string; parsed?: Record<string, unknown> }> {
  const w = await page.request.post(`${CRM}/customer`, {
    data: {
      entity: {
        code: { seq: { uuid: seqUuid } },
        display_name: `E2E Revive ${tag} ${RUN}`,
        status: "ACTIVE",
      },
    },
  });
  const body = await w.text();
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = extJsonParse<Record<string, unknown>>(body);
  } catch {
    /* error envelopes are plain text/problem+json */
  }
  const uuid = (parsed?.entity as Record<string, unknown> | undefined)?.uuid ?? parsed?.uuid;
  if (w.status() === 201 && typeof uuid === "string") createdCustomers.push(uuid);
  return { status: w.status(), body, parsed };
}

test.describe("sequence-revive — generation lifecycle", () => {
  test.afterAll(async ({ browser }) => {
    const p = await browser.newPage();
    await loginAsTestAdmin(p).catch(() => {});
    for (const u of createdCustomers.splice(0)) {
      const row = await p.request.get(`${CRM}/customer/${u}`).catch(() => null);
      const version = row?.ok() ? Number(extJsonParse<{ version?: number }>(await row.text()).version ?? 0) : 0;
      await p.request.delete(`${CRM}/customer/${u}?version=${version}`).catch(() => {});
    }
    for (const u of createdSeqs.splice(0)) await seqDelete(p, u);
    for (const u of createdTriggers.splice(0)) {
      await deleteTrigger(p.request, u).catch(() => {});
    }
    await drainNats().catch(() => {});
    await p.close().catch(() => {});
  });

  test("expire → successor → grace → switch → pinned honesty", async ({ page }) => {
    await loginAsTestAdmin(page);

    // ── 1. A reviving generation — `1 day` cadence on slot `sez` ──────
    const cr = await page.request.post(`${CRM}/sequence`, {
      data: {
        entity: {
          name: NAME,
          // Run-suffixed literal — codes stay unique across runs even
          // against soft-deleted residue (the `code` unique includes
          // them). 20-char column budget: R + 4-char suffix + 3-digit
          // counter + 10-char sez.
          pattern: `R${RUN.slice(-4)}{seq:3}-{sez}`,
          step: "1",
          start: "1",
          tz: "UTC",
          sez: "2026-01-15",
          revive_every: "1 day",
          revive_slot: "sez",
          revive_grace: "2 days",
        },
      },
    });
    expect([200, 201], `create: ${await cr.text()}`).toContain(cr.status());
    const created = extJsonParse<{ entity?: SeqRow } & SeqRow>(await cr.text());
    const gen1 = (created.entity ?? created) as SeqRow;
    createdSeqs.push(gen1.uuid);
    expect(gen1.expire_at).toBeTruthy();
    expect(gen1.switch_at).toBeTruthy();
    // Anchors derived at create — day-aligned expire, +2d switch.
    const exp1 = new Date(gen1.expire_at as string).getTime();
    expect(new Date(gen1.switch_at as string).getTime() - exp1).toBe(2 * 86_400_000);
    expect(gen1.revive_every).toBe("1 day");

    // The TRUE immutables are still rejected at the wire — the slot choice
    // is generation identity (edit-in-tempo ratified 2026-11-27 covers the
    // AXES only; sez*/revive_slot/default_from stay frozen post-create).
    const mut = await page.request.put(`${CRM}/sequence/${gen1.uuid}`, {
      // extJsonParse returns bigint for int8 leaves — coerce at the wire.
      data: { entity: { version: Number(gen1.version), revive_slot: "sez2" } },
    });
    expect(mut.status(), await mut.text()).toBeGreaterThanOrEqual(400);

    // ── 2. Make the generation due — backdate its expire anchor ──────
    await getPool().query(
      `UPDATE crm.sequences SET expire_at = now() - interval '1 minute' WHERE uuid = $1`,
      [gen1.uuid],
    );
    const backdated = await seqGet(page, gen1.uuid);
    const expireBoundary = new Date(backdated.expire_at as string).getTime();

    // ── 3. Fire through the REAL JH chain — @at one-shot → forwarder →
    //    the same callable the 04:15 system schedule dispatches. ──────
    const fire1 = await fireRevive(page, "a");
    const gen2 = await waitSuccessor(gen1.uuid, 30_000);
    expect(gen2.name).toBe(`${NAME}#2026-01-16`);
    createdSeqs.push(String(gen2.uuid));
    // Governance evidence — the forwarder's dispatch lands a `succeeded`
    // run in job.job_runs (the JH lane, not a test-side shortcut).
    const runs1 = await waitForRuns(fire1.schedule_subject, 1, (r) => r.some((x) => x.status === "succeeded"), 30_000);
    expect(runs1.some((x) => x.status === "succeeded")).toBeTruthy();

    // ── 4. The successor is a real generation ────────────────────────
    expect(gen2.sez).toBe("2026-01-16"); // derivePeriodLabel day increment
    expect(gen2.revived_by).toBe("system");
    // default_from = the predecessor's expire boundary — the at-aware
    // series resolution keys on it.
    expect(new Date(gen2.default_from as string).getTime()).toBe(expireBoundary);
    // Its own expire re-anchors to the next calendar boundary (day-aligned
    // UTC midnight after the predecessor's expire — never +24h from an
    // arbitrary anchor).
    const nextMidnight = Math.floor(expireBoundary / 86_400_000) * 86_400_000 + 86_400_000;
    expect(new Date(gen2.expire_at as string).getTime()).toBe(nextMidnight);
    // Grace window open — the predecessor is NOT switched yet.
    const gen1Live = await seqGet(page, gen1.uuid);
    expect(gen1Live.deleted_at ?? null).toBeNull();

    // ── 5. Grace — the retired generation still serves pinned calls ──
    const grace = await createCustomer(page, gen1.uuid, "grace");
    expect(grace.status, grace.body).toBe(201);
    expect(String(grace.parsed?.code ?? (grace.parsed?.entity as Record<string, unknown>)?.code)).toBe(`R${RUN.slice(-4)}001-2026-01-15`);

    // ── 6. Switch — force-retire the window, sweep via the same job ──
    await getPool().query(
      `UPDATE crm.sequences SET switch_at = now() - interval '1 minute' WHERE uuid = $1`,
      [gen1.uuid],
    );
    await fireRevive(page, "b");
    const dead = await waitRow(gen1.uuid, (r) => r?.deleted_at != null, 30_000);
    expect(dead.deleted_at).toBeTruthy();

    // ── 7. Honesty — the pinned dead uuid errors, never follows ──────
    const stale = await createCustomer(page, gen1.uuid, "stale");
    expect(stale.status).toBeGreaterThanOrEqual(400);
    expect(stale.body).toMatch(/SequenceNotFound|SEQUENCE_NOT_FOUND/);

    // ── 8. New generation, virgin counter — sezionale rolled ─────────
    const next = await createCustomer(page, String(gen2.uuid), "next");
    expect(next.status, next.body).toBe(201);
    expect(String(next.parsed?.code ?? (next.parsed?.entity as Record<string, unknown>)?.code)).toBe(`R${RUN.slice(-4)}001-2026-01-16`);
  });

  // Contract B — ratified by the user 2026-11-27: the revive AXES
  // (`revive_every`/`revive_grace`) are editable while in tempo. The
  // guarded write re-anchors the persisted moments at NOW under FOR
  // UPDATE serialization vs the sweep; unchanged axes skip the guard so
  // ordinary edits never disturb the schedule. The truly immutable
  // identity fields (sez*/revive_slot/default_from) stay wire-rejected.
  test("revive axes editable while in tempo — re-anchor matrix", async ({ page }) => {
    await loginAsTestAdmin(page);

    const cr = await page.request.post(`${CRM}/sequence`, {
      data: {
        entity: {
          name: `e2e-axes-${RUN}`,
          pattern: `A${RUN.slice(-4)}{seq:3}-{sez}`,
          step: "1",
          start: "1",
          tz: "UTC",
          sez: "2026-01-15",
          revive_every: "1 day",
          revive_slot: "sez",
          revive_grace: "2 days",
        },
      },
    });
    expect([200, 201], `create: ${await cr.text()}`).toContain(cr.status());
    const row0 = extJsonParse<{ entity?: SeqRow } & SeqRow>(await cr.text());
    let row = (row0.entity ?? row0) as SeqRow;
    createdSeqs.push(row.uuid);

    const put = async (entity: Record<string, unknown>) => {
      const res = await page.request.put(`${CRM}/sequence/${row.uuid}`, {
        data: { entity: { version: Number(row.version), ...entity } },
      });
      const text = await res.text();
      if (res.ok()) {
        const parsed = extJsonParse<{ entity?: SeqRow } & SeqRow>(text);
        row = (parsed.entity ?? parsed) as SeqRow;
      }
      return { status: res.status(), text };
    };

    // ── 1. Cadence edit accepted — anchors re-derived at NOW ─────────
    const before = { expire: row.expire_at as string, switch: row.switch_at as string };
    const edit = await put({ revive_every: "1 month" });
    expect(edit.status, edit.text).toBe(200);
    // PROBE — persistence truth independent of the response envelope.
    const fresh = await page.request.get(`${CRM}/sequence/${row.uuid}`);
    const freshRow = extJsonParse<SeqRow>(await fresh.text());
    console.log("PROBE resp:", row.revive_every, "| fresh:", freshRow.revive_every, "| freshExpire:", freshRow.expire_at);
    expect(row.revive_every).toBe("1 month");
    // UTC row — the month boundary is day-01 00:00:00Z, strictly future.
    const expIso = row.expire_at as string;
    expect(expIso).toMatch(/^\d{4}-\d{2}-01T00:00:00/);
    expect(new Date(expIso).getTime()).toBeGreaterThan(Date.now());
    // The grace survives the cadence edit — switch = expire + 2 days.
    const expMs = new Date(expIso).getTime();
    expect(new Date(row.switch_at as string).getTime() - expMs).toBe(2 * 86_400_000);
    expect(expIso).not.toBe(before.expire);

    // ── 2. Unchanged axes — a name edit leaves anchors bit-identical ─
    const anchored = { expire: row.expire_at as string, switch: row.switch_at as string };
    const noop = await put({ name: `e2e-axes-${RUN}-renamed`, revive_every: row.revive_every, revive_grace: row.revive_grace });
    expect(noop.status, noop.text).toBe(200);
    expect(row.expire_at).toBe(anchored.expire);
    expect(row.switch_at).toBe(anchored.switch);

    // ── 3. Grace-only edit — switch recomputes, expire untouched ─────
    const grace = await put({ revive_grace: "3 days" });
    expect(grace.status, grace.text).toBe(200);
    expect(row.expire_at).toBe(anchored.expire);
    expect(new Date(row.switch_at as string).getTime() - new Date(anchored.expire).getTime()).toBe(3 * 86_400_000);

    // ── 4. Revive off — NULL clears the anchors ──────────────────────
    const off = await put({ revive_every: null });
    expect(off.status, off.text).toBe(200);
    expect(row.revive_every ?? null).toBeNull();
    expect(row.expire_at ?? null).toBeNull();
    expect(row.switch_at ?? null).toBeNull();

    // ── 5. A past `at` pin is a validation error — never dies on arrival
    const past = await page.request.put(`${CRM}/sequence/${row.uuid}`, {
      data: { entity: { version: Number(row.version), revive_every: "at 2020-01-01T00:00:00Z" } },
    });
    expect(past.status(), await past.text()).toBeGreaterThanOrEqual(400);
  });
});
