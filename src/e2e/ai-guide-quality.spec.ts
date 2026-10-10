/**
 * E2E Suite — AI quality harness: `guide_test_score` case.
 *
 * Runs a 5-turn documentation Q&A session against the smart-guide assistant
 * (global Lighthouse CTA in the app top bar — no feature page required),
 * against the REAL live RAG pipeline (no route interception): Italian question
 * → English rewrite → embedding worker → /ws/ai/api/v1/system/docs/search →
 * grounded answer with source citations.
 *
 * Determinism: NO blind sleeps — every step polls DOM evidence in ≤5s slots,
 * ≤6 retries (30s cap per step). The ONLY exception is the model download:
 * while data-ai-phase is a `loading_*` phase the wait extends to 8min max,
 * still polling every 5s to catch `ready` ASAP.
 *
 * Scoring v2 — semantic blend + deterministic flags (calibrated on 6 runs,
 * see ai-plans/guide-score-recalibration-and-retests.md):
 *   covered answered : clamp(1.8 + 4.5·(0.35·faithfulness + 0.45·corr_max
 *                      + 0.20·entity_precision) − penalties, 0, 5)
 *   penalties        : 1.2·protocol_debris + 1.0·spurious_citation
 *                      + 0.6·language_mix + 0.5·over_prose
 *   uncovered        : fabricated→0 | "Non lo so"→5 | idk+spurious cites→3.5
 *   covered "Non lo so" (false-IDK) → 1.0
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
import { semanticScore } from "./helpers/semantic-scorer";
import { getPool } from "./helpers/db";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const PREFIX = "smart-guide-ai";
const CASE_KEY = "guide_react_test_score";
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
  /** Retrieval quality baseline: outer array = required groups, inner =
   *  alternates (any substring match on a cited source href counts as a
   *  hit). Evidence only — recorded in the turn's `source_hits`, does not
   *  change the score formula. */
  expected_sources?: string[][];
  /** Routes a navigate action may legitimately point to (prefix match).
   *  An action outside this set is flagged in `action_off`; no assertion on
   *  count — zero actions is always acceptable. */
  allowed_actions?: string[];
};

