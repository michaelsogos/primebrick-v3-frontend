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
import { getBrevoProviderSnapshot, getFakeBrevo } from "./helpers/global-state";
import { closePool, restoreBrevoProvider } from "./helpers/db";
import { destroyE2eAdminActor } from "./helpers/test-users";

export default async function globalTeardown(): Promise<void> {
  console.log("[globalTeardown] Cleaning up E2E resources...");

  try {
    await destroyE2eAdminActor();
    console.log("[globalTeardown] Ephemeral E2E test actor destroyed.");
  } catch (e) {
    console.warn("[globalTeardown] Test actor cleanup failed:", e);
  }

  const fakeBrevo = getFakeBrevo();
  const providerSnapshot = getBrevoProviderSnapshot();
  if (fakeBrevo && providerSnapshot) {
    try {
      await restoreBrevoProvider(providerSnapshot, fakeBrevo.url);
      console.log("[globalTeardown] Previous Brevo provider configuration restored.");
    } catch (e) {
      console.error("[globalTeardown] Brevo provider changed during E2E; refused to overwrite it:", e);
    }
    await fakeBrevo.close();
    console.log("[globalTeardown] Fake Brevo server stopped.");
  }

  await closePool();
  console.log("[globalTeardown] Postgres pool closed.");
  console.log("[globalTeardown] Done.");
}
