import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Primebrick FE.
 *
 * Used for:
 * - E2E tests (src/e2e/*.spec.ts)
 * - Accessibility audits via @axe-core/playwright
 *
 * The axe audit (scripts/axe-audit.mjs) launches its own browser and does not
 * use this config, but E2E specs do.
 */
export default defineConfig({
  testDir: "./src/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  // Global setup: precondition port checks + start fake Brevo + upsert
  // providers row. Global teardown: stop fake Brevo + close PG pool.
  // Both run once per test run, in the same Node process.
  globalSetup: "./src/e2e/global.setup.ts",
  globalTeardown: "./src/e2e/global.teardown.ts",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // We do NOT start a webServer here because the dev server is managed
  // externally (see AGENTS.md dev-server rule). The axe audit script also
  // connects to an already-running dev server.
});
