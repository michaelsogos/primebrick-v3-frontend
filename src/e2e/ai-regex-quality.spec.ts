/**
 * E2E Suite — AI quality harness: `regex_test_score` case.
 *
 * Runs a deterministic 5-turn incremental regex-editing session against the
 * smart-regex assistant (SmartRegexInput brain panel on the config create
 * page), scores each turn against functional regex expectations, and persists
 * the evidence to `ai_models.test_scores.regex_test_score` — the same case
 * key historically written by the interactive regex harness.
 *
 * Determinism: NO blind sleeps and NO long waits — every step polls DOM
 * evidence in ≤5s slots, ≤6 retries (30s cap per step). The ONLY exception is
 * the model download: while data-ai-phase is a `loading_*` phase the wait
 * extends to 8min max, still polling every 5s to catch `ready` ASAP.
 * The assistant sheet MUST be proven mounted before any phase wait.
 *
 * Scoring (mirrors docs/modules/ai-models.md):
 *   turn score: 5=correct (exact or probe-equivalent), 3=partial (accepts
 *   all positives but over-permissive on negatives), 2=wrong (valid regex,
 *   fails positives), 0=fail (no pattern/invalid/timeout)
 *   speed bucket per turn: ≤3s→5, ≤5s→4, ≤7s→3, ≤9s→2, ≤10s→1, >10s→0
 *   quality = mean(scores)·0.6 + (success/total)·5·0.4   (success = score ≥ 4)
 *   speed   = mean(speed buckets)
 *   score   = quality·0.8 + speed·0.2
 *   model rank = mean over ALL *_test_score cases of their computed score
 *
 * Multi-model: `AI_E2E_MODEL_IDS="id1,id2"` runs the 5 turns SERIALLY per
 * model inside the same persistent browser session — the model is switched
 * live through the assistant's own selector (worker-per-model teardown, no
 * browser restart). Empty/unset → single run on the configured default model.
 *
 * Auth: dedicated Playwright-owned Edge profile (E2E_PROFILE — persists the
 *   Cache API so completed model files survive across runs) + programmatic
 *   admin/admin login. Admin MFA factors are deleted via DB in beforeAll so
 *   the password login cannot stall on an MFA challenge.
 * Requires WebGPU — skips cleanly when no adapter is present.
 * Locators: data-testid only (brittle-on-purpose convention).
 */
import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { deleteMfaFactorsByUsername, setAuthMethodEnforcerDismissed } from "./helpers/db";
import { mergeTestScoreTurns, type E2ETurn } from "./helpers/test-scores";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const PAGE_URL = `${BASE_URL}/system/settings/configurations/create`;
const PREFIX = "smart-regex-ai";
// Dedicated Playwright-owned Edge profile (NOT the user's real profile):
// persists the Cache API model files across runs so models do not re-download.
const E2E_PROFILE = "D:\\git\\primebrick\\temp\\pw-edge-profile";
const CDP_URL = "http://127.0.0.1:9333";

const log = (m: string) => console.log(`[spec] ${new Date().toISOString().slice(11, 19)} ${m}`);

const TARGET_MODEL_IDS = (process.env.AI_E2E_MODEL_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Session strategy: REUSE over relaunch (see ai-json-schema-quality.spec.ts).
 * The browser is NEVER closed by the spec: the session is deliberately left
 * running for observation and reuse by the next spec/model run.
 */
async function getSharedContext(): Promise<BrowserContext> {
  try {
    const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 5000 });
    const ctx = browser.contexts()[0];
    if (ctx) {
      log("attached to running Edge session (CDP :9333)");
      return ctx;
    }
  } catch {
    /* no debug session up — launch one */
  }
  log("launching new persistent Edge session (CDP :9333)");
  return chromium.launchPersistentContext(E2E_PROFILE, {
    channel: "msedge",
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: ["--remote-debugging-port=9333"],
  });
}

type TurnResult = E2ETurn & { actual: string | null };

// ─── Turn definitions ────────────────────────────────────────────────────────
// Canonical 5-turn incremental regex session (same prompts historically used
// by the regex_test_score harness). Turns 2-4 exercise the modify intent
// (detectIntent → "Current regex:" injection), T5 a fresh request.

