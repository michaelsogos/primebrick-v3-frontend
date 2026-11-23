/**
 * E2E NATS helper — direct access to the message bus for job-chain tests.
 *
 * Verifies empirically against the live stack (nats-server at the URL in
 * `job.config_entries.nats_url`, reachable from the host):
 *
 *   - Wire codec is ext-json: `JSON.stringify` via json-bigint (strict) on
 *     publish, parse-with-bigint-reviver on read — the same semantics the
 *     SDK's `extJsonStringify`/`extJsonParse` implement. All integer values
 *     arrive as `bigint`; floats stay `number`.
 *   - Shielded publish = `User-Agent: <registered ua_prefix>` +
 *     `x-primebrick-client-shield-key: <key>` headers. The registry row is
 *     created by `helpers/shield-identity.ts` through the BE admin API so
 *     consumers reload it via the `client_shield_registry.changed`
 *     broadcast.
 *   - `jobs.ctl.triggers.materialize` is a governed nats-req route: plain
 *     `nc.request` with shield headers reaches it; the reply comes back on
 *     the inbox subject.
 *   - Schedule declaration read-back = JetStream `getMessage(stream,
 *     {last_by_subj})` on the `JOBS` stream — O(1) direct get, the same
 *     call `schedule-mechanism.ts` uses.
 */
import { connect, headers as natsHeaders, type NatsConnection, type MsgHdrs } from "@nats-io/transport-node";
import { jetstream, jetstreamManager, JetStreamApiError, AckPolicy, type JetStreamClient, type JetStreamManager } from "@nats-io/jetstream";
import { extJsonParse, extJsonStringify } from "@primebrick/core/ext-json";

// Re-exported for spec files that assert on nats payloads — one codec,
// no local re-implementation.
export { extJsonParse, extJsonStringify };

export const JOBS_STREAM = "JOBS";
export const CLIENT_SHIELD_KEY_HEADER = "x-primebrick-client-shield-key";

export interface ShieldIdentity {
  /** Registered ua_prefix — sent verbatim as the `User-Agent` header. */
  uaPrefix: string;
  /** Raw client key — hashed form lives in `client_shield_registry`. */
  clientKey: string;
}

let nc: NatsConnection | null = null;
let js: JetStreamClient | null = null;
let jsm: JetStreamManager | null = null;

/** Connect once per worker; `drainNats()` in teardown closes it. */
export async function getNats(): Promise<NatsConnection> {
  if (nc) return nc;
  const url = process.env.E2E_NATS_URL ?? "nats://127.0.0.1:4222";
  nc = await connect({ servers: url, timeout: 5_000 });
  js = jetstream(nc);
  jsm = await jetstreamManager(nc);
  return nc;
}

export async function drainNats(): Promise<void> {
  if (nc) {
    await nc.drain().catch(() => {});
    nc = null;
    js = null;
    jsm = null;
  }
}

function buildHeaders(hdrs?: Record<string, string>): MsgHdrs {
  const h = natsHeaders();
  if (hdrs) for (const [k, v] of Object.entries(hdrs)) h.set(k, v);
  return h;
}

function shieldHeaders(shield: ShieldIdentity, extra?: Record<string, string>): Record<string, string> {
  return {
    "User-Agent": shield.uaPrefix,
    [CLIENT_SHIELD_KEY_HEADER]: shield.clientKey,
    ...extra,
  };
}

/**
 * Core publish (fire-and-forget) with ext-json encoding + shield headers.
 * For stream-captured subjects prefer `jsPublish` — only a PubAck proves
 * durable storage.
 */
export async function publish(
  subject: string,
  data: unknown,
  shield: ShieldIdentity,
  extra?: Record<string, string>,
): Promise<void> {
  const conn = await getNats();
  conn.publish(subject, new TextEncoder().encode(extJsonStringify(data)), {
    headers: buildHeaders(shieldHeaders(shield, extra)),
  });
}

