/**
 * Playwright global setup — runs ONCE before all test suites.
 *
 * Responsibilities:
 *   1. Precondition checks: verify the dev stack is reachable
 *      (FE 5173, BE 3001, Postgres 5432). Per the AGENTS.md dev-server rule,
 *      we do NOT start any dev server — we connect to already-running ones.
 *   2. Start the fake Brevo HTTP server (random port).
 *   3. Upsert the `emailsender.providers` row pointing at the fake Brevo URL
 *      so the emailsender microservice sends to our fake instead of the real
 *      Brevo SaaS.
 *   4. Expose the fake Brevo port to the teardown via a global variable.
 *
 * If any precondition fails, the setup throws and the test run aborts —
 * no point running E2E tests against a half-up stack.
 */
import { startFakeBrevoServer, type FakeBrevoServer } from "./helpers/fake-brevo";
import { upsertFakeBrevoProvider, getPool } from "./helpers/db";

// Held in module scope so teardown can close it. Playwright runs setup and
// teardown in the same Node process.
let fakeBrevo: FakeBrevoServer | null = null;

export async function globalSetup(): Promise<void> {
  console.log("[globalSetup] Starting E2E preconditions...");

  // 1. Precondition: FE dev server reachable.
  const feUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
  await assertReachable(feUrl, "FE dev server");

  // 2. Precondition: BE reachable (health endpoint).
  await assertReachable("http://localhost:3001/api/v1/health", "BE dev server");

  // 3. Precondition: Postgres reachable (the Pool constructor doesn't connect
  //    immediately, so we run a trivial query to force a connection).
  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    console.log("[globalSetup] Postgres reachable.");
  } catch (err) {
    throw new Error(
      `[globalSetup] Postgres not reachable at ${process.env.DATABASE_URL ?? "default"}: ${err}`,
    );
  }

  // 4. Start the fake Brevo server.
  fakeBrevo = await startFakeBrevoServer();
  console.log(`[globalSetup] Fake Brevo listening on ${fakeBrevo.url}`);

  // 5. Upsert the providers row so emailsender points at the fake Brevo.
  //    NOTE: if emailsender caches the provider config in-memory, this row
  //    must be set BEFORE emailsender starts. In dev, emailsender should be
  //    (re)started after this row is seeded. See plan Risks #8.
  try {
    await upsertFakeBrevoProvider(fakeBrevo.url);
    console.log("[globalSetup] Upserted fake Brevo provider row.");
  } catch (err) {
    await fakeBrevo.close();
    throw new Error(`[globalSetup] Failed to upsert fake Brevo provider row: ${err}`);
  }

  console.log("[globalSetup] All preconditions OK. E2E tests can start.");
}

async function assertReachable(url: string, label: string): Promise<void> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    // 5xx is also a failure for a dev server health check.
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
    console.log(`[globalSetup] ${label} reachable (${res.status}).`);
  } catch (err) {
    throw new Error(
      `[globalSetup] ${label} not reachable at ${url}: ${err}. Per AGENTS.md dev-server rule, the E2E tests do NOT start dev servers — start the stack manually before running E2E.`,
    );
  }
}

// Exported for teardown.
export function getFakeBrevo(): FakeBrevoServer | null {
  return fakeBrevo;
}