type TurnSpec = {
  prompt: string;
  /** Expected pattern (representative — equivalence is scored on probes). */
  expected: string;
  /** Values that MUST match the produced regex. */
  positives: string[];
  /** Values that MUST NOT match. */
  negatives: string[];
};

const TURNS: TurnSpec[] = [
  {
    prompt: "solo lettere e numeri",
    expected: "^[a-zA-Z0-9]+$",
    positives: ["abc", "ABC123", "a1", "Zz9"],
    negatives: ["a-b", "a b", "a.b", "", "a_b", "abc!"],
  },
  {
    prompt: "aggiungiamo anche il punto e la virgola",
    expected: "^[a-zA-Z0-9.,]+$",
    positives: ["a.", "a,b", "Ab3.,", "..."],
    negatives: ["a-b", "a_b", "a b", "a;b", "a@b", ""],
  },
  {
    prompt: "aggiungiamo underscore e trattino",
    expected: "^[a-zA-Z0-9.,_-]+$",
    positives: ["a_b", "a-b", "x.,_-"],
    negatives: ["a b", "a;b", "a@b", "a!b", ""],
  },
  {
    prompt: "rimuoviamo il punto",
    expected: "^[a-zA-Z0-9,_-]+$",
    positives: ["a,b", "a_b", "a-b", "x,_-"],
    negatives: ["a.b", "a b", "a;b", "a@b", ""],
  },
  {
    prompt: "solo lettere minuscole da 3 a 5 caratteri",
    expected: "^[a-z]{3,5}$",
    positives: ["abc", "abcde", "abcd", "xyz"],
    negatives: ["ab", "abcdef", "AbC", "a1c", "ABC", "a c"],
  },
];

// ─── Bounded evidence waits (≤5s slots) ──────────────────────────────────────

/** Poll a predicate in ≤5s slots for up to maxRetries (default 6 → 30s). */
async function poll<T>(fn: () => Promise<T | null>, what: string, maxRetries = 6): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    const out = await fn().catch(() => null);
    if (out !== null && out !== false) return out;
    await new Promise((r) => setTimeout(r, 5000));
    if (i % 4 === 3) log(`  still waiting: ${what} (${(i + 1) * 5}s)`);
  }
  throw new Error(`Timeout waiting for ${what} (${maxRetries * 5}s)`);
}

async function waitVisible(locator: ReturnType<Page["locator"]>, what: string, maxRetries = 6): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await locator.waitFor({ state: "visible", timeout: 5000 });
      return;
    } catch {
      if (i === maxRetries - 1) throw new Error(`Timeout waiting for ${what} (${maxRetries * 5}s)`);
      log(`  still waiting: ${what} (${(i + 1) * 5}s)`);
    }
  }
}

/**
 * Wait for data-ai-phase === `want` (same contract as the json spec):
 * `loading_*` phases get the 8min download budget, any other phase stuck
 * without progress fails fast after 30s. Terminal phases throw immediately.
 */
