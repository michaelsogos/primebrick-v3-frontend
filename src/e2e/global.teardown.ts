/**
 * Playwright global teardown — runs ONCE after all test suites complete.
 *
 * Responsibilities:
 *   1. Stop the fake Brevo HTTP server.
 *   2. Close the shared Postgres Pool.
 *
 * Cleanup of test data (users, invitations, sender_log rows) is handled by
 * each suite's `afterAll` hook, not here — suites own their own data.
 */
import { getFakeBrevo } from "./global.setup";
import { closePool } from "./helpers/db";

export async function globalTeardown(): Promise<void> {
  console.log("[globalTeardown] Cleaning up E2E resources...");

  const fakeBrevo = getFakeBrevo();
  if (fakeBrevo) {
    await fakeBrevo.close();
    console.log("[globalTeardown] Fake Brevo server stopped.");
  }

  await closePool();
  console.log("[globalTeardown] Postgres pool closed.");
  console.log("[globalTeardown] Done.");
}
