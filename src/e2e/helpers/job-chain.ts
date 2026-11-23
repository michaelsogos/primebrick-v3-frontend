/**
 * E2E job-chain helper — domain-level accessors for the live job-chain
 * spec: trigger/schedule/run CRUD through the governed APIs, DB row
 * readers for assertions, bounded waiters, and the latency collector
 * that holds the measured data for the run.
 *
 * Measurement model ("come misurare"):
 *   - The tap subscriber and the fake-Brevo server stamp `received_at`
 *     on the TEST-HOST clock — the same machine as the services' DB
 *     timestamps, so the desync between `tap_received_at`,
 *     `job_run.created_at`, `sender_log.sent_at` and `brevo_received_at`
 *     is real pipeline latency, not clock skew.
 *   - `JobChainMetrics` accumulates one record per observed fire and is
 *     attached to the test as a JSON artifact ("dove trattenere i dati":
 *     `testInfo.attach` → `test-results/<run>/job-chain-latency.json`,
 *     also visible in the Playwright HTML report). Never in the DB —
 *     measurements are ephemeral, not business data.
 */
import { expect, type APIRequestContext, type TestInfo } from "@playwright/test";
import { getPool } from "./db";
import { purgeScheduleDecl, extJsonStringify, extJsonParse } from "./nats";
export const JOB_API = "/svc/job/api/v1";
export const TRIGGER_SCHEDULE_PREFIX = "jobs.schedule.job.";

// ─── Row shapes (subset — raw rows from information_schema) ────────────────

export interface ScheduleRow {
  uuid: string;
  schedule_subject: string;
  run_as: string;
  schedule_spec: string;
  schedule_type: string;
  target_subject: string;
  status: string;
  trigger_uuid: string | null;
  armed_at: Date | null;
  disarmed_at: Date | null;
  fired_at: Date | null;
  next_fire_mirror_at: Date | null;
  expires_at: Date | null;
  created_by: string;
  deleted_at: Date | null;
}