async function waitPanelPhase(page: Page, want: string): Promise<string> {
  const panel = page.locator(`[data-testid="${PREFIX}-panel"]`);
  let lastPhase = "";
  let stuck = 0;
  for (let slot = 0; slot < 96; slot++) {
    const phase = (await panel.getAttribute("data-ai-phase").catch(() => null)) ?? "";
    if (phase === want) return phase;
    if (phase === "webgpu_required" || phase === "error") throw new Error(`panel phase "${phase}"`);
    // Empty phase = panel re-mounting/re-initing (attribute momentarily
    // unset) — transitional, never a "stuck" state.
    if (phase === "") {
      if (lastPhase !== "") log(`  data-ai-phase="" (panel re-init)`);
      lastPhase = "";
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    if (phase !== lastPhase) {
      lastPhase = phase;
      stuck = 0;
      log(`  data-ai-phase="${phase}"`);
    } else {
      stuck++;
      if (!phase.startsWith("loading") && stuck >= 6) {
        throw new Error(`panel stuck at phase "${phase}" for 30s`);
      }
      if (stuck % 4 === 3) log(`  still waiting: phase="${phase}" (${(slot + 1) * 5}s)`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`Timeout waiting for data-ai-phase=${want} (8min download cap)`);
}

/**
 * Read the pattern rendered in a preview/choice card. The tokenized spans
 * concatenate to `pattern` (+ `/flags` when flags exist); strip the trailing
 * `/flags` segment (pattern part may itself contain no trailing slash-flags
 * in this scenario — the split is on the LAST `/` followed only by flag chars).
 */
function splitPattern(text: string): string {
  const m = text.match(/^(.*)\/([dgimsuvy]+)$/);
  return m ? m[1] : text;
}

/** Latest produced candidate pattern, from a single preview or choice A. */
async function lastCandidatePattern(page: Page): Promise<string | null> {
  const preview = page.locator(`[data-testid="${PREFIX}-preview"] .font-mono`).last();
  if ((await preview.count()) > 0) {
    const text = await preview.textContent();
    if (text?.trim()) return splitPattern(text.trim());
  }
  const choice = page.locator(`[data-testid="${PREFIX}-choice-0"] .font-mono`);
  if ((await choice.count()) > 0) {
    const text = await choice.first().textContent();
    if (text?.trim()) return splitPattern(text.trim());
  }
  return null;
}

/**
 * Send one turn; wait ≤30s for a new regex candidate OR the turn ending
 * without one (prose, or a classifier-resolved pending action that only emits
 * an ack bubble). Returns the extracted pattern.
 */
async function sendTurn(page: Page, prompt: string): Promise<{ response_s: number; pattern: string | null; timed_out: boolean }> {
  const input = page.locator(`[data-testid="${PREFIX}-input"]`);
  const send = page.locator(`[data-testid="${PREFIX}-send"]`);
  const typing = page.locator(`[data-testid="${PREFIX}-typing"]`);
  const preview = page.locator(`[data-testid="${PREFIX}-preview"]`);
  const choices = page.locator(`[data-testid="${PREFIX}-choices"]`);
  const applied = page.locator(`[data-testid="${PREFIX}-applied"]`);
  const evidenceBefore =
    (await preview.count()) + (await choices.count()) + (await applied.count());

  await input.fill(prompt);
  await expect(typing).toBeHidden({ timeout: 90_000 });
  const t0 = Date.now();
  // Bounded click: the send CTA is disabled while is_streaming — an explicit
  // timeout keeps a stuck stream from eating the whole test budget.
  await send.click({ timeout: 15_000 });
  log(`  sent: "${prompt}"`);

  let timed_out = false;
  try {
    await poll(async () => {
      const evidenceNow =
        (await preview.count()) + (await choices.count()) + (await applied.count());
      if (evidenceNow > evidenceBefore) return "evidence";
      // Turn ended without a candidate (prose or classifier ack). is_streaming
      // flickers false in the classifier→generation gap, so a hidden typing
      // indicator must persist across a second check.
      if ((await typing.count()) === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        if ((await typing.count()) === 0) return "done-no-card";
      }
      return null;
    }, "turn response", 6);
  } catch {
    timed_out = true;
  }
  return { response_s: (Date.now() - t0) / 1000, pattern: await lastCandidatePattern(page), timed_out };
}

/**
 * Resolve the pending candidate so the next turn is not intercepted by the
 * pending-choice classifier. Pass → accept (confirm-yes for single, choice-0
 * for multi); fail → discard the single offer (no discard CTA exists on
 * multi-choice, so resolve it via choice-0 regardless of score).
 */
async function resolvePending(page: Page, accept: boolean): Promise<void> {
  const yes = page.locator(`[data-testid="${PREFIX}-confirm-yes"]`);
  if (await yes.isVisible().catch(() => false)) {
    if (accept) {
      await yes.click();
    } else {
      await page.locator(`[data-testid="${PREFIX}-confirm-no"]`).click();
    }
    return;
  }
  const choice0 = page.locator(`[data-testid="${PREFIX}-choice-0"]`);
  if (await choice0.isVisible().catch(() => false)) await choice0.click({ timeout: 5000 });
}

/**
 * Functional scoring: a pattern is 5 when it is probe-equivalent to the
 * expectation (every positive matches, no negative does) — exact string match
 * is not required. 3 = all positives match but ≥1 negative also matches
 * (over-permissive charset). 2 = valid regex that rejects ≥1 positive or is
 * over-restrictive. 0 = none/invalid/timeout.
 */
function scoreTurn(spec: TurnSpec, pattern: string | null, timed_out: boolean): Pick<TurnResult, "score" | "verdict" | "reason"> {
  if (timed_out) return { score: 0, verdict: "fail", reason: "generation_timeout" };
  if (!pattern) return { score: 0, verdict: "fail", reason: "no regex candidate produced" };
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch {
    return { score: 0, verdict: "fail", reason: "invalid regex syntax" };
  }
  if (pattern === spec.expected) return { score: 5, verdict: "pass", reason: "exact" };
  const posOk = spec.positives.filter((v) => re.test(v)).length;
  const negLeak = spec.negatives.filter((v) => re.test(v)).length;
  if (posOk === spec.positives.length && negLeak === 0) {
    return { score: 5, verdict: "pass", reason: "probe-equivalent" };
  }
  if (posOk === spec.positives.length) {
    return { score: 3, verdict: "partial", reason: `accepts all positives but leaks ${negLeak} negative(s)` };
  }
  return { score: 2, verdict: "fail", reason: `rejects ${spec.positives.length - posOk} positive(s), leaks ${negLeak}` };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

test.describe("AI quality — regex_test_score", () => {
  test.describe.configure({ timeout: 600_000 });

  test.beforeAll(async () => {
    await deleteMfaFactorsByUsername("admin");
    await setAuthMethodEnforcerDismissed("admin", true);
  });

  test("5-turn incremental regex session → persist regex_test_score", async () => {
    test.setTimeout(Math.max(600_000, TARGET_MODEL_IDS.length * 600_000));
    const context = await getSharedContext();
    const page = context.pages()[0] ?? (await context.newPage());
    {
      // 0. Auth gate: /api/v1/auth/me is the deterministic signal.
      const isAuthed = () =>
        page.evaluate(async () => {
          try { return (await fetch("/api/v1/auth/me")).ok; } catch { return false; }
        });
      await page.goto(PAGE_URL);
      log("landed: " + page.url());

      const langNow = await page.evaluate(() => sessionStorage.getItem("pb.lang"));
      if (langNow !== "it-IT") {
        await page.evaluate(() => sessionStorage.setItem("pb.lang", "it-IT"));
        await page.reload();
        log("pb.lang=it-IT set — reloaded");
      }

      if (!(await isAuthed())) {
        log("session expired (auth/me → 401) — logging in as admin");
        await page.goto(`${BASE_URL}/login`);
        let submitted = false;
        for (let i = 0; i < 6 && page.url().includes("/login"); i++) {
          const input = page.getByTestId("login-username-input");
          if (!submitted && (await input.isVisible().catch(() => false))) {
            await input.fill("admin");
            await page.getByTestId("login-password-input").fill("admin");
            await page.getByTestId("login-submit-button").click();
            submitted = true;
            log("login form submitted");
          }
          await page.waitForTimeout(5000);
        }
        await poll(async () => ((await isAuthed()) ? true : null), "auth/me authenticated");
        log("login OK — re-navigating to target page");
        await page.goto(PAGE_URL);
      } else {
        log("session already authenticated");
      }

      // 1. Form + regex field must mount (type defaults to 'string' →
      //    ValidationRulesSection renders SmartRegexInput immediately).
      test.skip(
        !(await page.evaluate(async () => "gpu" in navigator && (await navigator.gpu.requestAdapter()) !== null)),
        "WebGPU adapter not available",
      );
      await waitVisible(page.locator('[data-testid="smart-regex-brain-cta"]'), "smart-regex-brain-cta");
      await waitVisible(page.locator('a[href^="/system/"]').first(), "sidebar nav (app interactive)");
      log("app hydrated");

      // 2. Open the regex assistant and PROVE the panel mounted (≤30s).
      const panel = page.locator(`[data-testid="${PREFIX}-panel"]`);
      for (let i = 0; i < 6; i++) {
        await page.locator('[data-testid="smart-regex-brain-cta"]').click().catch(() => {});
        try {
          await panel.waitFor({ state: "visible", timeout: 5000 });
          break;
        } catch {
          if (i === 5) throw new Error(`Timeout waiting for ${PREFIX}-panel (sheet open) (30s)`);
          log(`  sheet not mounted yet — retrying CTA click (${(i + 1) * 5}s)`);
        }
      }
      log("regex assistant sheet mounted — panel in DOM");

      // 3. Per-model loop (same contract as the json spec).
      const targets: (string | null)[] = TARGET_MODEL_IDS.length ? TARGET_MODEL_IDS : [null];
      const summary: { model_id: string; passed: number; total: number }[] = [];

      for (const target of targets) {
        if (target) {
          await page.locator(`[data-testid="${PREFIX}-model-trigger"]`).click();
          const item = page.locator(`[role="menuitem"][data-testid="${PREFIX}-model-${target}"]`);
          if ((await item.count()) === 0) {
            await page.keyboard.press("Escape");
            log(`SKIP ${target} — not in model selector (disabled/incompatible?)`);
            continue;
          }
          await item.click();
          log(`switching model → ${target}`);
          // waitPanelPhase("ready") would return instantly while the switch
          // has not started transitioning yet — wait for the phase to LEAVE
          // ready first, then for it to come back.
          await poll(async () => {
            const ph = await page
              .locator(`[data-testid="${PREFIX}-panel"]`)
              .getAttribute("data-ai-phase")
              .catch(() => null);
            return ph !== null && ph !== "ready" ? ph : null;
          }, "model switch start", 3);
        }

        const phase = await waitPanelPhase(page, "ready");
        log(`model ready (data-ai-phase=${phase})`);

        // new-session stays DISABLED on a fresh session — isVisible alone is
        // not enough, a disabled button would hang the click actionability
        // wait for the whole test timeout.
        const newSession = page.locator(`[data-testid="${PREFIX}-new-session"]`);
        if (await newSession.isEnabled().catch(() => false)) {
          await newSession.click();
          await waitPanelPhase(page, "ready");
          log("new session started");
        }

        await page.locator(`[data-testid="${PREFIX}-model-trigger"]`).click();
        const model_id = await poll(async () => {
          const items = page.locator(`[role="menuitem"][data-testid^="${PREFIX}-model-"]`);
          for (const menuItem of await items.all()) {
            const cls = await menuItem.getAttribute("class");
            if ((cls ?? "").includes("font-semibold")) {
              return (await menuItem.getAttribute("data-testid"))!.replace(`${PREFIX}-model-`, "");
            }
          }
          return null;
        }, "selected model id", 6);
        await page.keyboard.press("Escape");
        log(`model_id=${model_id}`);
        if (target && model_id !== target) {
          throw new Error(`model switch mismatch: requested ${target}, selected ${model_id}`);
        }

        const turns: TurnResult[] = [];
        try {
          for (const [i, spec] of TURNS.entries()) {
            const { response_s, pattern, timed_out } = await sendTurn(page, spec.prompt);
            const verdict = scoreTurn(spec, pattern, timed_out);
            turns.push({ n: i + 1, prompt: spec.prompt, expected: spec.expected, actual: pattern, response_s, ...verdict });
            log(`  T${i + 1}: score=${verdict.score} ${response_s.toFixed(1)}s — ${verdict.reason}${pattern ? ` (got ${pattern})` : ""}`);
            await resolvePending(page, verdict.score >= 4);
          }
        } finally {
          if (turns.length) {
            const res = await mergeTestScoreTurns(model_id, "regex_test_score", "conversation", turns);
            log(`[regex_test_score] ${model_id}: merged score=${res.score.toFixed(2)} rank=${res.rank} (total turns=${res.total_turns})`);
            summary.push({ model_id, passed: turns.filter((t) => t.score >= 4).length, total: turns.length });
          }
        }
      }

      for (const s of summary) {
        log(`SUMMARY ${s.model_id}: ${s.passed}/${s.total} turns passed`);
      }
      expect(summary.some((s) => s.passed > 0)).toBe(true);
      // The browser is intentionally left open for reuse via CDP :9333.
    }
  });
});
