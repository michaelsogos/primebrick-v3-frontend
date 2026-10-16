/**
 * E2E — Guide agentic loop WebGPU parity check (plan task 1.8).
 *
 * The CPU baseline (`temp/guide-loop-harness.mjs`, onnxruntime-node q4)
 * measured the bounded loop S0–S4 stage-by-stage. This spec runs the SAME
 * loop on the real production path — q4f16 on onnxruntime-web/WebGPU —
 * and diffs behavior, not vibes:
 *
 *   - every model stage's raw output is captured via the composable's
 *     `[ai-raw]` console.debug (fires per stream_complete — preflights too)
 *   - worker postMessage hook counts `generate` calls + embed queries
 *   - real /ws/ai/api/v1/system/docs/search + /api/v1/system/routes (no mocks)
 *   - per-stage wall time = delta between `generate` post and next [ai-raw]
 *
 * Parity assertions vs baseline v1 (`guide-loop-baseline-v1-results.md`):
 *   covered turn   → ≥1 docs/search, ≥1 citation, navigate action ∈ census
 *   uncovered turn → deterministic "Non lo so", 0 citations, S0-only
 *   all stage raws → JSON-parseable after fence strip (closed-space contract)
 *   stall guard    → fail if no loop activity for >30s (per-wait, not total)
 */
import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { deleteMfaFactorsByUsername, setAuthMethodEnforcerDismissed } from "./helpers/db";
import { E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD } from "./helpers/admin-login";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const PREFIX = "smart-guide-ai";
const E2E_PROFILE = "D:\\git\\primebrick\\temp\\pw-edge-profile";
const CDP_URL = "http://127.0.0.1:9333";

const log = (m: string) => console.log(`[parity] ${new Date().toISOString().slice(11, 19)} ${m}`);

interface LoopDebug {
  generations: { start: number; end?: number; raw?: string }[];
  embed_queries: string[];
  docs_search_calls: number;
  docs_search_keywords: (string[] | undefined)[];
  routes_census_calls: number;
  worker_debug: string[];
  /** Ordered [guide-loop] stage telemetry lines emitted by guide-loop.ts. */
  loop_events: string[];
}
type DebugWindow = Window & { __loop_debug?: LoopDebug };

async function getSharedContext(): Promise<BrowserContext> {
  try {
    const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 5000 });
    const ctx = browser.contexts()[0];
    if (ctx) {
      log("attached to running Edge session (CDP :9333)");
      return ctx;
    }
  } catch {
    /* launch our own */
  }
  log("launching persistent Edge session (CDP :9333)");
  return chromium.launchPersistentContext(E2E_PROFILE, {
    channel: "msedge",
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: ["--remote-debugging-port=9333"],
  });
}

async function poll<T>(fn: () => Promise<T | null>, what: string, maxRetries = 6): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    const out = await fn().catch(() => null);
    if (out !== null && out !== false) return out;
    await new Promise((r) => setTimeout(r, 5000));
    if (i % 2 === 1) log(`  waiting: ${what} (${(i + 1) * 5}s)`);
  }
  throw new Error(`Timeout waiting for ${what} (${maxRetries * 5}s)`);
}

