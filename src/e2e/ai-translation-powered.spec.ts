/**
 * E2E Suite — AI evidence harness: `translation_test_score` case.
 *
 * Measures the POWERED engine of the i18n.translationEditor sheet on the
 * REAL stack (persistent Edge profile + WebGPU + Cache API persistence):
 * per-language suggest-call wall times and answer quality for a known-gold
 * label, then persists the evidence to `ai_models.test_scores` via the
 * canonical mergeTestScoreTurns writer — the same pipeline as
 * regex_test_score/guide_react_test_score.
 *
 * Why this spec exists: the node-side model probes run pure WASM and are
 * blind to the browser WebGPU path — the `qwen3_5` ONNX arch has prior
 * DB evidence of unsupported-op CPU fallback (~75s+/call at 2B). This
 * harness measures the real device path and keeps the evidence current.
 *
 * Determinism: poll DOM evidence in ≤5s slots; model-load phase polls up to
 * 8min (cold download ~1.4GB, warm = seconds); each suggest call polls up
 * to 120s — a timeout is itself the evidence (score 0).
 * The label set uses gold answers probed on CPU: Private →
 * Privato (it-IT) / Privé (fr-FR) / Privat (de-DE).
 * Auth: shared Edge profile + ephemeral E2E test-actor login (MFA factors
 * deleted via DB in beforeAll). Requires WebGPU — skips cleanly otherwise.
 * Locators: data-testid only.
 */
import { test, expect, type Locator } from "@playwright/test";
import { appendFileSync } from "node:fs";
import {
  deleteMfaFactorsByUsername,
  setAuthMethodEnforcerDismissed,
} from "./helpers/db";
import {
  E2E_ADMIN_USERNAME,
  E2E_ADMIN_PASSWORD,
} from "./helpers/admin-login";
import { mergeTestScoreTurns, type E2ETurn } from "./helpers/test-scores";
import { getSharedContext, focusedPage } from "./helpers/edge-context";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const DICT_URL = `${BASE_URL}/crm/settings/customer_types`;
// MUST match POWERED_MODEL_ID in
// src/lib/shell/sheets/panels/TranslationEditorPanel.svelte — the POC
// hardcodes the model; the evidence must land on the same ai_models row.
const POWERED_MODEL_ID = "onnx-community/granite-4.0-micro-ONNX-web#q4f16";

const log = (m: string) => {
  const line = `[spec] ${new Date().toISOString().slice(11, 19)} ${m}`;
  console.log(line);
  // Mirror to a file — reporter buffers test stdio and the timeout kill
  // loses it all; the file survives and gives the full timeline.
  try {
    appendFileSync("test-results/ai-translation-powered.log", line + "\n");
  } catch {
    /* reporter-only fallback */
  }
};

/** Poll `fn` in ≤5s slots until truthy or `capMs` elapses — the declared
 *  generation-phase wait (never a blind sleep). `null` on timeout. */
