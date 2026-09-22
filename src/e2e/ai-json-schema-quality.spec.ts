/**
 * E2E Suite — AI quality harness: `json_editor_with_schema` test case.
 *
 * Runs a deterministic 5-turn incremental editing session against the
 * smart-json-config assistant (type_config JSON Schema editor), scores each
 * turn with the documented rubric, and persists the evidence to
 * `ai_models.test_scores.json_editor_with_schema_test_score` via the entity
 * API — so the /ai test-score popover reports a second, independent case.
 *
 * Determinism: NO blind sleeps and NO long waits — every step polls DOM
 * evidence in ≤5s slots, ≤6 retries (30s cap per step). The ONLY exception is
 * the model download: while data-ai-phase is a `loading_*` phase the wait
 * extends to 8min max, still polling every 5s to catch `ready` ASAP.
 * The assistant sheet MUST be proven mounted before any phase wait.
 *
 * Scoring (mirrors docs/modules/ai-models.md — duplicated locally because
 * spec files run in Node and cannot import `$lib`):
 *   turn score: 5=correct, 3=partial, 2=wrong, 0=fail (no JSON/timeout)
 *   speed bucket per turn: ≤3s→5, ≤5s→4, ≤7s→3, ≤9s→2, ≤10s→1, >10s→0
 *   quality = mean(scores)·0.6 + (success/total)·5·0.4   (success = score ≥ 4)
 *   speed   = mean(speed buckets)
 *   score   = quality·0.8 + speed·0.2
 *   model rank = mean over ALL *_test_score cases of their computed score
 *
 * Auth: dedicated Playwright-owned Edge profile (E2E_PROFILE — persists the
 *   Cache API so completed model files survive across runs; HF resume is
 *   per-file, a mid-file interruption restarts that file) + programmatic
 *   admin/admin login. Same convention as auth-mfa.spec.ts: admin MFA
 *   factors are deleted via DB in beforeAll so the password login cannot
 *   stall on an MFA challenge.
 * Requires WebGPU — skips cleanly when no adapter is present.
 * Locators: data-testid only (brittle-on-purpose convention).
 */
import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { deleteMfaFactorsByUsername, setAuthMethodEnforcerDismissed } from "./helpers/db";
import { mergeTestScoreTurns, type E2ETurn } from "./helpers/test-scores";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const PAGE_URL = `${BASE_URL}/system/settings/configurations/create`;
const PREFIX = "smart-json-ai";
// Dedicated Playwright-owned Edge profile (NOT the user's real profile):
// persists the Cache API model files across runs so the ~2GB model does not
// re-download every time. Login is still programmatic — the profile only
// carries cache, not required auth state.
const E2E_PROFILE = "D:\\git\\primebrick\\temp\\pw-edge-profile";
const CDP_URL = "http://127.0.0.1:9333";

const log = (m: string) => console.log(`[spec] ${new Date().toISOString().slice(11, 19)} ${m}`);

/**
 * Session strategy: REUSE over relaunch.
 * - If an Edge debug session is already listening on CDP_URL, attach to it
 *   (connectOverCDP) and reuse its persistent context — the same Cache API
 *   (downloaded models), cookies and open pages are shared.
 * - Otherwise launch a fresh persistent context WITH a CDP port so later
 *   specs in the same — or a subsequent — run can attach to it.
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

// ─── Scoring: shared formulas + merged-turn persistence live in
//     helpers/test-scores.ts — this spec owns the "conversation" phase of the
//     json_editor_with_schema_test_score case; the navigation spec owns the
//     "navigation" phase. Aggregates cover ALL turns across both phases.

type TurnResult = E2ETurn & { actual: string | null };

// ─── Turn definitions ────────────────────────────────────────────────────────

type TurnSpec = {
  prompt: string;
  expected: string;
  /** Returns true when the semantic expectation is met by the parsed JSON. */
  check: (json: Record<string, unknown>) => boolean;
};

const getPath = (json: Record<string, unknown>, path: string): unknown =>
  path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), json);

