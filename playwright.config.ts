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
/**
 * Specs that drive the shared persistent Edge session (helpers/edge-context,
 * WebGPU/transformers.js paths). They each load multi-GB models into VRAM —
 * running them on parallel workers contends GPU/model-download bandwidth and
 * starves the panel mount (empirically: sheet never mounts under 3+
 * concurrent model loads while the same spec passes solo). workers:1
 * serializes them onto the shared session one test at a time, matching the
 * dedicated-browser-per-test semantics they were written for. chromium specs
 * stay fully parallel and never touch the Edge session.
 */
const EDGE_SPECS = [
  "ai-bubble-chrome.spec.ts",
  "ai-guide-action-cta.spec.ts",
  "ai-guide-loop-parity.spec.ts",
  "ai-guide-quality.spec.ts",
  "ai-json-schema-navigation.spec.ts",
  "ai-json-schema-pending-actions.spec.ts",
  "ai-json-schema-quality.spec.ts",
  "ai-regex-quality.spec.ts",
  "smart-regex-model-selector.spec.ts",
];

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
      testIgnore: EDGE_SPECS,
    },
    {
      name: "edge-ai",
      use: { ...devices["Desktop Chrome"] },
      testMatch: EDGE_SPECS,
      workers: 1,
    },
  ],
  // We do NOT start a webServer here because the dev server is managed
  // externally (see .devin/rules/dev-server.md). The axe audit script also
  // connects to an already-running dev server.
});
