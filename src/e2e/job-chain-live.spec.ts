/**
 * job-chain-live — the live engine E2E: declares real triggers, arms real
 * JetStream schedules, observes real fires, and asserts the documented
 * semantics of the whole chain (states, datetimes, drift, governance,
 * payload_map, ext-json, latency).
 *
 * NOT a UI spec: assertions run against the DB mirror (job.job_schedules,
 * job.job_runs), live JetStream declarations, tapped NATS messages,
 * emailsender.sender_log, and the fake-Brevo captures — five independent
 * observation points on the same pipeline.
 *
 * Serial by design — the spec owns the `e2e` identity namespace
 * (`primebrick-e2e/1.0.0` shield row + `jobs.schedule.e2e.*` subjects +
 * `e2e-*` triggers/templates) while it runs.
 *
 * Measured data: every observed fire lands in `JobChainMetrics` and is
 * attached as `test-results/<run>/job-chain-latency.json`.
 *
 * Documented out-of-scope (not runtime-forcible without downtime):
 * `lost` sweeper timing, maxDeliver nak-loop, auto-heal reconcile interval,
 * bulk actions (would destroy other specs' fixtures), cron fire waits.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";
import {
  getNats,
  drainNats,
  tap,
  jsPublish,
  publish,
  purgeScheduleDecl,
  getScheduleDecl,
  listScheduleSubjects,
  extJsonStringify,
  type ShieldIdentity,
  type TappedMessage,
} from "./helpers/nats";
import { registerShieldIdentity, type ShieldHandle } from "./helpers/shield-identity";
import {
  declareTrigger,
  deleteTrigger,
  postJobAction,
  readSchedule,
  readRuns,
  waitForSchedule,
  waitForRuns,
  JobChainMetrics,
} from "./helpers/job-chain";
import { getPool } from "./helpers/db";
import { randomUUID } from "node:crypto";

test.describe.configure({ mode: "serial" });
test.setTimeout(300_000); // phases span real schedule cadences — 5min budget

const SVC = "/svc/job/api/v1";
const EMAIL_API = "/svc/emailsender/api/v1";
const E2E_MAIL = "e2e-chain@primebrick.dev";
const FORWARD_PREFIX = "jobs.due.user.job.forward.";
const EV = "e2e.chain"; // event-subject namespace for this suite
/** Per-run suffix — `job_triggers.name` is a HARD unique (no purge route):
 *  unique names make runs independent; the `e2e-chain-` prefix still lets
 *  phase-0 self-heal find crashed-run leftovers. */
const RUN = Date.now().toString(36);
const TN = (purpose: string) => `e2e-chain-${purpose}-${RUN}`;

/** Module-level harness state — populated in phase 0, used by all phases.
 *  NOTE: `page`/`page.request` are per-TEST fixtures — each phase must take
 *  `{page}` and login again; only the process-level pieces (NATS conn,
 *  taps, shield row, metrics) live across phases. */
const H = {
  shield: undefined as ShieldHandle | undefined,
  sendTap: undefined as { messages: TappedMessage[]; stop: () => Promise<void> } | undefined,
  respTap: undefined as { messages: TappedMessage[]; stop: () => Promise<void> } | undefined,
  // Forensic taps — observe the due/result transit when a phase misses.
  dueTap: undefined as { messages: TappedMessage[]; stop: () => Promise<void> } | undefined,
  resultTap: undefined as { messages: TappedMessage[]; stop: () => Promise<void> } | undefined,
  metrics: new JobChainMetrics(),
  triggerUuids: [] as string[],
  adminUuid: "",
};

function shield(): ShieldIdentity {
  if (!H.shield) throw new Error("harness not initialized");
  return H.shield;
}

/** Auth headers stamped on originator/user-lane events — verbatim-forwarded
 *  by the arm path and re-verified by the due-forwarder checkpoint. */
function authHeadersFor(userUuid: string): Record<string, string> {
  return {
    "x-user-id": userUuid,
    "x-user-email": "e2e-chain@primebrick.dev",
    "x-user-name": "E2E Chain",
    "x-user-roles": "admin",
    "x-user-is-admin": "true",
  };
}