const TURNS: TurnSpec[] = [
  {
    prompt: "come faccio a creare un utente?",
    expected: "UI procedure to create a user under /system/settings/users",
    keywords: ["utent", "crea"],
    expected_sources: [["manual/users-create", "manual/users"]],
    allowed_actions: ["/system/settings/users"],
  },
  {
    prompt: "cosa significa IDP Code?",
    expected: "IDP Code is the identity-provider subject (JWT sub) identifier",
    keywords: ["idp"],
    expected_sources: [["api-reference", "entity-field-reference", "manual/users"]],
    allowed_actions: ["/system/settings/users"],
  },
  {
    prompt: "come funzionano i permessi e la RBAC?",
    expected: "Wildcard-based RBAC permission system with roles and admin bypass",
    keywords: ["permess", "ruol"],
    expected_sources: [["rbac", "authentication"]],
    allowed_actions: ["/system/settings/roles", "/system/settings/modules", "/system/settings/ai"],
  },
  {
    prompt: "come rendo un utente admin?",
    expected: "Assign the administrators role to the user",
    keywords: ["admin|amministr"],
    expected_sources: [["manual/users", "manual/roles", "rbac", "entity-field-reference"]],
    allowed_actions: ["/system/settings/users", "/system/settings/roles"],
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
async function lastAnswer(page: Page): Promise<{
  text: string; sources: number; actions: number; source_hrefs: string[]; action_routes: string[];
}> {
  const answers = page.locator(`[data-testid^="${PREFIX}-answer-"]`);
  const count = await answers.count();
  if (!count) return { text: "", sources: 0, actions: 0, source_hrefs: [], action_routes: [] };
  const last = answers.last();
  const text = ((await last.textContent()) ?? "").trim();
  // Debug: dump the bubble's inner HTML so we can compare DOM content vs
  // the parsed message content (markdown render vs truncation upstream).
  const html = await last.innerHTML().catch(() => "");
  if (html) log(`    [dom] ${html.slice(0, 400)}`);
  // Sources/actions are siblings of the answer bubble — scope to the last
  // answer's wrapper or the previous turn's citations leak in.
  const wrap = last.locator("xpath=..");
  const sourceEls = wrap.locator(`[data-testid="${PREFIX}-sources"] a`);
  const source_hrefs = await sourceEls.evaluateAll(
    (els) => els.map((a) => a.getAttribute("href") ?? "").filter(Boolean),
  ).catch(() => [] as string[]);
  const sources = source_hrefs.length || await sourceEls.count().catch(() => 0);
  const actionEls = wrap.locator('[data-testid="ai-actions"] [data-testid^="ai-action-"]');
  const action_routes = await actionEls.evaluateAll(
    (els) => els.map((a) => a.getAttribute("data-route") ?? "").filter(Boolean),
  ).catch(() => [] as string[]);
  const actions = (await actionEls.count().catch(() => 0)) || action_routes.length;
  return { text, sources, actions, source_hrefs, action_routes };
}

/**
 * Send one turn; wait ≤30s for the typing indicator to disappear after it
 * appeared (or for a new answer bubble to land). Records wall-clock latency.
 */
async function sendTurn(page: Page, prompt: string): Promise<{
  response_s: number; answer: string; sources: number; actions: number;
  source_hrefs: string[]; action_routes: string[]; timed_out: boolean;
}> {
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
    }, "guide answer", 36); // the agentic loop serializes model turns; each worker gen has a 90s internal cap — allow 180s
    // Let actions/sources finish rendering (same bounded slot).
    await new Promise((r) => setTimeout(r, 1500));
  } catch {
    timed_out = true;
  }
  const { text, sources, actions, source_hrefs, action_routes } = await lastAnswer(page);
  return { response_s: (Date.now() - t0) / 1000, answer: text, sources, actions, source_hrefs, action_routes, timed_out };
}

/** Load the cited docs' chunk contents — the context faithfulness is
 *  measured against. Citation hrefs are `https://docs.primebrick.dev/<path>`
 *  (no extension); docs_kb rows are keyed by `<path>.mdx`. */