export interface RunRow {
  uuid: string;
  schedule_subject: string;
  schedule_uuid: string | null;
  trigger_uuid: string;
  target_subject: string;
  run_as: string;
  status: string;
  error_code: string | null;
  error_detail: string | null;
  duration_ms: bigint | null;
  redelivery_count: number | null;
  fire_seq: bigint | null;
  report: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

// ─── DB readers ──────────────────────────────────────────────────────────

export async function readSchedule(subject: string): Promise<ScheduleRow | null> {
  const res = await getPool().query(
    "SELECT * FROM job.job_schedules WHERE schedule_subject = $1",
    [subject],
  );
  return (res.rows[0] as ScheduleRow) ?? null;
}

export async function readRuns(scheduleSubject: string): Promise<RunRow[]> {
  const res = await getPool().query(
    "SELECT * FROM job.job_runs WHERE schedule_subject = $1 ORDER BY fire_seq ASC",
    [scheduleSubject],
  );
  // node-pg returns int8 as string — coerce to real bigint so the
  // interface is honest (fire_seq/duration_ms are bigint columns).
  return (res.rows as Array<Record<string, unknown>>).map((r) => ({
    ...(r as unknown as RunRow),
    duration_ms: r.duration_ms === null || r.duration_ms === undefined ? null : BigInt(r.duration_ms as string),
    fire_seq: r.fire_seq === null || r.fire_seq === undefined ? null : BigInt(r.fire_seq as string),
  }));
}

export async function readTrigger(uuid: string): Promise<{ uuid: string; name: string; deleted_at: Date | null } | null> {
  const res = await getPool().query(
    "SELECT uuid, name, deleted_at FROM job.job_triggers WHERE uuid = $1",
    [uuid],
  );
  return res.rows[0] ?? null;
}

// ─── Bounded waiters ─────────────────────────────────────────────────────

export async function waitForSchedule(
  subject: string,
  pred: (row: ScheduleRow | null) => boolean,
  timeoutMs = 20_000,
): Promise<ScheduleRow | null> {
  let last: ScheduleRow | null = null;
  await expect
    .poll(async () => {
      last = await readSchedule(subject);
      // pred sees `null` too — the mirror-drop transition (disable on a
      // trigger-owned schedule) is a state the test must be able to await.
      return pred(last) ? "hit" : "miss";
    }, { timeout: timeoutMs, intervals: [200, 400, 800, 1500] })
    .toBe("hit");
  return last;
}

export async function waitForRuns(
  scheduleSubject: string,
  n: number,
  pred: (runs: RunRow[]) => boolean = (r) => r.length >= n,
  timeoutMs = 60_000,
): Promise<RunRow[]> {
  let last: RunRow[] = [];
  await expect
    .poll(async () => {
      last = await readRuns(scheduleSubject);
      return pred(last) ? "hit" : "miss";
    }, { timeout: timeoutMs, intervals: [500, 1000, 2000, 3000] })
    .toBe("hit");
  return last;
}

// ─── API actions ─────────────────────────────────────────────────────────

export interface TriggerSpec {
  name: string;
  event_subject?: string | null;
  schedule_spec?: string | null;
  target_subject: string;
  run_as: "author" | "originator" | "system" | "user";
  filter?: Array<{ field: string; op?: string; value?: unknown }> | null;
  payload_map?: Record<string, unknown> | null;
}

export async function declareTrigger(
  request: APIRequestContext,
  spec: TriggerSpec,
): Promise<{ uuid: string; schedule_subject: string }> {
  const res = await request.post(`${JOB_API}/entities/job_trigger`, { data: { entity: spec } });
  if (!res.ok()) {
    throw new Error(`trigger create failed ${res.status()}: ${await res.text()}`);
  }
  const row = (await res.text().then((t) => extJsonParse<any>(t))) as { uuid: string };
  return { uuid: row.uuid, schedule_subject: `${TRIGGER_SCHEDULE_PREFIX}${row.uuid}` };
}

export async function deleteTrigger(request: APIRequestContext, uuid: string): Promise<void> {
  // Optimistic-concurrency contract: DELETE requires `?version=` — a 400
  // here must NEVER be swallowed: a failed delete leaves the trigger's
  // live declaration firing forever (the exact drift the spec hunts).
  const cur = await request.get(`${JOB_API}/entities/job_trigger/${uuid}`);
  if (cur.status() === 404) return;
  const j = (await cur.text().then((t) => extJsonParse<any>(t))) as { version?: number; row?: { version?: number } };
  const version = j.version ?? j.row?.version ?? 0;
  const res = await request.delete(`${JOB_API}/entities/job_trigger/${uuid}?version=${version}`);
  if (!res.ok() && res.status() !== 404) {
    throw new Error(`trigger delete failed ${res.status()}: ${await res.text()}`);
  }
}

export async function postJobAction(
  request: APIRequestContext,
  action: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const res = await request.post(`${JOB_API}/actions/${action}`, { data: body });
  let parsed: unknown;
  try {
    parsed = await res.text().then((t) => extJsonParse<any>(t));
  } catch {
    parsed = await res.text();
  }
  return { status: res.status(), body: parsed };
}

// ─── Latency collector — the measured-data store ─────────────────────────

export interface FireMeasurement {
  fire_seq: string | null;
  schedule_subject: string;
  /** Wire: due message reached the callable's subject (test clock, ms). */
  tap_received_at: number | null;
  /** Dispatch: job_run row created (DB clock → ms). */
  run_created_at: number | null;
  /** Completion: job_run last update (DB clock → ms). */
  run_finished_at: number | null;
  /** Engine-reported duration (ms). */
  duration_ms: string | null;
  /** emailsender write stamp (DB clock → ms). */
  sender_sent_at: number | null;
  /** Brevo HTTP capture stamp (test clock, ms). */
  brevo_received_at: number | null;
  /** Derived deltas (ms). `run→wire`: dispatch-row insert → callable message
   *  tapped (forwarder inserts BEFORE republishing — always ≥0, cross-clock
   *  but same host). `run→sender`: dispatch → sender_log write (DB↔DB).
   *  `brevo→log`: provider HTTP receipt → sender_log stamp (the sender
   *  calls Brevo first, writes the log second — always ≥0). */
  run_to_wire_ms?: number;
  run_to_sender_ms?: number;
  brevo_to_log_ms?: number;
}

export class JobChainMetrics {
  readonly records: FireMeasurement[] = [];

  record(m: FireMeasurement): void {
    this.refresh(m);
    this.records.push(m);
  }

  /** Re-derive deltas — also usable after late stamps (sender_log / brevo
   *  capture) land post-`record()`. */
  refresh(m: FireMeasurement): void {
    if (m.tap_received_at != null && m.run_created_at != null) {
      m.run_to_wire_ms = m.tap_received_at - m.run_created_at;
    }
    if (m.run_created_at != null && m.sender_sent_at != null) {
      m.run_to_sender_ms = m.sender_sent_at - m.run_created_at;
    }
    if (m.sender_sent_at != null && m.brevo_received_at != null) {
      m.brevo_to_log_ms = m.sender_sent_at - m.brevo_received_at;
    }
  }

  /** JSON artifact for the test — lands in `test-results/<run>/`. */
  async attach(testInfo: TestInfo, name = "job-chain-latency"): Promise<void> {
    const body = extJsonStringify({ generated_at: new Date().toISOString(), records: this.records });
    await testInfo.attach(`${name}.json`, { body, contentType: "application/json" });
    console.log(`[job-chain-metrics] ${this.records.length} fire measurement(s):`);
    for (const r of this.records) {
      console.log(
        `  seq=${r.fire_seq ?? "?"} run→wire=${r.run_to_wire_ms ?? "n/a"}ms ` +
          `run→sender=${r.run_to_sender_ms ?? "n/a"}ms brevo→log=${r.brevo_to_log_ms ?? "n/a"}ms`,
      );
    }
  }
}

export { purgeScheduleDecl };
