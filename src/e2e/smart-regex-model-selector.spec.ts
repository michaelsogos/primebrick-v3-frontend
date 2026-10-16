/**
 * E2E Suite — Smart Regex AI model selector: rank meter + sort control.
 *
 * Coverage:
 *   - Default ordering is rank descending.
 *   - Each model row renders a RankMeter (numeric score + fill width = rank/5).
 *   - The sort submenu reorders instantly WITHOUT closing the dropdown.
 *   - "Alphabetic" sorts A→Z; switching back to "Rank" restores descending.
 *
 * Determinism:
 *   - No fixed sleeps: every step waits on DOM evidence (testids, ARIA roles,
 *     or the panel's data-ai-phase attribute).
 *   - Bounded waits: each waitFor uses ≤5s slots, retried up to 12 times
 *     (60s max) — evidence-driven, never a blind timeout.
 *   - The panel is opened ONCE per suite (beforeAll): the model loads once,
 *     then both tests share the ready page.
 *
 * Auth: persistent headed Edge profile (login+MFA done once by a human).
 * Locators: data-testid only (brittle-on-purpose convention).
 */
import {
  test as base,
  expect,
  chromium,
  type BrowserContext,
  type Page,
  type Locator,
} from "@playwright/test";

const PAGE_URL = "/system/settings/configurations/create";
const E2E_PROFILE = "D:\\git\\primebrick\\temp\\pw-edge-profile";

const test = base.extend<object, { pwContext: BrowserContext }>({
  // eslint-disable-next-line no-empty-pattern
  pwContext: [
    async ({}, use) => {
      const ctx = await chromium.launchPersistentContext(E2E_PROFILE, {
        channel: "msedge",
        headless: false,
        viewport: { width: 1280, height: 900 },
      });
      await use(ctx);
      await ctx.close();
    },
    { scope: "worker" },
  ],
  page: async ({ pwContext }, use) => {
    const page = pwContext.pages()[0] ?? (await pwContext.newPage());
    await use(page);
  },
});

// ─── Evidence-driven helpers (≤5s slots, ≤60s total) ─────────────────────────

/** Wait for a locator with ≤5s slots retried up to 12 times. */
async function waitEvidence(locator: Locator, what: string): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const ok = await locator
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (ok) return;
  }
  throw new Error(`evidence not found within 60s: ${what}`);
}

/** Wait for the panel to reach a given data-ai-phase. */
async function waitPhase(page: Page, phase: string): Promise<void> {
  await waitEvidence(
    page.locator(`[data-ai-phase="${phase}"]`),
    `data-ai-phase="${phase}"`,
  );
}

/**
 * Navigate; auth problems surface in two ways, both resolved by a human
 * completing login+MFA once (session persists in the E2E profile):
 *   1. redirect to /login
 *   2. in-app "session expired" dialog (role="dialog" with a login form)
 * We poll both evidences in ≤5s slots, ≤60s total, then fail with the state.
 */
async function gotoAuthed(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // The session-expired dialog renders asynchronously — require two
  // consecutive clean checks before declaring the page authenticated.
  let cleanChecks = 0;
  for (let i = 0; i < 12; i++) {
    const blocked =
      page.url().includes("/login") ||
      (await page
        .locator('[data-dialog-overlay], [role="dialog"]')
        .first()
        .isVisible()
        .catch(() => false));
    if (!blocked) {
      if (++cleanChecks >= 2) return;
    } else {
      cleanChecks = 0;
    }
    await page.waitForTimeout(5000); // ≤5s per slot, 12 slots = 60s max
  }
  throw new Error(
    `authentication required (url=${page.url()}, dialog=${await page
      .locator('[role="dialog"]')
      .isVisible()
      .catch(() => false)}) — complete login+MFA in the E2E browser window`,
  );
}