const TURNS: TurnSpec[] = [
  {
    prompt: "rendi il campo obbligatorio",
    expected: "validation.required = true",
    check: (j) => getPath(j, "validation.required") === true,
  },
  {
    prompt: "aggiungi una lunghezza minima di 3 caratteri",
    expected: "validation.rules.min.value = 3",
    check: (j) => getPath(j, "validation.rules.min.value") === 3,
  },
  {
    prompt: "aggiungi anche una lunghezza massima di 10 caratteri",
    expected: "validation.rules.max.value = 10 (min preserved)",
    check: (j) =>
      getPath(j, "validation.rules.max.value") === 10 &&
      getPath(j, "validation.rules.min.value") === 3,
  },
  {
    prompt: "rimuovi il minimo",
    expected: "no validation.rules.min, max preserved",
    check: (j) =>
      getPath(j, "validation.rules.min") === undefined &&
      getPath(j, "validation.rules.max.value") === 10,
  },
  {
    prompt: "aggiungi una regex che accetta solo lettere",
    expected: "validation.rules.regex.pattern accepting letters only",
    check: (j) => {
      const pattern = getPath(j, "validation.rules.regex.pattern");
      if (typeof pattern !== "string") return false;
      try {
        const re = new RegExp(pattern);
        return re.test("abcXYZ") && !re.test("abc123");
      } catch {
        return false;
      }
    },
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

/**
 * Deterministic visibility gate: locator.waitFor polls continuously inside
 * each ≤5s slot, retried ≤6 times (30s cap). Fails fast with the testid in
 * the error instead of hanging on an unbounded wait.
 */
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
 * Wait for data-ai-phase === `want`. Two budgets, both in ≤5s slots:
 *  - phases `init`/`loading_*` (download in progress): up to 96 slots (8min)
 *    — a cold ~2GB model download legitimately takes minutes;
 *  - any other phase stuck without progress: 6 consecutive slots (30s).
 * Terminal phases (webgpu_required, error) fail immediately.
 */
async function waitPanelPhase(page: Page, want: string): Promise<string> {
  const panel = page.locator(`[data-testid="${PREFIX}-panel"]`);
  let lastPhase = "";
  let stuck = 0;
  for (let slot = 0; slot < 96; slot++) {
    const phase = (await panel.getAttribute("data-ai-phase").catch(() => null)) ?? "";
    if (phase === want) return phase;
    if (phase === "webgpu_required" || phase === "error") throw new Error(`panel phase "${phase}"`);
    if (phase !== lastPhase) {
      lastPhase = phase;
      stuck = 0;
      log(`  data-ai-phase="${phase}"`);
    } else {
      stuck++;
      // Only `loading_*` phases (download) get the full 8min — any other
      // phase stuck unchanged for 30s is a broken flow, fail fast.
      if (!phase.startsWith("loading") && stuck >= 6) {
        throw new Error(`panel stuck at phase "${phase}" for 30s`);
      }
      if (stuck % 4 === 3) log(`  still waiting: phase="${phase}" (${(slot + 1) * 5}s)`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`Timeout waiting for data-ai-phase=${want} (8min download cap)`);
}

/** Extract the last config-card JSON produced by the assistant, if any. */
async function lastCandidateJson(page: Page): Promise<string | null> {
  const card = page.locator(`[data-testid="${PREFIX}-config-card"]`).last();
  if ((await card.count()) === 0) return null;
  const text = await card.innerText();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}

/** Send one turn; wait ≤60s for a new config card OR the send button re-enabled (prose answer). */
async function sendTurn(page: Page, prompt: string): Promise<{ response_s: number; json: string | null; timed_out: boolean }> {
  const input = page.locator(`[data-testid="${PREFIX}-input"]`);
  const send = page.locator(`[data-testid="${PREFIX}-send"]`);
  const cardsBefore = await page.locator(`[data-testid="${PREFIX}-config-card"]`).count();

  await input.fill(prompt);
  await expect(send).toBeEnabled({ timeout: 5000 });
  const t0 = Date.now();
  await send.click();
  log(`  sent: "${prompt}"`);

  let timed_out = false;
  try {
    await poll(async () => {
      const cardsNow = await page.locator(`[data-testid="${PREFIX}-config-card"]`).count();
      if (cardsNow > cardsBefore) return "card";
      // no card but streaming ended → prose answer (score 0)
      if (await send.isEnabled()) return "done-no-card";
      return null;
    }, "turn response", 6);
  } catch {
    timed_out = true;
  }
  return { response_s: (Date.now() - t0) / 1000, json: await lastCandidateJson(page), timed_out };
}

async function applyLastCandidate(page: Page): Promise<boolean> {
  const btn = page.locator(`[data-testid="${PREFIX}-apply"]`).last();
  if ((await btn.count()) === 0 || !(await btn.isVisible().catch(() => false))) return false;
  await btn.click();
  return true;
}

function scoreTurn(spec: TurnSpec, json: string | null, timed_out: boolean): Pick<TurnResult, "score" | "verdict" | "reason"> {
  if (timed_out) return { score: 0, verdict: "fail", reason: "generation_timeout" };
  if (!json) return { score: 0, verdict: "fail", reason: "no JSON candidate produced" };
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { score: 0, verdict: "fail", reason: "invalid JSON syntax" };
  }
  if (spec.check(parsed)) return { score: 5, verdict: "pass", reason: "exact" };
  if ("validation" in parsed || "widget" in parsed) {
    return { score: 2, verdict: "fail", reason: "schema-shaped but expectation not met" };
  }
  return { score: 0, verdict: "fail", reason: "unrelated JSON" };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

test.describe("AI quality — json_editor_with_schema", () => {
  test.describe.configure({ timeout: 600_000 });

  test.beforeAll(async () => {
    // Same convention as auth-mfa.spec.ts: strip admin MFA factors via DB so
    // the password login cannot stall on a challenge we cannot answer.
    await deleteMfaFactorsByUsername("admin");
    await setAuthMethodEnforcerDismissed("admin", true);
  });

  test("5-turn incremental schema edit → persist json_editor_with_schema_test_score", async () => {
    // Attach to a running session or launch a persistent one (CDP :9333).
    // The browser is left open on purpose — next spec reuses it.
    const context = await getSharedContext();
    const page = context.pages()[0] ?? (await context.newPage());
    {
      // 0. Auth gate: /api/v1/auth/me is the deterministic signal — the SPA
      //    renders the form shell even with an expired session (401), so URL
      //    or DOM checks alone can lie.
      const isAuthed = () =>
        page.evaluate(async () => {
          try { return (await fetch("/api/v1/auth/me")).ok; } catch { return false; }
        });
      await page.goto(PAGE_URL);
      log("landed: " + page.url());

      // Pin UI language: fresh profiles may resolve to a language with no
      // dictionary (e.g. en-US; DB ships en-GB/it-IT/…), rendering raw keys.
      // pb.lang is read at app boot → reload once after setting it.
      const langNow = await page.evaluate(() => sessionStorage.getItem("pb.lang"));
      if (langNow !== "it-IT") {
        await page.evaluate(() => sessionStorage.setItem("pb.lang", "it-IT"));
        await page.reload();
        log("pb.lang=it-IT set — reloaded");
      }

      if (!(await isAuthed())) {
        log("session expired (auth/me → 401) — logging in as admin");
        await page.goto(`${BASE_URL}/login`);
        // /login boots with a session check: if a refresh succeeds it
        // redirects away before the form ever renders; if the refresh fails
        // the form appears. Poll bounded for either outcome.
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

      // 1. Form must mount: ≤5s slots, ≤6 retries (30s cap).
      test.skip(
        !(await page.evaluate(async () => "gpu" in navigator && (await navigator.gpu.requestAdapter()) !== null)),
        "WebGPU adapter not available",
      );
      await waitVisible(page.locator('[data-testid="config-create-key"]'), "config-create-key");
      log("form mounted");

      // Hydration gate: sidebar nav links render only after onMount +
      // module-nav fetch, i.e. handlers are attached and the page is
      // interactive. Clicking before this point hits dead SSR DOM.
      await waitVisible(page.locator('a[href^="/system/"]').first(), "sidebar nav (app interactive)");
      log("app hydrated");

      await page.locator('[data-testid="config-create-key"]').fill("e2e_json_quality_probe");
      // type defaults to 'string' → TypeConfigBuilder/JsonPreviewEditor render
      // immediately, no ComboSelect interaction needed.
      await expect(page.locator('[data-testid="tcb-ai-assistant-cta"]')).toBeVisible({ timeout: 5000 });
      log("AI CTA visible");

      // 2. Open the assistant sheet and PROVE the panel mounted (≤30s)
      //    BEFORE waiting on any model phase — never wait for a model that
      //    cannot load because the sheet was never opened. The CTA click can
      //    land on not-yet-hydrated SSR DOM — retry it inside the poll.
      const panel = page.locator(`[data-testid="${PREFIX}-panel"]`);
      for (let i = 0; i < 6; i++) {
        await page.locator('[data-testid="tcb-ai-assistant-cta"]').click().catch(() => {});
        try {
          await panel.waitFor({ state: "visible", timeout: 5000 });
          break;
        } catch {
          if (i === 5) throw new Error(`Timeout waiting for ${PREFIX}-panel (sheet open) (30s)`);
          log(`  sheet not mounted yet — retrying CTA click (${(i + 1) * 5}s)`);
        }
      }
      log("assistant sheet mounted — panel in DOM");

      // 3. Model readiness: `loading_*` phases get the 8min download budget
      //    (persistent profile keeps completed files across runs), every other
      //    phase fails fast after 30s unchanged. Warm-cache load is ~10s.
      const phase = await waitPanelPhase(page, "ready");
      log(`model ready (data-ai-phase=${phase})`);

    // Clean chat session for the "conversation" phase: leftover messages from
    // a previous spec (e.g. the navigation sweep) must not contaminate turns.
    const newSession = page.locator(`[data-testid="${PREFIX}-new-session"]`);
    if (await newSession.isVisible().catch(() => false)) {
      await newSession.click();
      await waitPanelPhase(page, "ready");
      log("new session started");
    }

    // Discover the model_id via the selector's selected menu item.
    await page.locator(`[data-testid="${PREFIX}-model-trigger"]`).click();
    const model_id = await poll(async () => {
      // Model entries are DropdownMenu.Item → role="menuitem" (excludes the
      // `*-trigger` elements sharing the testid prefix). The selected row is
      // marked by menuListSelectedSurfaceDropdownClasses → `font-semibold`.
      const items = page.locator(`[role="menuitem"][data-testid^="${PREFIX}-model-"]`);
      for (const item of await items.all()) {
        const cls = await item.getAttribute("class");
        if ((cls ?? "").includes("font-semibold")) {
          return (await item.getAttribute("data-testid"))!.replace(`${PREFIX}-model-`, "");
        }
      }
      return null;
    }, "selected model id", 6);
    await page.keyboard.press("Escape");
    log(`model_id=${model_id}`);

    // 3. Run the 5 deterministic turns (each capped at 60s evidence wait).
    const turns: TurnResult[] = [];
    for (const [i, spec] of TURNS.entries()) {
      const { response_s, json, timed_out } = await sendTurn(page, spec.prompt);
      const verdict = scoreTurn(spec, json, timed_out);
      turns.push({ n: i + 1, prompt: spec.prompt, expected: spec.expected, actual: json, response_s, ...verdict });
      log(`  T${i + 1}: score=${verdict.score} ${response_s.toFixed(1)}s — ${verdict.reason}`);
      if (verdict.score >= 4) await applyLastCandidate(page);

      // Form-level assertion after the "remove min" turn: the applied JSON
      // dropped rules.min, so the min input must stay empty (the builder must
      // not re-inject its init default on an explicit apply). max=10 must
      // be preserved from T3.
      if (i === 3 && verdict.score >= 4) {
        const minInput = page.getByTestId("tcb-min");
        const maxInput = page.getByTestId("tcb-max");
        expect(await minInput.inputValue(), "min rule re-appeared after removal").toBe("");
        expect(await maxInput.inputValue(), "max rule lost after min removal").toBe("10");
        log("  form check: min empty, max=10 preserved");
      }
    }

    // 4. Merge the "conversation" turns into json_editor_with_schema_test_score.
    //    The navigation spec contributes its own "navigation" turns to the
    //    SAME case — quality/speed/score and rank are derived from ALL turns
    //    across both sessions at read time.
    const res = await mergeTestScoreTurns(model_id, "json_editor_with_schema_test_score", "conversation", turns);
    log(`[json_editor_with_schema] ${model_id}: merged score=${res.score.toFixed(2)} rank=${res.rank} (total turns=${res.total_turns})`);
    expect(turns.filter((t) => t.score >= 4).length).toBeGreaterThan(0);
      // The browser is intentionally left open: the persistent session (and
      // its model cache) is reused by the next spec/run via CDP :9333.
    }
  });
});