async function poll<T>(
  fn: () => Promise<T | null>,
  capMs: number,
  label: string,
): Promise<T | null> {
  const deadline = Date.now() + capMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) {
      log(`  poll timeout after ${(capMs / 1000).toFixed(0)}s: ${label}`);
      return null;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// ─── Turn definitions — gold answers from the CPU probe ────────────────────
type TurnSpec = { lang: string; expected: string };
const SOURCE_LABEL = "Private";
const TURNS: TurnSpec[] = [
  { lang: "it-IT", expected: "Privato" },
  { lang: "fr-FR", expected: "Privé" },
  { lang: "de-DE", expected: "Privat" },
];

function scoreTurn(
  spec: TurnSpec,
  actual: string | null,
  timedOut: boolean,
): Pick<E2ETurn, "score" | "verdict" | "reason"> {
  if (timedOut || actual === null) {
    return {
      score: 0,
      verdict: "fail",
      reason: timedOut ? "suggest timed out (>120s)" : "no suggestion rendered",
    };
  }
  const norm = (s: string) => s.trim().toLowerCase();
  if (norm(actual) === norm(spec.expected)) {
    return { score: 5, verdict: "pass", reason: `exact: ${actual}` };
  }
  return actual.trim()
    ? { score: 3, verdict: "partial", reason: `non-empty but off-gold: ${actual}` }
    : { score: 0, verdict: "fail", reason: "empty suggestion" };
}

/** Click the per-language suggest CTA and wait for the suggestion box —
 *  returns the wall time (s), the suggestion text, and the timeout flag. */
async function timedSuggest(
  page: Locator,
  lang: string,
): Promise<{ response_s: number; text: string | null; timed_out: boolean }> {
  const cta = page.getByTestId(`i18n-editor-ai-suggest-${lang}`);
  const box = page.getByTestId(`i18n-editor-suggestion-${lang}`);
  const t0 = Date.now();
  await cta.click({ timeout: 5000 });
  const rendered = await poll(
    async () => ((await box.count()) > 0 ? true : null),
    120_000,
    `suggestion ${lang}`,
  );
  const response_s = (Date.now() - t0) / 1000;
  if (!rendered) return { response_s, text: null, timed_out: true };
  const text = (await box.innerText()).trim();
  return { response_s, text, timed_out: false };
}

test.describe("AI evidence — translation_test_score (powered)", () => {
  test.describe.configure({ timeout: 900_000 });

  test.beforeAll(async () => {
    await deleteMfaFactorsByUsername(E2E_ADMIN_USERNAME);
    await setAuthMethodEnforcerDismissed(E2E_ADMIN_USERNAME, true);
  });

  test("powered suggest: per-lang timing + gold answers → persist translation_test_score", async () => {
    const { context } = await getSharedContext();
    const page = await focusedPage(context);
    const workerLogs: string[] = [];
    page.on("console", (m) => {
      const s = m.text();
      // [ai-*] catches ai-err (load_error surface) + ai-worker debug — the
      // previous filter missed [ai-err] entirely, making a fast load
      // failure indistinguishable from a slow load.
      if (s.includes("[ai-") || s.includes("load_")) workerLogs.push(s.slice(0, 300));
    });

    // 0. Auth gate (same canonical flow as the regex quality spec).
    const isAuthed = () =>
      page.evaluate(async () => {
        try {
          return (await fetch("/api/v1/auth/me")).ok;
        } catch {
          return false;
        }
      });
    await page.goto(DICT_URL);
    log("landed: " + page.url());
    const langNow = await page.evaluate(() => sessionStorage.getItem("pb.lang"));
    if (langNow !== "en-GB") {
      await page.evaluate(() => sessionStorage.setItem("pb.lang", "en-GB"));
      await page.reload();
      log("pb.lang=en-GB set — reloaded");
    }
    if (!(await isAuthed())) {
      log("session expired — logging in as E2E test admin");
      await page.goto(`${BASE_URL}/login`);
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
      await poll(async () => ((await isAuthed()) ? true : null), 60_000, "auth/me");
      await page.goto(DICT_URL);
    }

    // MFA-enforcer prompt ("Secure your account") can survive the DB flag
    // (session-level state) and overlays the page — every click beneath it
    // hangs forever. Dismiss it before driving the dict UI (canonical
    // pattern from ai-regex-quality.spec.ts).
    const enforcerDismiss = page.getByTestId("auth-method-enforcer-dismiss-button");
    try {
      await enforcerDismiss.waitFor({ state: "visible", timeout: 5000 });
      await enforcerDismiss.click({ timeout: 5000 });
      await enforcerDismiss.waitFor({ state: "hidden", timeout: 5000 });
      log("MFA enforcer dismissed");
    } catch {
      await enforcerDismiss.waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
    }

    // 1. Draft row → stable custom.* key → languages CTA → sheet mounts.
    await expect(page.getByTestId("entity-dict-page")).toBeVisible({ timeout: 5000 });

    // WebGPU gate — the powered path is meaningless without it (worker
    // would fall back to a different runtime than the user's real one).
    // AFTER the page is proven rendered: a requestAdapter on a cold
    // persistent-Edge compositor can hang OR crash the renderer (blank
    // page, DOM alive) — a warm page is the safer caller. 5s budget: a
    // hung adapter request is a PROBLEM — surface it, never wait forever.
    const webgpu = await Promise.race([
      page.evaluate(
        async () => "gpu" in navigator && (await navigator.gpu.requestAdapter()) !== null,
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("WebGPU adapter request hung >5s")), 5000),
      ),
    ]);
    test.skip(!webgpu, "WebGPU adapter not available");
    // Cold-session first mount: create.single needs meta.actions + the
    // permission store — both resolve client-side and can lag well past
    // the 5s slot on a freshly relaunched persistent profile (observed:
    // meta+perms resolve anywhere in 3-20s on cold session). Declared
    // bounded wait — generous, never unbounded.
    const addBtn = page.getByTestId("dict-toolbar-add");
    await poll(async () => ((await addBtn.count()) > 0 ? true : null), 45_000, "dict-toolbar-add mount");
    await addBtn.click({ timeout: 5000 });
    const keyCell = page.getByTestId("dict-cell-label-key").first();
    const languagesCta = keyCell.getByTestId("dict-cell-translations");
    await page.locator('[data-dict-cell="code"] input').first().fill("e2e_ai", { timeout: 5000 });
    await keyCell.click({ timeout: 5000 });
    const searchBox = page.getByPlaceholder(/entities\.customer_type\.rows\./);
    await searchBox.fill("custom.entities.customer_type.rows.e2e_ai", { timeout: 5000 });
    await searchBox.press("Enter", { timeout: 5000 });
    await expect(languagesCta).toBeEnabled({ timeout: 5000 });
    await languagesCta.click({ timeout: 5000 });
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByTestId("i18n-editor-key")).toBeVisible({ timeout: 5000 });

    // 2. Type the EN source label — previewValue resolves from the draft.
    const tSheet = Date.now();
    await sheet.getByTestId("i18n-editor-value-en-GB").fill(SOURCE_LABEL, { timeout: 5000 });
    await expect(sheet.getByTestId("i18n-editor-base")).toHaveValue(SOURCE_LABEL, {
      timeout: 5000,
    });

    // 3. Arm the missing-language rows (it/fr/de) via the coverage chips.
    for (const { lang } of TURNS) {
      await sheet.getByTestId(`i18n-editor-missing-${lang}`).click({ timeout: 5000 });
      await expect(sheet.getByTestId(`i18n-editor-row-${lang}`)).toBeVisible({ timeout: 5000 });
    }

    // 4. Toggle powered — the prefetch started at sheet mount; the dot
    //    flips to ready when the ONNX session is actually up.
    await sheet.getByTestId("i18n-editor-engine-powered").click({ timeout: 5000 });
    let lastTitle = "";
    const ready = await poll(async () => {
      const dot = sheet.getByTestId("i18n-editor-powered-status");
      const title = await dot.getAttribute("title").catch(() => null);
      // Log every title transition — an error state surfaces here as the
      // raw error string, and "loading" vs "idle" shows whether the
      // worker load is actually in flight.
      if (title && title !== lastTitle) {
        lastTitle = title;
        log(`powered status: ${title}`);
      }
      return title?.includes("ready") ? title : null;
    }, 300_000, "powered model ready");
    const load_s = (Date.now() - tSheet) / 1000;
    log(`powered model ready: ${load_s.toFixed(1)}s from sheet open (${ready})`);
    if (!ready) log(`worker console tail: ${JSON.stringify(workerLogs.slice(-15))}`);
    expect(ready).toBeTruthy();

    // 5. Timed suggest per language — the response_s IS the evidence.
    const turns: (E2ETurn & { actual: string | null })[] = [];
    for (const [i, spec] of TURNS.entries()) {
      const { response_s, text, timed_out } = await timedSuggest(sheet, spec.lang);
      const verdict = scoreTurn(spec, text, timed_out);
      turns.push({
        n: i + 1,
        prompt: `${SOURCE_LABEL} · en-GB → ${spec.lang}`,
        expected: spec.expected,
        actual: text,
        response_s,
        ...verdict,
      });
      log(
        `  ${spec.lang}: ${response_s.toFixed(1)}s — ${verdict.reason} (score=${verdict.score})`,
      );
    }

    // 6. Evidence → ai_models.test_scores.translation_test_score.
    const device =
      workerLogs.find((s) => s.includes('"device"') || s.includes("device:")) ??
      workerLogs.find((s) => s.includes("load_started")) ??
      "device not captured in console";
    log(`worker device evidence: ${device}`);
    const res = await mergeTestScoreTurns(
      POWERED_MODEL_ID,
      "translation_test_score",
      "suggest",
      turns,
    );
    log(
      `[translation_test_score] ${POWERED_MODEL_ID}: score=${res.score.toFixed(2)} rank=${res.rank} (load_s=${load_s.toFixed(1)})`,
    );
    log(`TURNS_JSON ${JSON.stringify(turns)}`);

    // 7. MEANING disambiguation — the hint must drive the output, not the
    //    literal label (granite probe: only the re-framed prompt shape
    //    honors it). Use a language never suggested in this run: the
    //    suggestion box of an already-suggested lang stays MOUNTED, so
    //    timedSuggest would read its stale text instead of waiting for
    //    the regeneration. "Private" + "physical person" meaning must
    //    steer the suggestion AWAY from the literal translation.
    await sheet.getByTestId("i18n-editor-missing-es-ES").click({ timeout: 5000 });
    await expect(sheet.getByTestId("i18n-editor-row-es-ES")).toBeVisible({ timeout: 5000 });
    await sheet
      .getByTestId("i18n-editor-meaning")
      .fill("a physical person, not a company", { timeout: 5000 });
    const meaningTurn = await timedSuggest(sheet, "es-ES");
    log(
      `  es-ES+meaning: ${meaningTurn.response_s.toFixed(1)}s — "${meaningTurn.text}"`,
    );
    expect(meaningTurn.text).toMatch(/person/i);
    // The browser is intentionally left open for reuse via CDP :9333.
  });
});