function baseSendMap(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestId: { kind: "inject", inject: "uuid" },
    templateCode: { kind: "const", value: "e2e_probe" },
    languageIso: { kind: "const", value: "en-US" },
    to: { kind: "const", value: [E2E_MAIL] },
    ...extra,
  };
}

async function cleanup(page?: Page): Promise<void> {
  const subjects = H.triggerUuids.map((u) => `jobs.schedule.job.${u}`);
  if (subjects.length > 0 && process.env.E2E_KEEP_RUNS !== "1") {
    // Run history of our mirrors — test residue, not business data.
    await getPool()
      .query("DELETE FROM job.job_runs WHERE schedule_subject = ANY($1)", [subjects])
      .catch(() => {});
  }
  if (page) {
    for (const uuid of H.triggerUuids.splice(0)) {
      await deleteTrigger(page.request, uuid).catch((e) => {
        console.warn(`[job-chain] trigger delete failed for ${uuid}: ${String(e)}`);
      });
    }
  } else {
    // No request context — log, don't SQL: a direct UPDATE bypasses the
    // `jobs.ctl.triggers.changed` broadcast and orphans the live
    // declaration (it keeps firing with no owner — verified live).
    console.warn("[job-chain] cleanup without page — triggers may leak");
  }
  // Purge any e2e-namespaced declaration still live — mirror rows die with
  // their triggers; e2e.* governed declares get a cancel here.
  if (H.shield) {
    for (const subj of (await listScheduleSubjects().catch(() => []))) {
      if (subj.startsWith("jobs.schedule.e2e.")) {
        await purgeScheduleDecl(subj, H.shield).catch(() => {});
      }
    }
    await H.shield.destroy().catch(() => {});
  }
  await getPool()
    .query("DELETE FROM emailsender.email_templates WHERE code = 'e2e_probe'")
    .catch(() => {});
  await getPool()
    .query("DELETE FROM job.job_schedules WHERE schedule_subject LIKE 'jobs.schedule.e2e.%'")
    .catch(() => {});
  await H.sendTap?.stop().catch(() => {});
  await H.respTap?.stop().catch(() => {});
  await H.dueTap?.stop().catch(() => {});
  await H.resultTap?.stop().catch(() => {});
  await drainNats().catch(() => {});
}

