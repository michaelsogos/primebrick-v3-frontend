/**
 * E2E Suite — AI quality harness: `guide_test_score` case.
 *
 * Runs a 5-turn documentation Q&A session against the smart-guide assistant
 * (global Lighthouse CTA in the app top bar — no feature page required),
 * against the REAL live RAG pipeline (no route interception): Italian question
 * → English rewrite → embedding worker → /api/v1/system/docs/search →
 * grounded answer with source citations.
 *
 * Determinism: NO blind sleeps — every step polls DOM evidence in ≤5s slots,
 * ≤6 retries (30s cap per step). The ONLY exception is the model download:
 * while data-ai-phase is a `loading_*` phase the wait extends to 8min max,
 * still polling every 5s to catch `ready` ASAP.
 *
 * Scoring (same formulas as the other AI quality cases):
 *   turn score: 5=correct (all expected keywords + ≥1 citation for covered
 *   turns), 3=partial (some keywords or no citations), 0=fail (no answer,
 *   timeout, or a confident answer on an uncovered question)
 *   For the uncovered turn: 5 = explicit "Non lo so", 0 = fabricated answer.
 *   quality = mean(scores)·0.6 + (success/total)·5·0.4
 *   speed   = bucket(mean response_s); score = quality·0.8 + speed·0.2
 *
 * Auth: dedicated Playwright-owned Edge profile (E2E_PROFILE) + programmatic
 * E2E test-actor login. Test actor MFA factors are deleted via DB in
 * beforeAll. Requires WebGPU — skips cleanly when no adapter is present.
 */
import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { deleteMfaFactorsByUsername, setAuthMethodEnforcerDismissed } from "./helpers/db";
import { E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD } from "./helpers/admin-login";
import { mergeTestScoreTurns, type E2ETurn } from "./helpers/test-scores";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const PREFIX = "smart-guide-ai";
const CASE_KEY = "guide_test_score";
const E2E_PROFILE = "D:\\git\\primebrick\\temp\\pw-edge-profile";
const CDP_URL = "http://127.0.0.1:9333";

const log = (m: string) => console.log(`[spec] ${new Date().toISOString().slice(11, 19)} ${m}`);

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

// ─── Turn definitions ────────────────────────────────────────────────────────
// Covered turns expect ≥1 keyword (case-insensitive substring) in the answer
// AND ≥1 rendered source citation. The uncovered turn expects the explicit
// "Non lo so" fallback — a confident fabricated answer scores 0.

type TurnSpec = {
  prompt: string;
  expected: string;
  /** Substrings (lowercase) expected in the answer for covered turns. */
  keywords: string[];
  /** True → the correct answer is the no-documentation fallback. */
  uncovered?: boolean;
};

const TURNS: TurnSpec[] = [
  {
    prompt: "come faccio a creare un utente?",
    expected: "UI procedure to create a user under /system/settings/users",
    keywords: ["utent", "crea"],
  },
  {
    prompt: "cosa significa IDP Code?",
    expected: "IDP Code is the identity-provider subject (JWT sub) identifier",
    keywords: ["idp"],
  },
  {
    prompt: "come funzionano i permessi e la RBAC?",
    expected: "Wildcard-based RBAC permission system with roles and admin bypass",
    keywords: ["permess", "ruol"],
  },
  {
    prompt: "come rendo un utente admin?",
    expected: "Assign the administrators role to the user",
    keywords: ["admin|amministr"],
  },
  {
    prompt: "come faccio una torta?",
    expected: "Non lo so — no documentation coverage",
    keywords: [],
    uncovered: true,
  },
];

// ─── Bounded evidence waits (≤5s slots, 30s cap) ─────────────────────────────

async function poll<T>(fn: () => Promise<T | null>, what: string, maxRetries = 6): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    const out = await fn().catch(() => null);
    if (out !== null && out !== false) return out;
    await new Promise((r) => setTimeout(r, 5000));
    if (i % 4 === 3) log(`  still waiting: ${what} (${(i + 1) * 5}s)`);
  }
  throw new Error(`Timeout waiting for ${what} (${maxRetries * 5}s)`);
}