async function waitPanelPhase(page: Page, want: string): Promise<void> {
  const panel = page.locator(`[data-testid="${PREFIX}-panel"]`);
  let last = "";
  let stuck = 0;
  for (let slot = 0; slot < 96; slot++) {
    const phase = (await panel.getAttribute("data-ai-phase").catch(() => null)) ?? "";
    if (phase === want) return;
    if (phase === "webgpu_required" || phase === "error") throw new Error(`panel phase "${phase}"`);
    if (phase && phase !== last) {
      last = phase;
      stuck = 0;
      log(`  data-ai-phase="${phase}"`);
    } else if (phase) {
      if (!phase.startsWith("loading") && ++stuck >= 6) {
        throw new Error(`panel stuck at phase "${phase}" for 30s`);
      }
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("model not ready within download budget");
}

function parseStageJson(raw: string): unknown | null {
  try {
    return JSON.parse(
      raw.trim().replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim(),
    );
  } catch {
    return null;
  }
}

test.describe("Guide agentic loop — WebGPU parity vs CPU baseline", () => {
  test.describe.configure({ timeout: 600_000 });

  test.beforeAll(async () => {
    await deleteMfaFactorsByUsername(E2E_ADMIN_USERNAME);
    await setAuthMethodEnforcerDismissed(E2E_ADMIN_USERNAME, true);
  });

  test("stage-by-stage parity on baseline questions", async () => {
    const context = await getSharedContext();
    const page = context.pages()[0] ?? (await context.newPage());
    page.on("pageerror", (e) => log(`pageerror: ${e.message}`));

    // ── Auth (same flow as the quality spec) ──────────────────────────
    const isAuthed = () =>
      page.evaluate(async () => {
        try { return (await fetch("/api/v1/auth/me")).ok; } catch { return false; }
      });
    await page.goto(BASE_URL);
    const langNow = await page.evaluate(() => sessionStorage.getItem("pb.lang"));
    if (langNow !== "it-IT") {
      await page.evaluate(() => sessionStorage.setItem("pb.lang", "it-IT"));
      await page.reload();
    }
    if (!(await isAuthed())) {
      await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      let submitted = false;
      for (let i = 0; i < 6 && page.url().includes("/login"); i++) {
        const input = page.getByTestId("login-username-input");
        if (!submitted && (await input.isVisible().catch(() => false))) {
          await input.fill(E2E_ADMIN_USERNAME, { timeout: 5000 });
          await page.getByTestId("login-password-input").fill(E2E_ADMIN_PASSWORD, { timeout: 5000 });
          await page.getByTestId("login-submit-button").click({ timeout: 5000 });
          submitted = true;
        }
        await page.waitForTimeout(5000);
      }
      await poll(async () => ((await isAuthed()) ? true : null), "auth/me authenticated");
      await page.goto(BASE_URL);
    }
    const enforcerDismiss = page.getByTestId("auth-method-enforcer-dismiss-button");
    try {
      await enforcerDismiss.waitFor({ state: "visible", timeout: 5000 });
      await enforcerDismiss.click({ timeout: 5000 });
      await enforcerDismiss.waitFor({ state: "hidden", timeout: 5000 });
    } catch {
      await enforcerDismiss.waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
    }
    test.skip(
      !(await page.evaluate(async () => "gpu" in navigator && (await navigator.gpu.requestAdapter()) !== null)),
      "WebGPU adapter not available",
    );

    // ── Instrument BEFORE the panel mounts (workers spawn on open) ────
    await page.evaluate(() => {
      const w = window as DebugWindow;
      w.__loop_debug = {
        generations: [],
        embed_queries: [],
        docs_search_calls: 0,
        docs_search_keywords: [],
        routes_census_calls: 0,
        worker_debug: [],
        loop_events: [],
      };
      const orig = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (message: unknown) {
        const p = message as { type?: string; text?: string };
        if (p?.type === "generate") w.__loop_debug!.generations.push({ start: Date.now() });
        if (p?.type === "embed" && typeof p.text === "string") w.__loop_debug!.embed_queries.push(p.text);
        return orig.call(this, message);
      };
      const origFetch = window.fetch;
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
        if (url.includes("/ws/ai/api/v1/system/docs/search")) {
          w.__loop_debug!.docs_search_calls++;
          try {
            const body = JSON.parse((init?.body as string) ?? "{}");
            w.__loop_debug!.docs_search_keywords.push(body.keywords);
          } catch { w.__loop_debug!.docs_search_keywords.push(undefined); }
        }
        if (url.includes("/api/v1/system/routes")) w.__loop_debug!.routes_census_calls++;
        return origFetch(input, init);
      };
    });
    // [ai-raw] = raw output of EVERY generation (preflights included),
    // ordered — pair them with `generate` posts for per-stage latency.
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.startsWith("[ai-raw]") || text.startsWith("[ai-worker]") || text.startsWith("[guide-loop]")) {
        void page.evaluate(({ t }) => {
          const d = (window as DebugWindow).__loop_debug;
          if (!d) return;
          if (t.startsWith("[ai-raw]")) {
            const gen = d.generations.find((g) => g.end === undefined);
            if (gen) { gen.end = Date.now(); gen.raw = t.slice(8).trim(); }
          } else if (t.startsWith("[guide-loop]")) {
            d.loop_events.push(t);
          } else {
            d.worker_debug.push(t);
          }
        }, { t: text }).catch(() => undefined);
      }
    });

    // ── Open guide panel, wait ready ──────────────────────────────────
    const panel = page.locator(`[data-testid="${PREFIX}-panel"]`);
    for (let i = 0; i < 6; i++) {
      await page.getByTestId("app-topbar-guide-ai-cta").click({ timeout: 5000 }).catch(() => {});
      if (await panel.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false)) break;
      if (i === 5) throw new Error("guide panel did not mount (30s)");
    }
    await waitPanelPhase(page, "ready");
    log("model ready");

    const newSession = page.locator(`[data-testid="${PREFIX}-new-session"]`);
    if (await newSession.isEnabled().catch(() => false)) {
      await newSession.click();
      await waitPanelPhase(page, "ready");
    }

    // ── Turns: same core questions as CPU baseline ────────────────────
    const TURNS = [
      { prompt: "come rendo un utente admin?", uncovered: false, expect_route_prefix: "/system/settings/users" },
      { prompt: "cosa significa IDP Code?", uncovered: false, expect_route_prefix: null },
      { prompt: "come faccio una torta?", uncovered: true, expect_route_prefix: null },
    ];

    const results: {
      prompt: string; total_s: number; gens: number; searches: number;
      embeds: number; sources: number; actions: string[]; answer: string;
      stage_parse_failures: number; loop_events: string[];
    }[] = [];

    for (const spec of TURNS) {
      const d0 = await page.evaluate(() => ({
        gens: (window as DebugWindow).__loop_debug!.generations.length,
        searches: (window as DebugWindow).__loop_debug!.docs_search_calls,
        embeds: (window as DebugWindow).__loop_debug!.embed_queries.length,
        events: (window as DebugWindow).__loop_debug!.loop_events.length,
      }));
      const before = await page.locator(`[data-testid^="${PREFIX}-answer-"]`).count();

      await page.locator(`[data-testid="${PREFIX}-input"]`).fill(spec.prompt);
      await page.locator(`[data-testid="${PREFIX}-send"]`).click({ timeout: 15_000 });
      const t0 = Date.now();
      log(`turn: "${spec.prompt}"`);

      // Stall guard: no loop activity (generate post / ai-raw / search)
      // for >30s → fail. Total turn can legitimately exceed 30s because
      // stages serialize — progress is what we bound.
      let lastActivity = Date.now();
      let lastSeen = { gens: d0.gens, searches: d0.searches };
      for (let i = 0; i < 60; i++) {
        const activity = await page.evaluate(() => ({
          gens: (window as DebugWindow).__loop_debug!.generations.length,
          done: (window as DebugWindow).__loop_debug!.generations.filter((g) => g.end).length,
          searches: (window as DebugWindow).__loop_debug!.docs_search_calls,
        }));
        if (activity.gens !== lastSeen.gens || activity.searches !== lastSeen.searches) {
          lastActivity = Date.now();
          lastSeen = { gens: activity.gens, searches: activity.searches };
        }
        const answers = await page.locator(`[data-testid^="${PREFIX}-answer-"]`).count();
        const typing = await page.locator(`[data-testid="${PREFIX}-typing"]`).count();
        if (answers > before && typing === 0) break;
        if (Date.now() - lastActivity > 30_000) {
          throw new Error(`loop stalled >30s without stage progress on "${spec.prompt}"`);
        }
        await page.waitForTimeout(5000);
        if (i === 59) throw new Error(`turn exceeded 5min on "${spec.prompt}"`);
      }
      const total_s = (Date.now() - t0) / 1000;

      const d1 = await page.evaluate(() => ({
        gens: (window as DebugWindow).__loop_debug!.generations.slice(),
        searches: (window as DebugWindow).__loop_debug!.docs_search_calls,
        embeds: (window as DebugWindow).__loop_debug!.embed_queries.length,
        events: (window as DebugWindow).__loop_debug!.loop_events.slice(),
      }));
      // Stage telemetry emitted by guide-loop itself — ms per stage, queries
      // issued, chunks added, sufficient decisions, selected actions.
      for (const ev of d1.events.slice(d0.events)) log(`  ${ev}`);
      const turnGens = d1.gens.slice(d0.gens);
      let stage_parse_failures = 0;
      for (const [si, g] of turnGens.entries()) {
        const dur = g.end !== undefined ? ((g.end - g.start) / 1000).toFixed(1) : "?";
        // [ai-raw] slices output at 200 chars — a truncated raw can NEVER
        // parse; only check JSON validity on complete captures.
        const truncated = g.raw !== undefined && g.raw.length >= 195;
        const parsed = g.raw !== undefined && !truncated ? parseStageJson(g.raw) : null;
        if (g.raw !== undefined && !truncated && parsed === null) stage_parse_failures++;
        const shape = parsed !== null ? `{${Object.keys(parsed as object).join(",")}}` : truncated ? "TRUNC" : "RAW";
        log(`  gen${si} ${dur}s → ${shape} ${g.raw?.slice(0, 140).replace(/\n/g, " ") ?? ""}`);
      }

      // Sources/actions are SIBLINGS of the answer bubble — scope them to the
      // last answer's wrapper, never a global .last() (would leak prior turns).
      const lastAnswer = page.locator(`[data-testid^="${PREFIX}-answer-"]`).last();
      const answerWrap = lastAnswer.locator("xpath=..");
      const answer = ((await lastAnswer.textContent()) ?? "").trim();
      const sources = await answerWrap.locator(`[data-testid="${PREFIX}-sources"] a`)
        .count().catch(() => 0);
      const actions = await answerWrap.locator('[data-testid="ai-actions"] [data-testid^="ai-action-"]')
        .allTextContents().catch(() => [] as string[]);

      results.push({
        prompt: spec.prompt, total_s, gens: turnGens.length,
        searches: d1.searches - d0.searches, embeds: d1.embeds - d0.embeds,
        sources, actions: actions.filter(Boolean) as string[],
        answer: answer.slice(0, 300), stage_parse_failures,
        loop_events: d1.events.slice(d0.events),
      });
      log(
        `  done ${total_s.toFixed(1)}s · gens=${turnGens.length} searches=${d1.searches - d0.searches} ` +
        `embeds=${d1.embeds - d0.embeds} sources=${sources} actions=${JSON.stringify(actions)}`,
      );

      // ── Parity assertions ─────────────────────────────────────────
      if (spec.uncovered) {
        expect(answer.toLowerCase()).toMatch(/non lo so|i don't know/);
        expect(sources).toBe(0);
      } else {
        expect(answer.length).toBeGreaterThan(0);
        expect(sources).toBeGreaterThan(0);
        expect(d1.searches - d0.searches).toBeGreaterThan(0);
      }
      expect(stage_parse_failures).toBe(0);
      // Route proof: chip labels are free text — the real parity signal is
      // where the CTA lands. Click the first action chip and check the URL.
      if (spec.expect_route_prefix) {
        const chip = answerWrap.locator('[data-testid="ai-action-0"]');
        if (await chip.count()) {
          // Proof = execute ran (chip flips to done/disabled) AND the URL is
          // the census route. The chip click may find us already on the
          // target (session restore) — execution state is the real signal.
          await chip.click();
          await poll(async () => ((await chip.isDisabled()) ? true : null), "navigate chip executed", 6);
          log(`  navigate CTA executed; url=${page.url()}`);
          expect(page.url()).toContain(spec.expect_route_prefix);
          await page.goBack().catch(() => undefined);
        } else {
          throw new Error(`expected a navigate action chip on "${spec.prompt}", none rendered`);
        }
      }
    }

    // Census must have been fetched at least once (parallel with S0).
    const census_calls = await page.evaluate(() => (window as DebugWindow).__loop_debug!.routes_census_calls);
    expect(census_calls).toBeGreaterThan(0);

    // Worker KV/debug telemetry — logged for the report, not asserted.
    const worker_debug = await page.evaluate(() => (window as DebugWindow).__loop_debug!.worker_debug);
    for (const line of worker_debug.filter((l) => /kv_cache|cache/i.test(l)).slice(0, 10)) {
      log(`  ${line.slice(0, 200)}`);
    }

    console.log("[parity-results]", JSON.stringify(results, null, 2));
  });
});