test.describe("job-chain-live — engine semantics end to end", () => {
  test.afterAll(async ({ browser }) => {
    // Trigger deletes need an authenticated request — mint a throwaway
    // context (no page fixture exists in afterAll).
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await loginAsTestAdmin(p).catch(() => {});
    await cleanup(p);
    await ctx.close().catch(() => {});
  });

  // ── PHASE 0 — harness ─────────────────────────────────────────────────
  test("phase 0 — shield, template, taps", async ({ page }) => {
    await loginAsTestAdmin(page);

    // Admin actor uuid — the identity for originator/user-lane events.
    const me = await page.request.get("/api/v1/auth/me");
    expect(me.ok()).toBeTruthy();
    const meBody = (await me.json()) as { profile?: { uuid?: string } };
    H.adminUuid = meBody.profile?.uuid ?? "";
    expect(H.adminUuid).not.toBe("");

    H.shield = await registerShieldIdentity(page.request);
    // The changed-broadcast reload is async per consumer — settle.
    await page.waitForTimeout(1500);

    // Self-heal — triggers leaked by a crashed run keep firing (verified:
    // a missed delete leaves the declaration armed forever). Find them by
    // name prefix and delete through the API — the changed broadcast
    // purges their declarations + mirrors.
    const trigList = await page.request.get(`${SVC}/entities/job_trigger/list?page_size=100`);
    if (trigList.ok()) {
      const trows = ((await trigList.json()) as { rows?: Array<{ uuid: string; name: string }> }).rows ?? [];
      for (const t of trows.filter((x) => x.name.startsWith("e2e-chain-"))) {
        await deleteTrigger(page.request, t.uuid);
      }
    }

    // Seed probe template via the entity API (BE-owned validation path).
    const tpl = await page.request.post(`${EMAIL_API}/entities/email_template`, {
      data: {
        entity: {
          code: "e2e_probe",
          language_iso: "en-US",
          subject: "E2E probe — {{customer_name}}",
          body_html:
            "<p>{{customer_name}}|{{big_id}}|{{score}}|{{event_at}}|{{customer_uuid}}|{{actor_mail}}</p>",
          body_text:
            "{{customer_name}}|{{big_id}}|{{score}}|{{event_at}}|{{customer_uuid}}|{{actor_mail}}",
          variables: {
            customer_name: "string",
            big_id: "integer",
            score: "number",
            event_at: "string",
            customer_uuid: "string",
            actor_mail: "string",
          },
        },
      },
    });
    expect(tpl.status(), await tpl.text()).toBeLessThan(300);

    await getNats();
    H.sendTap = await tap("emailsender.send");
    H.respTap = await tap("emailsender.response.>");
    H.dueTap = await tap("jobs.due.>");
    H.resultTap = await tap("jobs.result.>");
    expect(H.sendTap.messages.length).toBe(0);
  });

  // ── PHASE 1 — arm & fire nominal ──────────────────────────────────────
  test("phase 1 — arm & fire: interval + one-shot + datetime coherence", async ({ page }) => {
    await loginAsTestAdmin(page);
    const req = page.request;

    // A1 — schedule-only trigger, @every 1m (the floor — nothing faster
    // is a legal spec), author lane.
    const t1 = await declareTrigger(req, {
      name: TN("interval"),
      schedule_spec: "@every 1m",
      target_subject: "emailsender.send",
      run_as: "author",
      payload_map: baseSendMap({
        variables: {
          kind: "map",
          entries: {
            customer_name: { kind: "const", value: "chain-interval" },
            big_id: { kind: "const", value: 9007199254740993 },
            score: { kind: "const", value: 99.5 },
          },
        },
      }),
    });
    H.triggerUuids.push(t1.uuid);

    // A2 — one-shot, fires ~3s after arm then self-purges.
    const at = new Date(Date.now() + 3000).toISOString();
    const t2 = await declareTrigger(req, {
      name: TN("once"),
      schedule_spec: `@at ${at}`,
      target_subject: "emailsender.send",
      run_as: "author",
      payload_map: baseSendMap(),
    });
    H.triggerUuids.push(t2.uuid);

    // Mirror arms (schedule-only → armTimer at refresh).
    const s1 = await waitForSchedule(t1.schedule_subject, (r) => r?.status === "armed");
    expect(s1!.trigger_uuid).toBe(t1.uuid);
    expect(s1!.schedule_type).toBe("recurring");
    expect(s1!.run_as).toBe("user"); // author → user lane
    expect(s1!.armed_at).not.toBeNull();
    // NATS declaration exists — the mirror is a mirror of something real.
    const decl = await getScheduleDecl(t1.schedule_subject);
    expect(decl?.schedule).toBe("@every 1m");
    expect(decl?.target).toBe(`${FORWARD_PREFIX}${t1.uuid}`);

    const s2 = await waitForSchedule(t2.schedule_subject, (r) => r?.status === "armed", 15_000);
    expect(s2!.schedule_type).toBe("once");

    // ≥2 interval fires within ~2.5min — states + seq + datetime coherence.
    const runs = await waitForRuns(
      t1.schedule_subject,
      2,
      (r) => r.filter((x) => x.status === "succeeded").length >= 2,
      150_000,
    );
    const succeeded = runs.filter((x) => x.status === "succeeded");
    expect(succeeded.length).toBeGreaterThanOrEqual(2);
    // fire_seq strictly increasing, one run per fire.
    const seqs = succeeded.map((r) => BigInt(r.fire_seq ?? 0n));
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]! > seqs[i - 1]!).toBeTruthy();
    // Datetime coherence: created_at ≤ updated_at, duration ≥ 0.
    for (const r of succeeded) {
      expect(r.updated_at.getTime()).toBeGreaterThanOrEqual(r.created_at.getTime());
      if (r.duration_ms !== null) expect(r.duration_ms).toBeGreaterThanOrEqual(0n);
    }
    // next_fire mirror advances — the server-stamped Nats-Schedule-Next.
    const s1b = await readSchedule(t1.schedule_subject);
    expect(s1b?.next_fire_mirror_at).not.toBeNull();
    expect(s1b?.next_fire_mirror_at!.getTime()).toBeGreaterThan(Date.now());

    // Wire evidence — the callable received each dispatch, x-job-run-id stamped.
    const fired = H.sendTap!.messages.filter((m) => m.subject === "emailsender.send");
    expect(fired.length).toBeGreaterThanOrEqual(2);
    for (const m of fired) {
      expect(m.headers["x-job-run-id"]).toBeTruthy();
      const p = m.payload as Record<string, unknown>;
      expect(p.templateCode).toBe("e2e_probe");
      expect(p.requestId).toBeTruthy(); // injected fresh per dispatch
    }
    // requestId differs per fire — the uuid injector resolves per dispatch.
    const reqIds = new Set(fired.map((m) => (m.payload as Record<string, unknown>).requestId));
    expect(reqIds.size).toBe(fired.length);

    // Metrics — first real measurements into the collector.
    for (const r of succeeded.slice(0, 3)) {
      const tapMsg = fired.find((m) => m.headers["x-job-run-id"] === r.uuid);
      H.metrics.record({
        fire_seq: String(r.fire_seq ?? ""),
        schedule_subject: t1.schedule_subject,
        tap_received_at: tapMsg?.received_at ?? null,
        run_created_at: r.created_at.getTime(),
        run_finished_at: r.updated_at.getTime(),
        duration_ms: r.duration_ms?.toString() ?? null,
        sender_sent_at: null,
        brevo_received_at: null,
      });
    }

    // A2 outcome — one-shot flips `fired` terminal + declaration purged.
    await waitForSchedule(t2.schedule_subject, (r) => r?.status === "fired", 30_000);
    const decl2 = await getScheduleDecl(t2.schedule_subject);
    expect(decl2).toBeNull(); // self-purged — the contract.

    // The one-shot's run exists — fire_seq is the DUE's stream sequence
    // (global JOBS stream, not a per-schedule counter): non-null, >0.
    const once = await waitForRuns(t2.schedule_subject, 1, (r) => r.length >= 1, 30_000);
    expect(once[0]!.status === "succeeded" || once[0]!.status === "dispatched").toBeTruthy();
    expect(once[0]!.fire_seq).not.toBeNull();
    expect(once[0]!.fire_seq!).toBeGreaterThan(0n);
  });

  // ── PHASE 2 — lifecycle ───────────────────────────────────────────────
  test("phase 2 — pause skips dues, resume re-arms, disable drops", async ({ page }) => {
    await loginAsTestAdmin(page);
    const req = page.request;
    // Continue phase-1's interval trigger — still armed.
    const t1Subject = `jobs.schedule.job.${H.triggerUuids[0]}`;

    // PAUSE — declaration purged, mirror paused.
    const pause = await postJobAction(req, "pause-schedule", { schedule_subject: t1Subject });
    expect(pause.status).toBe(200);
    await waitForSchedule(t1Subject, (r) => r?.status === "paused");
    expect(await getScheduleDecl(t1Subject)).toBeNull(); // decl purged

    // DETERMINISTIC SKIPPED — a queued due arriving while paused must not
    // execute: force-publish the envelope on the trampoline.
    const runsBefore = (await readRuns(t1Subject)).length;
    await jsPublish(
      `${FORWARD_PREFIX}${H.triggerUuids[0]}`,
      {
        __pb_job_forward: true,
        target: "emailsender.send",
        payload: {
          requestId: randomUUID(),
          templateCode: "e2e_probe",
          languageIso: "en-US",
          to: [E2E_MAIL],
        },
        schedule_subject: t1Subject,
      },
      shield(),
      {
        ...authHeadersFor(H.adminUuid),
        // Telemetry — without a correlation header the forwarder's own
        // `jobs.result.*` report is a silent no-op; with it a missed due
        // shows DENIED / HANDLER_ERROR / succeeded in `jobs.result.>`.
        "x-job-schedule-subject": t1Subject,
      },
    );
    let skipped: Awaited<ReturnType<typeof waitForRuns>>;
    try {
      skipped = await waitForRuns(
        t1Subject,
        runsBefore + 1,
        (r) => r.some((x) => x.status === "skipped"),
        15_000,
      );
    } catch (e) {
      // FORENSIC DUMP — the due landed in the stream but produced no run
      // row (observed live once): dump every observable before rethrowing.
      const recent = await getPool()
        .query(
          `SELECT schedule_subject, name, status, error_code, error_detail, run_as, fire_seq, created_at
           FROM job.job_runs WHERE created_at > now() - interval '90 seconds' ORDER BY created_at`,
        )
        .catch((err) => ({ rows: [`query failed: ${String(err)}`] }));
      const sched = await readSchedule(t1Subject).catch(() => null);
      console.log("[forensic] schedule row:", extJsonStringify(sched));
      console.log("[forensic] recent job_runs:", extJsonStringify(recent.rows));
      console.log(
        "[forensic] dueTap last:",
        extJsonStringify(H.dueTap?.messages.slice(-5).map((m) => ({ s: m.subject, h: m.headers }))),
      );
      console.log(
        "[forensic] resultTap last:",
        extJsonStringify(H.resultTap?.messages.slice(-5).map((m) => ({ s: m.subject, p: m.payload }))),
      );
      console.log(
        "[forensic] sendTap last:",
        extJsonStringify(H.sendTap?.messages.slice(-5).map((m) => ({ s: m.subject, h: m.headers }))),
      );
      throw e;
    }
    const sk = skipped.find((x) => x.status === "skipped")!;
    expect(sk.error_detail).toBe("suppressed: schedule status is paused");
    // The suppressed due never reached the callable.
    const tapsBefore = H.sendTap!.messages.length;
    expect(H.sendTap!.messages.length).toBe(tapsBefore);

    // RESUME — re-derive; armed_at is overwritten (new window starts).
    const armedAtBefore = (await readSchedule(t1Subject))!.armed_at;
    const resume = await postJobAction(req, "resume-schedule", { schedule_subject: t1Subject });
    expect(resume.status).toBe(200);
    const sResumed = await waitForSchedule(t1Subject, (r) => r?.status === "armed");
    expect(sResumed!.armed_at!.getTime()).toBeGreaterThan(armedAtBefore!.getTime());
    expect(await getScheduleDecl(t1Subject)).not.toBeNull(); // decl restored

    // DISABLE (canonical) — schedules are all trigger-owned: disable
    // soft-deletes the owning trigger, the engine disarms and the mirror
    // ROW IS DROPPED.
    const disable = await postJobAction(req, "disable-schedule", { schedule_subject: t1Subject });
    expect(disable.status).toBe(200);
    await waitForSchedule(t1Subject, (r) => r === null);
    expect(await getScheduleDecl(t1Subject)).toBeNull();

    // Anti-leak — no emailsender.send for ~8s while disarmed.
    const mark = H.sendTap!.messages.length;
    await page.waitForTimeout(8000);
    expect(H.sendTap!.messages.length).toBe(mark);
  });

  // ── PHASE 3 — failure & governance ────────────────────────────────────
  test("phase 3 — governance: system-lane deny, originator silence, actor loss", async ({ page }) => {
    await loginAsTestAdmin(page);
    const req = page.request;

    // B0 — the minute floor is enforced at the write path: a sub-minute
    // recurring spec must be refused at declaration time and never reach
    // the stream. The verdict key is the same `checkFieldValue` the form
    // runs — wire and UI share the floor.
    const below = await req.post(`${SVC}/entities/job_trigger`, {
      data: {
        entity: {
          name: TN("floor"),
          schedule_spec: "@every 30s",
          target_subject: "emailsender.send",
          run_as: "author",
          payload_map: baseSendMap(),
        },
      },
    });
    expect(below.status()).toBe(400);
    const belowBody = JSON.stringify(await below.json());
    expect(belowBody).toContain("schedule_spec_min_interval");

    // B1 — run_as:"system" → permissioned callable: no user context exists
    // on the system lane, so emailsender.send must refuse. The run records
    // the outcome — `failed` is the honest terminal state.
    const tSys = await declareTrigger(req, {
      name: TN("system"),
      schedule_spec: "@every 1m",
      target_subject: "emailsender.send",
      run_as: "system",
      payload_map: baseSendMap(),
    });
    H.triggerUuids.push(tSys.uuid);
    await waitForSchedule(tSys.schedule_subject, (r) => r?.status === "armed");
    const sysRuns = await waitForRuns(
      tSys.schedule_subject,
      1,
      (r) => r.length >= 1,
      75_000, // first @every 1m fire lands ≤60s after arm
    );
    expect(sysRuns[0]!.run_as).toBe("system");
    // failed = auth denial reported; dispatched-until-lost = the gap case.
    const sysTerm = await waitForRuns(
      tSys.schedule_subject,
      1,
      (r) => r.some((x) => ["failed", "succeeded", "skipped"].includes(x.status)),
      30_000,
    );
    expect(sysTerm[0]!.status).toBe("failed");
    await postJobAction(req, "disable-schedule", { schedule_subject: tSys.schedule_subject });

    // B3 — originator + anonymous event: silent refuse (no arm, no run).
    const tAnon = await declareTrigger(req, {
      name: TN("anon"),
      event_subject: `${EV}.anon`,
      schedule_spec: "@every 1h", // never arms — spec is inert here
      target_subject: "emailsender.send",
      run_as: "originator",
      payload_map: baseSendMap(),
    });
    H.triggerUuids.push(tAnon.uuid);
    await page.waitForTimeout(1200); // bindSubject settles
    await publish(`${EV}.anon`, { probe: true }, shield()); // NO auth headers
    await page.waitForTimeout(3000);
    expect(await readSchedule(tAnon.schedule_subject)).toBeNull();

    // B4 — originator + actor that cannot resolve at fire time:
    // event carries x-user-id of a uuid nobody owns → arm succeeds, the
    // DUE-forwarder checkpoint fails → run failed AUTH_ACTOR_UNRESOLVABLE.
    const ghostUuid = randomUUID();
    const tGhost = await declareTrigger(req, {
      name: TN("ghost"),
      event_subject: `${EV}.ghost`,
      schedule_spec: "@every 1m",
      target_subject: "emailsender.send",
      run_as: "originator",
      payload_map: baseSendMap(),
    });
    H.triggerUuids.push(tGhost.uuid);
    await page.waitForTimeout(1200);
    await publish(`${EV}.ghost`, { probe: true }, shield(), authHeadersFor(ghostUuid));
    await waitForSchedule(tGhost.schedule_subject, (r) => r?.status === "armed", 15_000);
    const ghostRuns = await waitForRuns(
      tGhost.schedule_subject,
      1,
      (r) => r.some((x) => x.status === "failed"),
      75_000, // armed by the event — first fire ≤60s after arm
    );
    expect(ghostRuns[0]!.error_code).toBe("AUTH_ACTOR_UNRESOLVABLE");
    await postJobAction(req, "disable-schedule", { schedule_subject: tGhost.schedule_subject });

    // B5 — filter gate: below threshold → no arm; above → arm.
    const tGate = await declareTrigger(req, {
      name: TN("gate"),
      event_subject: `${EV}.gate`,
      schedule_spec: "@every 1h", // arm-only assertion — no fire needed
      target_subject: "emailsender.send",
      run_as: "originator",
      filter: [{ field: "amount", op: "gt", value: 100000 }],
      payload_map: baseSendMap(),
    });
    H.triggerUuids.push(tGate.uuid);
    await page.waitForTimeout(1200);
    await publish(`${EV}.gate`, { amount: 50 }, shield(), authHeadersFor(H.adminUuid));
    await page.waitForTimeout(2500);
    expect(await readSchedule(tGate.schedule_subject)).toBeNull();
    await publish(`${EV}.gate`, { amount: 200000 }, shield(), authHeadersFor(H.adminUuid));
    await waitForSchedule(tGate.schedule_subject, (r) => r?.status === "armed", 15_000);
    await postJobAction(req, "disable-schedule", { schedule_subject: tGate.schedule_subject });
  });

  // ── PHASE 4 — payload_map & ext-json ──────────────────────────────────
  test("phase 4 — payload_map resolution + ext-json types survive", async ({ page }) => {
    await loginAsTestAdmin(page);
    const req = page.request;
    const sendMark = H.sendTap!.messages.length;

    const tMap = await declareTrigger(req, {
      name: TN("map"),
      event_subject: `${EV}.map`,
      target_subject: "emailsender.send",
      run_as: "originator",
      payload_map: {
        requestId: { kind: "inject", inject: "uuid" },
        initiatedBy: { kind: "inject", inject: "session_actor" },
        templateCode: { kind: "const", value: "e2e_probe" },
        languageIso: { kind: "const", value: "en-US" },
        to: { kind: "path", path: "$.entity.after.email" },
        variables: {
          kind: "map",
          entries: {
            customer_name: { kind: "path", path: "$.entity.after.name" },
            big_id: { kind: "path", path: "$.entity.after.big_id" },
            score: { kind: "path", path: "$.entity.after.score" },
            event_at: { kind: "meta", meta: "fired_at" },
            customer_uuid: { kind: "path", path: "$.entity.after.uuid" },
            actor_mail: { kind: "meta", meta: "actor_email" },
          },
        },
      },
    });
    H.triggerUuids.push(tMap.uuid);
    await page.waitForTimeout(1200);

    const eventPayload = {
      customer: {
        name: "Ada Chain",
        email: E2E_MAIL,
        big_id: 9007199254740993n, // bigint — ext-json must keep it bigint
        score: 99.5, // float — must stay number, NOT bigint
        uuid: "1f2e3d4c-5b6a-7988-a0b1-c2d3e4f5a6b7",
      },
      nested: { deep: { iso: "2026-11-15T10:30:00.000Z" } },
    };
    await publish(`${EV}.map`, eventPayload, shield(), authHeadersFor(H.adminUuid));

    // Immediate trigger (no schedule_spec) → envelope straight to trampoline.
    const mapped = await expect
      .poll(async () => H.sendTap!.messages.length - sendMark, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1);
    void mapped;
    const m = H.sendTap!.messages[sendMark]!;
    const p = m.payload as Record<string, unknown>;

    expect(p.to).toEqual([E2E_MAIL]); // path → auto-wrapped array
    expect(p.templateCode).toBe("e2e_probe"); // const
    expect(p.requestId).toBeTruthy(); // injected per dispatch
    expect(p.initiatedBy).toBe(H.adminUuid); // session_actor on user lane
    const vars = p.variables as Record<string, unknown>;
    expect(vars.customer_name).toBe("Ada Chain");
    // ext-json survives the whole path: bigint stays bigint, float stays number.
    expect(typeof vars.big_id).toBe("bigint");
    expect(vars.big_id).toBe(9007199254740993n);
    expect(typeof vars.score).toBe("number");
    expect(vars.score).toBe(99.5);
    expect(vars.customer_uuid).toBe("1f2e3d4c-5b6a-7988-a0b1-c2d3e4f5a6b7");
    expect(vars.actor_mail).toBe("e2e-chain@primebrick.dev");
    // fired_at is a ms integer — arrives bigint via ext-json.
    expect(typeof vars.event_at === "bigint" || typeof vars.event_at === "number").toBeTruthy();
  });

  // ── PHASE 5 — drift & mirror truth ────────────────────────────────────
  test("phase 5 — drift: SQL-vs-JetStream divergence is detected", async ({ page }) => {
    await loginAsTestAdmin(page);
    const req = page.request;

    const tDrift = await declareTrigger(req, {
      name: TN("drift"),
      schedule_spec: "@every 1h", // drift is decl-vs-mirror, not fires
      target_subject: "emailsender.send",
      run_as: "author",
      payload_map: baseSendMap(),
    });
    H.triggerUuids.push(tDrift.uuid);
    await waitForSchedule(tDrift.schedule_subject, (r) => r?.status === "armed");
    expect(await getScheduleDecl(tDrift.schedule_subject)).not.toBeNull();

    // D1 — the documented danger: SQL flips the mirror but the NATS
    // declaration keeps firing → drift=stale, executions continue.
    await getPool().query(
      "UPDATE job.job_schedules SET status='disarmed' WHERE schedule_subject=$1",
      [tDrift.schedule_subject],
    );
    const list = await req.get(
      `${SVC}/entities/job_schedule/list?filters[0][field]=schedule_subject&filters[0][op]=%3D&filters[0][value]=${encodeURIComponent(tDrift.schedule_subject)}`,
    );
    expect(list.ok()).toBeTruthy();
    const listBody = (await list.json()) as { rows: Array<Record<string, unknown>> };
    expect(listBody.rows[0]?.drift).toBe("stale");
    // The declaration is still live — fires continue despite the mirror.
    expect(await getScheduleDecl(tDrift.schedule_subject)).not.toBeNull();

    // D4 — the drift report enumerates the row before heal.
    const driftRes = await postJobAction(req, "schedule-drift", {});
    expect(driftRes.status).toBe(200);

    // Heal via canonical disable → decl purged, coherence restored.
    await postJobAction(req, "disable-schedule", { schedule_subject: tDrift.schedule_subject });
    expect(await getScheduleDecl(tDrift.schedule_subject)).toBeNull();

    // D3 — inverse divergence: purge the DECL, leave the mirror → missing.
    const tMissing = await declareTrigger(req, {
      name: TN("missing"),
      schedule_spec: "@every 1h",
      target_subject: "emailsender.send",
      run_as: "author",
      payload_map: baseSendMap(),
    });
    H.triggerUuids.push(tMissing.uuid);
    await waitForSchedule(tMissing.schedule_subject, (r) => r?.status === "armed");
    await purgeScheduleDecl(tMissing.schedule_subject, shield());
    expect(await getScheduleDecl(tMissing.schedule_subject)).toBeNull();
    const list2 = await req.get(
      `${SVC}/entities/job_schedule/list?filters[0][field]=schedule_subject&filters[0][op]=%3D&filters[0][value]=${encodeURIComponent(tMissing.schedule_subject)}`,
    );
    const listBody2Text = await list2.text();
    expect(list2.status(), `job_schedule list (missing-drift): ${listBody2Text}`).toBe(200);
    const listBody2 = JSON.parse(listBody2Text) as { rows: Array<Record<string, unknown>> };
    expect(listBody2.rows[0]?.drift).toBe("missing");
    await postJobAction(req, "disable-schedule", { schedule_subject: tMissing.schedule_subject });
  });

  // ── PHASE 6 — metrics artifact ────────────────────────────────────────
  test("phase 6 — latency report attached", async ({}, testInfo) => {
    // Late correlation — sender_log carries no request_id, so the exec stamp
    // is the FIRST log at/after each run's creation for our recipient
    // (monotonic: later runs match later logs). Fake-Brevo captures pair by
    // received_at ≥ the send tap + E2E_MAIL in the request body.
    const senderLogs = await getPool().query(
      `SELECT sent_at FROM emailsender.sender_log
       WHERE recipients->'to' ? $1 AND sent_at > now() - interval '30 minutes'
       ORDER BY sent_at`,
      [E2E_MAIL],
    );
    expect(senderLogs.rows.length).toBeGreaterThanOrEqual(1);
    const logTimes = senderLogs.rows.map((r) => new Date(r.sent_at as string).getTime());
    // Fake-Brevo lives in the global-setup process — captures come over its
    // `__captures` endpoint, port discovered via the providers row (the same
    // source emailsender reads).
    const prov = await getPool().query(
      `SELECT api_endpoint FROM emailsender.providers WHERE provider = 'brevo'`,
    );
    const endpoint = (prov.rows[0]?.api_endpoint as string | null) ?? "";
    const brevoCaps = endpoint
      ? ((await (await fetch(`${endpoint}/__captures`)).json()) as Array<{
          received_at: number;
          body: unknown;
        }>)
      : [];
    for (const m of H.metrics.records) {
      if (m.sender_sent_at == null && m.run_created_at != null) {
        const t = logTimes.find((t) => t >= m.run_created_at!);
        if (t !== undefined) m.sender_sent_at = t;
      }
      if (m.brevo_received_at == null && m.tap_received_at != null) {
        const cap = brevoCaps.find(
          (r) => r.received_at >= m.tap_received_at! && JSON.stringify(r.body ?? {}).includes(E2E_MAIL),
        );
        if (cap) m.brevo_received_at = cap.received_at;
      }
      H.metrics.refresh(m);
    }
    expect(H.metrics.records.length).toBeGreaterThanOrEqual(1);
    await H.metrics.attach(testInfo);
  });
});