async function citedContexts(source_hrefs: string[]): Promise<string[]> {
  const paths = source_hrefs
    .map((h) => h.replace(/^https?:\/\/[^/]+\//, ""))
    .map((p) => (p.endsWith(".mdx") ? p : `${p}.mdx`));
  if (!paths.length) return [];
  const { rows } = await getPool().query<{ content: string }>(
    "SELECT content FROM ai.docs_kb WHERE path = ANY($1) ORDER BY path, chunk_idx",
    [paths],
  );
  return rows.map((r) => r.content);
}

// ─── Scoring v2 — deterministic flags + recalibrated blend ──────────────────
// Calibrated offline on 6 persisted runs (see ai-plans/guide-score-recalibration-
// and-retests.md). All signals are deterministic; no LLM judge.
//
//   covered answered : clamp(1.8 + 4.5·(0.35·faith + 0.45·corrM + 0.20·ent)
//                            − 1.2·debris − 1.0·spuria − 0.6·lang − 0.5·prose, 0, 5)
//   uncovered        : fabricated→0 | "Non lo so"→5 | idk+spurious sources→3.5
//   covered "Non lo so" (false-IDK) → 1.0

let translationVocab: string | null = null;
/** All translation values — ground truth for UI labels cited in answers. */
async function uiLabelVocab(): Promise<string> {
  if (translationVocab === null) {
    const { rows } = await getPool().query<{ value: string }>(
      "SELECT DISTINCT value FROM system.translations WHERE value IS NOT NULL AND value <> ''",
    );
    translationVocab = rows.map((r) => r.value).join("\n").toLowerCase();
  }
  return translationVocab;
}

/** Trailing JSON residue / leaked ReAct protocol keywords in the final answer. */
function protocolDebris(answer: string): number {
  const tail = answer.trim().slice(-80);
  const trailing = /["}]\s*$/.test(tail) && /[{"]/.test(tail) ? 1 : 0;
  const leak = /\b(Thought|Action|Observation|Action Input|Final)\s*:/i.test(answer) ? 1 : 0;
  return Math.min(trailing + leak, 1);
}

/** Entity-like spans: quoted/bolded labels ≤3 words, /paths, CamelCase, ALLCAPS,
 *  mid-sentence capitalized words. Sentence fragments excluded. */
function extractEntities(answer: string): string[] {
  const ents = new Set<string>();
  const add = (x: string) => {
    const t = x.trim().replace(/[.,;:]+$/, "");
    if (t.split(/\s+/).length <= 3 && t.length <= 40 && t.length >= 2) ents.add(t);
  };
  for (const m of answer.matchAll(/\*\*([^*\n]{2,60})\*\*/g)) add(m[1]);
  for (const m of answer.matchAll(/["'`]([^"'`\n]{2,60})["'`]/g)) add(m[1]);
  for (const m of answer.matchAll(/\/[\w\-/.]{4,60}/g)) add(m[0]);
  for (const m of answer.matchAll(/\b[A-Z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]*)+\b/g)) add(m[0]);
  for (const m of answer.matchAll(/\b[A-Z]{2,}\b/g)) add(m[0]);
  for (const m of answer.matchAll(/(?<= )[A-ZÀÈÉÌÒÙ][a-zàèéìòù]{3,}(?=[ ,.;:]|$)/gm)) {
    if (!/[.!?\n]\s*$/.test(answer.slice(Math.max(0, m.index - 3), m.index))) add(m[0]);
  }
  return [...ents];
}

/** Fraction of extracted entities found in cited chunks + UI translations. */
function entityPrecision(answer: string, groundTruth: string): { p: number; missing: string[] } | null {
  const ents = extractEntities(answer);
  if (!ents.length) return null;
  const gt = groundTruth.toLowerCase();
  const missing = ents.filter((e) => !gt.includes(e.toLowerCase()));
  return { p: (ents.length - missing.length) / ents.length, missing };
}

/** EN function-word ratio outside quoted spans (UI labels whitelisted by quote-strip). */
function languageMix(answer: string): number {
  const bare = answer.replace(/["'`*][^"'`\n]*["'`*]/g, " ");
  const en = (bare.match(/\b(the|is|are|to|and|with|for|click|button|field|list|page|save|new|name|email)\b/gi) ?? []).length;
  const it = (bare.match(/\b(il|lo|la|di|da|in|con|su|per|tra|fra|clicca|pulsante|campo|ruolo|utente|lista|pagina|salva|nuovo|nome|seleziona)\b/gi) ?? []).length;
  return en + it === 0 ? 0 : en / (en + it);
}

const overProse = (a: string) => (a.length > 600 ? 1 : a.length > 400 ? 0.5 : 0);

async function scoreTurn(
  spec: TurnSpec,
  answer: string,
  sources: number,
  timed_out: boolean,
  source_hrefs: string[],
): Promise<Pick<E2ETurn, "score" | "verdict" | "reason">> {
  if (timed_out) return { score: 0, verdict: "fail", reason: "response_timeout" };
  const lower = answer.toLowerCase();
  // Match explicit no-knowledge phrases — NOT the bare word "documentazione"
  // (a correct grounded answer may legitimately mention the docs).
  const noDoc = /non lo so|i don't know|documentazione non contiene|non è (?:presente|disponibile) nella documentazione|non posso aiutarti|documentation does not contain|not covered by (?:the )?documentation/.test(lower);
  // Did the rendered citations hit any expected source group? (spurious
  // citations = sources shown but none on-target).
  const srcHits = (spec.expected_sources ?? []).filter((alts) =>
    alts.some((a) => source_hrefs.some((h) => h.includes(a))),
  ).length;
  const spuria = sources > 0 && (spec.expected_sources?.length ?? 0) > 0 && srcHits === 0 ? 1 : 0;

  if (spec.uncovered) {
    if (!noDoc)
      return { score: 0, verdict: "fail", reason: `fabricated answer on uncovered question (${sources} sources)` };
    if (sources > 0)
      return { score: 3.5, verdict: "partial", reason: `correct no-documentation fallback but spurious citations (${sources})` };
    return { score: 5, verdict: "pass", reason: "correct no-documentation fallback" };
  }
  if (!answer) return { score: 0, verdict: "fail", reason: "empty answer" };
  if (noDoc)
    return { score: 1, verdict: "fail", reason: "false no-documentation fallback on a covered question" };

  // Semantic sub-scores + deterministic flags.
  const ctx = await citedContexts(source_hrefs);
  const sem = await semanticScore(spec.prompt, answer, spec.expected, ctx);
  const vocab = await uiLabelVocab();
  const ent = entityPrecision(answer, ctx.join("\n") + "\n" + vocab);
  const debris = protocolDebris(answer);
  const lang = languageMix(answer);
  const prose = overProse(answer);

  const base = 0.35 * sem.faithfulness + 0.45 * sem.correctness_max + 0.2 * (ent?.p ?? 1);
  const pen = 1.2 * debris + 1.0 * spuria + 0.6 * lang + 0.5 * prose;
  const score = Math.max(0, Math.min(5, Math.round((1.8 + 4.5 * base - pen) * 100) / 100));

  const hits = spec.keywords.filter((k) => k.split("|").some((alt) => lower.includes(alt)));
  const reason =
    `rel=${sem.relevance.toFixed(2)} faith=${sem.faithfulness.toFixed(2)} ` +
    `corrM=${sem.correctness_max.toFixed(2)} ent=${ent ? ent.p.toFixed(2) : "n/a"}` +
    `${ent?.missing.length ? ` miss:[${ent.missing.slice(0, 4).join(",")}]` : ""} ` +
    `debris=${debris} spuria=${spuria} lang=${lang.toFixed(2)} prose=${prose} ` +
    `kw=${hits.length}/${spec.keywords.length} src=${sources} ctx=${ctx.length}`;
  if (score >= 4) return { score, verdict: "pass", reason };
  if (score >= 2) return { score, verdict: "partial", reason };
  return { score, verdict: "fail", reason };
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
      if (req.url().includes("/ws/ai/api/v1/system/docs/search")) log("→ docs/search request");
    });
    page.on("pageerror", (e) => log(`pageerror: ${e.message}`));
    let pendingGuideStage: string | null = null;
    let turnTrace: Array<Record<string, unknown>> = [];
    // Worker telemetry: capture prompt/generated token counts so answer
    // truncation can be attributed to the token budget vs model EOS.
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        log(`[console.${msg.type()}] ${msg.text().slice(0, 300)}`);
        return;
      }
      // console.debug('[ai-worker]', step, obj) — inspect args, not text().
      // [guide-loop] stage logs pair a stage marker with a JSON payload arg;
      // capture them into the per-turn agent trace persisted in test_scores.
      for (const arg of msg.args()) {
        void arg
          .jsonValue()
          .then((v) => {
            if (typeof v === "string" && v.startsWith("[guide-loop] ")) {
              pendingGuideStage = v.slice(13).trim();
              return;
            }
            if (pendingGuideStage) {
              try {
                turnTrace.push({ stage: pendingGuideStage, ...JSON.parse(v as string) });
              } catch {
                turnTrace.push({ stage: pendingGuideStage, raw_arg: String(v).slice(0, 2000) });
              }
              pendingGuideStage = null;
            }
            if (typeof v === "string" && v.length > 60) {
              log(`[str] ${JSON.stringify(v)}`);
              return;
            }
            const j = v as Record<string, unknown> | null;
            const d = (j?.data ?? j) as Record<string, unknown> | null;
            if (d && d.step === "gen_done") {
              log(
                `[gen_done] interrupted=${d.streamer_interrupted} max=${d.requested_max_new_tokens} len=${d.raw_len} reason=${d.reason_chars} tail=…${JSON.stringify(d.raw_tail)}`,
              );
              if (typeof d.raw_text === "string") log(`[raw] ${JSON.stringify(d.raw_text)}`);
            } else if (d && d.step === "prof_env") {
              log(`[prof_env] ${JSON.stringify(d)}`);
            } else if (d && d.step === "profile_stats") {
              log(`[prof] fwd_calls=${d.fwd_calls} fwd_ms=${d.fwd_ms} kernels=${d.kernels} gpu_ms=${d.gpu_ms}`);
            } else if (d && d.step === "prompt_tail") {
              log(`[prompt] len=${d.len} has_tools=${d.has_tools} tail=…${JSON.stringify(d.tail)}`);
            } else if (d && (d.step === "kv_cache_pipeline" || d.step === "gen_enter" || d.prompt_token_count)) {
              log(
                `[tok] step=${d.step ?? "measure"} prompt=${d.prompt_token_count ?? "?"} gen=${d.tokens_generated ?? "?"} tps=${d.tokens_per_second ?? "?"} cache=${d.kv_cache_seq_length ?? d.cache_len_before_gen ?? "?"} msgs=${d.num_messages ?? "?"}`,
              );
            }
          })
          .catch(() => undefined);
      }
    });
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
        turnTrace = [];
        const { response_s, answer, sources, actions, source_hrefs, action_routes, timed_out } =
          await sendTurn(page, spec.prompt);
        const verdict = await scoreTurn(spec, answer, sources, timed_out, source_hrefs);
        // Retrieval-quality evidence (baseline, non-scoring): how many
        // expected source-groups were actually cited, and whether emitted
        // action routes stay inside the allowed set for this turn.
        const src_hits = (spec.expected_sources ?? [])
          .filter((alts) => alts.some((a) => source_hrefs.some((h) => h.includes(a)))).length;
        const src_total = spec.expected_sources?.length ?? 0;
        const action_off = action_routes.filter(
          (r) => !(spec.allowed_actions ?? []).some((p) => r.startsWith(p)),
        );
        log(
          `  turn ${i + 1}: ${verdict.verdict} score=${verdict.score} ` +
          `${response_s.toFixed(1)}s sources=${sources} actions=${actions} ` +
          `src_hits=${src_hits}/${src_total} action_off=[${action_off}] — ${verdict.reason}`,
        );
        log(`    answer (${answer.length} chars): ${answer.replace(/\n/g, " ")}`);
        log(`    sources: ${source_hrefs.join(", ")}`);
        log(`    actions: ${action_routes.join(", ")}`);
        turns.push({
          n: i + 1, prompt: spec.prompt, expected: spec.expected,
          actual: answer.slice(0, 2000), response_s, ...verdict,
          source_hrefs, action_routes, src_hits, src_total, action_off,
          agent_trace: turnTrace,
        } as E2ETurn);
      }

      // 3. Persist measured turns (aggregates are computed at read time).
      const result = await mergeTestScoreTurns(model_id, CASE_KEY, "conversation", turns);
      log(`persisted ${CASE_KEY}: score=${result.score.toFixed(2)} rank=${result.rank ?? "n/a"} turns=${result.total_turns}`);

      const failed = turns.filter((t) => t.verdict === "fail");
      expect(failed.map((t) => `T${t.n}:${t.reason}`)).toEqual([]);
    }
  });
});