/** Click brain CTA; verify the panel mounted (data-ai-phase appears). */
async function openAiPanel(page: Page): Promise<void> {
  const brain = page.getByTestId("smart-regex-brain-cta");
  for (let attempt = 0; attempt < 3; attempt++) {
    await brain.click();
    const opened = await page
      .locator("[data-ai-phase]")
      .waitFor({ state: "attached", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (opened) return;
  }
  throw new Error("brain-cta clicked 3 times, panel never mounted");
}

/** Model rows only — the sort SubTrigger is itself role="menuitem". */
const MODEL_ROWS = '[role="menuitem"]:has([data-testid="rank-meter"])';

async function openModelDropdown(page: Page): Promise<void> {
  // The dropdown may already be open from a previous test — clicking the
  // trigger would toggle it shut, so only click when closed.
  const rows = page.locator(MODEL_ROWS);
  if (!(await rows.first().isVisible().catch(() => false))) {
    await page.getByTestId("smart-regex-ai-model-trigger").click();
  }
  await waitEvidence(rows.first(), "model dropdown rows");
}

async function rowNames(page: Page): Promise<string[]> {
  const texts = await page.locator(MODEL_ROWS).allInnerTexts();
  return texts.map((t) => t.split("\n")[0].trim());
}

async function rowRanks(page: Page): Promise<number[]> {
  const texts = await page
    .locator(`${MODEL_ROWS} [data-testid="rank-meter"] span`)
    .allInnerTexts();
  return texts.map(parseFloat);
}

/** Select a sort criterion; asserts dropdown AND submenu stay open. */
async function selectSort(page: Page, key: string): Promise<void> {
  const option = page.getByTestId(`smart-regex-ai-sort-${key}`);
  // Submenu stays open after each selection (that's the feature under test)
  // — only open it when the option isn't already visible.
  if (!(await option.isVisible().catch(() => false))) {
    await page.getByTestId("smart-regex-ai-sort-trigger").click();
  }
  await waitEvidence(option, `sort option ${key}`);
  await option.click();
  // Instant re-order evidence: both menus remain open after selection.
  await expect(option).toBeVisible({ timeout: 5000 });
  await expect(page.locator(MODEL_ROWS).first()).toBeVisible({ timeout: 5000 });
}

// ─── Suite ──────────────────────────────────────────────────────────────────

let sharedPage: Page;
let suiteReady = false;

test.describe("Smart Regex model selector", () => {
  // Covers one-time model load on a cold cache.
  test.describe.configure({ timeout: 120000 });

  // beforeEach (not beforeAll): hooks beforeAll have a fixed 30s timeout in
  // Playwright, beforeEach inherits the test timeout. The flag makes the
  // heavy setup run exactly once — the panel stays open for both tests.
  test.beforeEach(async ({ page }) => {
    sharedPage = page;
    if (suiteReady) return;

    const p = page as Page & { __consoleErrors?: string[] };
    p.__consoleErrors = [];
    page.on("console", (m) => {
      if (m.type() === "error") p.__consoleErrors?.push(m.text().slice(0, 300));
    });

    await gotoAuthed(page, PAGE_URL);
    const hasWebGPU = await page.evaluate(async () => {
      if (!("gpu" in navigator)) return false;
      return (await navigator.gpu.requestAdapter()) !== null;
    });
    test.skip(!hasWebGPU, "WebGPU adapter not available");

    await waitEvidence(page.getByTestId("smart-regex-brain-cta"), "brain CTA");
    await openAiPanel(page);
    await waitPhase(page, "ready");
    suiteReady = true;
  });

  test("rows are sorted by rank descending by default and show rank meters", async () => {
    const page = sharedPage;
    await openModelDropdown(page);

    const ranks = await rowRanks(page);
    expect(ranks.length).toBeGreaterThan(1);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeLessThanOrEqual(ranks[i - 1]);
    }

    // Fill width is proportional to rank/5 (0% red → 100% green).
    const firstFill = page
      .locator(`${MODEL_ROWS} [data-testid="rank-meter"] .h-full`)
      .first();
    const width = await firstFill.evaluate(
      (el) => (el as HTMLElement).style.width,
    );
    expect(parseFloat(width)).toBeCloseTo((ranks[0] / 5) * 100, 0);
  });

  test("sort control reorders instantly without closing the dropdown", async () => {
    const page = sharedPage;
    await openModelDropdown(page);

    await selectSort(page, "alphabetic");
    const names = await rowNames(page);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));

    await selectSort(page, "rank");
    const ranks = await rowRanks(page);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeLessThanOrEqual(ranks[i - 1]);
    }
  });
});