/** JetStream publish with PubAck — returns the stream sequence. */
export async function jsPublish(
  subject: string,
  data: unknown,
  shield: ShieldIdentity,
  extra?: Record<string, string>,
): Promise<bigint> {
  if (!js) await getNats();
  const ack = await js!.publish(
    subject,
    new TextEncoder().encode(extJsonStringify(data)),
    { headers: buildHeaders(shieldHeaders(shield, extra)) },
  );
  return BigInt(ack.seq);
}

/** Declared schedule read-back — `last_by_subj` direct-get on JOBS. */
export async function getScheduleDecl(
  scheduleSubject: string,
): Promise<{ subject: string; schedule?: string; target?: string; seq: number } | null> {
  if (!jsm) await getNats();
  try {
    const sm = await jsm!.streams.getMessage(JOBS_STREAM, { last_by_subj: scheduleSubject });
    if (sm === null) return null;
    return {
      subject: sm.subject,
      schedule: sm.header?.get("Nats-Schedule"),
      target: sm.header?.get("Nats-Schedule-Target"),
      seq: sm.seq,
    };
  } catch (err) {
    // 10037 = no message found — the expected "absent" answer.
    if (err instanceof JetStreamApiError && err.apiError().err_code === 10037) return null;
    throw err;
  }
}

/** Purge a live declaration — replay of `cancelJobSchedule`. */
export async function purgeScheduleDecl(
  scheduleSubject: string,
  shield: ShieldIdentity,
): Promise<bigint> {
  const rest = scheduleSubject.replace(/^jobs\.schedule\./, "");
  return jsPublish(`jobs.cancel.${rest}`, null, shield, {
    "Nats-Schedule-Next": "purge",
    "Nats-Scheduler": scheduleSubject,
  });
}

/** Enumerate live `jobs.schedule.*` declarations (ephemeral consumer). */
export async function listScheduleSubjects(): Promise<string[]> {
  if (!jsm || !js) await getNats();
  const name = `e2e-enum-${Date.now()}`;
  await jsm!.consumers.add(JOBS_STREAM, {
    durable_name: name,
    filter_subjects: ["jobs.schedule.>"],
    ack_policy: AckPolicy.None,
  });
  try {
    const consumer = await js!.consumers.get(JOBS_STREAM, name);
    const subjects = new Set<string>();
    for (;;) {
      const batch = await consumer.fetch({ max_messages: 200, expires: 1500 });
      let n = 0;
      for await (const m of batch) {
        n++;
        subjects.add(m.subject);
      }
      if (n === 0) break;
    }
    return [...subjects].sort();
  } finally {
    await jsm!.consumers.delete(JOBS_STREAM, name).catch(() => {});
  }
}

export interface TappedMessage {
  received_at: number;
  subject: string;
  headers: Record<string, string>;
  payload: unknown;
}

/**
 * Plain-core tap subscriber — records every message on `subject`
 * (wildcards allowed) until `stop()`. `received_at` is the test-host
 * clock — same machine as the services, so it is comparable to the
 * DB timestamps for latency measurement.
 */
export async function tap(subject: string): Promise<{
  messages: TappedMessage[];
  stop: () => Promise<void>;
}> {
  const conn = await getNats();
  const messages: TappedMessage[] = [];
  const sub = conn.subscribe(subject);
  const loop = (async () => {
    for await (const m of sub) {
      const hdrs: Record<string, string> = {};
      if (m.headers) {
        for (const k of m.headers.keys()) {
          hdrs[k] = m.headers.get(k) ?? "";
        }
      }
      let payload: unknown;
      try {
        payload = extJsonParse(new TextDecoder().decode(m.data));
      } catch {
        payload = new TextDecoder().decode(m.data);
      }
      messages.push({ received_at: Date.now(), subject: m.subject, headers: hdrs, payload });
    }
  })();
  void loop.catch(() => {});
  return {
    messages,
    stop: async () => {
      sub.unsubscribe();
      await loop.catch(() => {});
    },
  };
}