async function waitPanelPhase(page: Page, want: string): Promise<string> {
  const panel = page.locator(`[data-testid="${PREFIX}-panel"]`);
  let lastPhase = "";
  let stuck = 0;
  for (let slot = 0; slot < 96; slot++) {
    const phase = (await panel.getAttribute("data-ai-phase").catch(() => null)) ?? "";
    if (phase === want) return phase;
    if (phase === "webgpu_required" || phase === "error") throw new Error(`panel phase "${phase}"`);
    if (phase === "") {
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
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`Timeout waiting for data-ai-phase=${want} (8min download cap)`);
}

/** Text + citation chips + action chips of the last assistant answer bubble. */
async function lastAnswer(page: Page): Promise<{ text: string; sources: number; actions: number }> {
  const answers = page.locator(`[data-testid^="${PREFIX}-answer-"]`);
  const count = await answers.count();
  if (!count) return { text: "", sources: 0, actions: 0 };
  const last = answers.last();
  const text = ((await last.textContent()) ?? "").trim();
  // Sources/actions are siblings of the answer bubble — scope to the last
  // answer's wrapper or the previous turn's citations leak in.
  const wrap = last.locator("xpath=..");
  const sources = await wrap.locator(`[data-testid="${PREFIX}-sources"] a`).count().catch(() => 0);
  const actions = await wrap.locator('[data-testid="ai-actions"] [data-testid^="ai-action-"]')
    .count().catch(() => 0);
  return { text, sources, actions };
}

/**
 * Send one turn; wait ≤30s for the typing indicator to disappear after it
 * appeared (or for a new answer bubble to land). Records wall-clock latency.
 */
async function sendTurn(page: Page, prompt: string): Promise<{ response_s: number; answer: string; sources: number; actions: number; timed_out: boolean }> {
  const input = page.locator(`[data-testid="${PREFIX}-input"]`);
  const send = page.locator(`[data-testid="${PREFIX}-send"]`);
  const typing = page.locator(`[data-testid="${PREFIX}-typing"]`);
  const before = await page.locator(`[data-testid^="${PREFIX}-answer-"]`).count();

  await input.fill(prompt);
  await send.click({ timeout: 15_000 });
  const t0 = Date.now();
  log(`  sent: "${prompt}"`);

  let timed_out = false;
  try {
    await poll(async () => {
      // A new answer bubble whose typing indicator is gone = turn complete.
      const count = await page.locator(`[data-testid^="${PREFIX}-answer-"]`).count();
      if (count > before && (await typing.count()) === 0) return "answer";
      return null;
    }, "guide answer", 12); // the agentic loop serializes S0→S4 — allow 60s
    // Let actions/sources finish rendering (same bounded slot).
    await new Promise((r) => setTimeout(r, 1500));
  } catch {
    timed_out = true;
  }
  const { text, sources, actions } = await lastAnswer(page);
  return { response_s: (Date.now() - t0) / 1000, answer: text, sources, actions, timed_out };
}

function scoreTurn(spec: TurnSpec, answer: string, sources: number, timed_out: boolean): Pick<E2ETurn, "score" | "verdict" | "reason"> {
  if (timed_out) return { score: 0, verdict: "fail", reason: "response_timeout" };
  const lower = answer.toLowerCase();
  // Match explicit no-knowledge phrases — NOT the bare word "documentazione"
  // (a correct grounded answer may legitimately mention the docs).
  const noDoc = /non lo so|i don't know|documentazione non contiene|non è (?:presente|disponibile) nella documentazione|documentation does not contain|not covered by (?:the )?documentation/.test(lower);
  if (spec.uncovered) {
    return noDoc
      ? { score: 5, verdict: "pass", reason: "correct no-documentation fallback" }
      : { score: 0, verdict: "fail", reason: `fabricated answer on uncovered question (${sources} sources)` };
  }
  if (!answer) return { score: 0, verdict: "fail", reason: "empty answer" };
  if (noDoc) return { score: 0, verdict: "fail", reason: "no-documentation fallback on a covered question" };
  // `|` inside a keyword = alternates ("admin|amministr" matches either).
  const hits = spec.keywords.filter((k) => k.split("|").some((alt) => lower.includes(alt)));
  if (hits.length === spec.keywords.length && sources > 0) {
    return { score: 5, verdict: "pass", reason: `all keywords + ${sources} citation(s)` };
  }
  if (hits.length > 0) {
    return { score: 3, verdict: "partial", reason: `keywords ${hits.length}/${spec.keywords.length}, sources=${sources}` };
  }
  return { score: 0, verdict: "fail", reason: `no expected keywords, sources=${sources}` };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

test.describe("AI quality — guide_test_score", () => {
  test.describe.configure({ timeout: 600_000 });

  test.beforeAll(async () => {
    await deleteMfaFactorsByUsername(E2E_ADMIN_USERNAME);
    await setAuthMethodEnforcerDismissed(E2E_ADMIN_USERNAME, true);
  });

  test("5-turn documentation Q&A → persist guide_test_score", async () => {
    const context = await getSharedContext();
    const page = context.pages()[0] ?? (await context.newPage());
    page.on("request", (req) => {
      if (req.url().includes("/api/v1/system/docs/search")) log("→ docs/search request");
    });
    page.on("pageerror", (e) => log(`pageerror: ${e.message}`));
    {
      // 0. Auth gate: /api/v1/auth/me is the deterministic signal.
      const isAuthed = () =>
        page.evaluate(async () => {
          try { return (await fetch("/api/v1/auth/me")).ok; } catch { return false; }
        });
      await page.goto(BASE_URL);
      log("landed: " + page.url());

      const langNow = await page.evaluate(() => sessionStorage.getItem("pb.lang"));
      if (langNow !== "it-IT") {
        await page.evaluate(() => sessionStorage.setItem("pb.lang", "it-IT"));
        await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(async () => {
          await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
        });
        log("pb.lang=it-IT set — reloaded");
      }

      if (!(await isAuthed())) {
        log("session expired (auth/me → 401) — logging in as E2E test admin");
        await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });
        let submitted = false;
        for (let i = 0; i < 6 && page.url().includes("/login"); i++) {
          log(`  login loop ${i + 1}: url=${page.url()}`);
          const input = page.getByTestId("login-username-input");
          if (!submitted && (await input.isVisible().catch(() => false))) {
            await input.fill(E2E_ADMIN_USERNAME, { timeout: 5000 });
            await page.getByTestId("login-password-input").fill(E2E_ADMIN_PASSWORD, { timeout: 5000 });
            await page.getByTestId("login-submit-button").click({ timeout: 5000 });
            submitted = true;
            log("login form submitted");
          }
          await page.waitForTimeout(5000);
        }
        await poll(async () => ((await isAuthed()) ? true : null), "auth/me authenticated");
        log("login OK");
        await page.goto(BASE_URL);
      } else {
        log("session already authenticated");
      }

      // MFA-enforcer prompt ("Proteggi il tuo account") blocks the topbar —
      // dismiss it before clicking the global guide CTA.
      const enforcerDismiss = page.getByTestId("auth-method-enforcer-dismiss-button");
      try {
        await enforcerDismiss.waitFor({ state: "visible", timeout: 5000 });
        await enforcerDismiss.click({ timeout: 5000 });
        await enforcerDismiss.waitFor({ state: "hidden", timeout: 5000 });
        log("MFA enforcer dismissed");
      } catch {
        await enforcerDismiss.waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
      }

      // The guide CTA is global (app top bar) — no feature page needed.
      test.skip(
        !(await page.evaluate(async () => "gpu" in navigator && (await navigator.gpu.requestAdapter()) !== null)),
        "WebGPU adapter not available",
      );
      await page.locator('a[href^="/system/"]').first()
        .waitFor({ state: "visible", timeout: 30_000 });
      log("app hydrated");

      // 1. Open the guide sheet and PROVE the panel mounted (≤30s).
      const panel = page.locator(`[data-testid="${PREFIX}-panel"]`);
      for (let i = 0; i < 6; i++) {
        await page.getByTestId("app-topbar-guide-ai-cta").click({ timeout: 5000 }).catch(() => {});
        try {
          await panel.waitFor({ state: "visible", timeout: 5000 });
          break;
        } catch {
          if (i === 5) throw new Error(`Timeout waiting for ${PREFIX}-panel (sheet open) (30s)`);
          log(`  sheet not mounted yet — retrying CTA click (${(i + 1) * 5}s)`);
        }
      }
      log("guide assistant sheet mounted");

      const phase = await waitPanelPhase(page, "ready");
      log(`model ready (data-ai-phase=${phase})`);

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

      // 2. Turns — live RAG, no interception.
      const turns: E2ETurn[] = [];
      for (const [i, spec] of TURNS.entries()) {
        const { response_s, answer, sources, actions, timed_out } = await sendTurn(page, spec.prompt);
        const verdict = scoreTurn(spec, answer, sources, timed_out);
        log(
          `  turn ${i + 1}: ${verdict.verdict} score=${verdict.score} ` +
          `${response_s.toFixed(1)}s sources=${sources} actions=${actions} — ${verdict.reason}`,
        );
        log(`    answer: ${answer.slice(0, 220).replace(/\n/g, " ")}`);
        turns.push({ n: i + 1, prompt: spec.prompt, expected: spec.expected, actual: answer.slice(0, 2000), response_s, ...verdict });
      }

      // 3. Persist measured turns (aggregates are computed at read time).
      const result = await mergeTestScoreTurns(model_id, CASE_KEY, "conversation", turns);
      log(`persisted ${CASE_KEY}: score=${result.score.toFixed(2)} rank=${result.rank ?? "n/a"} turns=${result.total_turns}`);

      const failed = turns.filter((t) => t.verdict === "fail");
      expect(failed.map((t) => `T${t.n}:${t.reason}`)).toEqual([]);
    }
  });
});
