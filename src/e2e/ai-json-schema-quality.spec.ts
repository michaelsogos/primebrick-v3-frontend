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
 * evidence in ≤5s slots, ≤12 retries (60s cap per step). Model load uses
 * data-ai-phase (≤5s slots, ≤120 retries = 10min cap).
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
 * Auth: persistent headed Edge profile (login+MFA done once by a human).
 * Requires WebGPU — skips cleanly when no adapter is present.
 * Locators: data-testid only (brittle-on-purpose convention).
 */
import {
  test as base,
  expect,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const PAGE_URL = "/system/settings/configurations/create";
const E2E_PROFILE = "D:\\git\\primebrick\\temp\\pw-edge-profile";
const PREFIX = "smart-json-ai";

const log = (m: string) => console.log(`[spec] ${new Date().toISOString().slice(11, 19)} ${m}`);

const test = base.extend<object, { pwContext: BrowserContext }>({
  // eslint-disable-next-line no-empty-pattern
  pwContext: [
    async ({}, use) => {
      const ctx = await chromium.launchPersistentContext(E2E_PROFILE, {
        channel: "msedge",
        headless: false,
        viewport: { width: 1440, height: 900 },
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

// ─── Scoring (local copy of the documented formulas) ─────────────────────────

function turnSpeedScore(response_s: number): number {
  if (response_s <= 3) return 5;
  if (response_s <= 5) return 4;
  if (response_s <= 7) return 3;
  if (response_s <= 9) return 2;
  if (response_s <= 10) return 1;
  return 0;
}

type TurnResult = {
  n: number;
  prompt: string;
  expected: string;
  actual: string | null;
  score: number;
  verdict: "pass" | "partial" | "fail";
  reason: string;
  response_s: number;
};

function caseMetrics(scores: number[], times: number[]) {
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const successCount = scores.filter((s) => s >= 4).length;
  const quality = mean * 0.6 + (successCount / scores.length) * 5 * 0.4;
  const speed = times.map(turnSpeedScore).reduce((a, b) => a + b, 0) / times.length;
  return {
    quality,
    speed,
    score: quality * 0.8 + speed * 0.2,
    success: `${successCount}/${scores.length}`,
  };
}

/** Aggregate any *_test_score case from stored turns (same formulas). */
function caseScoreFromStored(caseObj: Record<string, unknown>): number | null {
  const turns = Array.isArray(caseObj.turns) ? (caseObj.turns as { score?: number; response_s?: number }[]) : [];
  const scores = turns.map((t) => t.score).filter((s): s is number => typeof s === "number");
  const times = turns.map((t) => t.response_s).filter((s): s is number => typeof s === "number");
  if (!scores.length) return null;
  const m = caseMetrics(scores, times.length ? times : scores.map(() => 1));
  return m.score;
}

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

/** Poll a predicate in ≤5s slots for up to maxRetries (default 12 → 60s). */
async function poll<T>(fn: () => Promise<T | null>, what: string, maxRetries = 12): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    const out = await fn().catch(() => null);
    if (out !== null && out !== false) return out;
    await new Promise((r) => setTimeout(r, 5000));
    if (i % 4 === 3) log(`  still waiting: ${what} (${(i + 1) * 5}s)`);
  }
  throw new Error(`Timeout waiting for ${what} (${maxRetries * 5}s)`);
}

async function waitPanelPhase(page: Page, want: string, maxRetries = 120): Promise<string> {
  const panel = page.locator(`[data-testid="${PREFIX}-panel"]`);
  return poll(async () => {
    const phase = await panel.getAttribute("data-ai-phase");
    if (phase === "webgpu_required" || phase === "error") throw new Error(`panel phase "${phase}"`);
    return phase === want ? phase : null;
  }, `data-ai-phase=${want}`, maxRetries);
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
    }, "turn response", 12);
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
  test.describe.configure({ timeout: 1_200_000 }); // cold model download can take minutes

  test("5-turn incremental schema edit → persist json_editor_with_schema_test_score", async ({ page, pwContext }) => {
    // 1. Open the config-create form — WebGPU check must run on the real
    //    origin (about:blank reports no adapter in headed Edge). If the
    //    profile session expired, the first goto lands on the Casdoor/MFA
    //    flow: re-navigate in ≤5s slots, ≤12 retries (60s) while the human
    //    completes MFA.
    await page.goto(PAGE_URL);
    log("landed: " + page.url());
    test.skip(
      !(await page.evaluate(async () => "gpu" in navigator && (await navigator.gpu.requestAdapter()) !== null)),
      "WebGPU adapter not available",
    );
    await poll(async () => {
      if (await page.locator('[data-testid="config-create-key"]').isVisible().catch(() => false)) return true;
      if (!page.url().includes("/system/settings/configurations/create")) {
        await page.goto(PAGE_URL).catch(() => {});
      }
      return null;
    }, "config-create-key visible", 12);

    await page.locator('[data-testid="config-create-key"]').fill("e2e_json_quality_probe");
    // type defaults to 'string' → TypeConfigBuilder/JsonPreviewEditor render
    // immediately, no ComboSelect interaction needed.
    await expect(page.locator('[data-testid="tcb-ai-assistant-cta"]')).toBeVisible({ timeout: 5000 });
    log("form ready");

    // 2. Open the assistant sheet, wait for the model (data-ai-phase).
    await page.locator('[data-testid="tcb-ai-assistant-cta"]').click();
    log("assistant sheet opened, waiting for model…");
    await waitPanelPhase(page, "ready");
    log("model ready");

    // Discover the model_id via the selector's selected menu item.
    await page.locator(`[data-testid="${PREFIX}-model-trigger"]`).click();
    const model_id = await poll(async () => {
      const items = page.locator(`[data-testid^="${PREFIX}-model-"]`);
      for (const item of await items.all()) {
        const cls = await item.getAttribute("class");
        const checked = await item.getAttribute("aria-checked");
        if (checked === "true" || (cls ?? "").includes("bg-accent")) {
          return (await item.getAttribute("data-testid"))!.replace(`${PREFIX}-model-`, "");
        }
      }
      return null;
    }, "selected model id", 12);
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
    }

    // 4. Persist the case under json_editor_with_schema_test_score and
    //    recompute rank = mean over all *_test_score cases.
    const api = pwContext.request;
    const listRes = await api.get("/api/v1/entities/ai_model/list?page_size=100");
    expect(listRes.ok()).toBeTruthy();
    const { rows } = (await listRes.json()) as { rows: Record<string, unknown>[] };
    const model = rows.find((r) => r.model_id === model_id);
    expect(model, `model ${model_id} not in ai_model list`).toBeTruthy();

    const metrics = caseMetrics(
      turns.map((t) => t.score),
      turns.map((t) => t.response_s),
    );
    const existing = (model!.test_scores ?? {}) as Record<string, unknown>;
    const nextScores = {
      ...existing,
      json_editor_with_schema_test_score: {
        protocol: "e2e_5turn_json_schema_v1",
        tested_at: new Date().toISOString(),
        load_ok: true,
        generation_ok: true,
        turns,
        success_count: turns.filter((t) => t.score >= 4).length,
        total_turns: turns.length,
      },
    };
    const caseScores = Object.entries(nextScores)
      .filter(([k, v]) => k.endsWith("_test_score") && v && typeof v === "object")
      .map(([, v]) => caseScoreFromStored(v as Record<string, unknown>))
      .filter((s): s is number => s !== null);
    const rank = caseScores.length ? Math.round((caseScores.reduce((a, b) => a + b, 0) / caseScores.length) * 10) / 10 : undefined;

    const putRes = await api.put(`/api/v1/entities/ai_model/${model!.uuid}`, {
      data: { version: model!.version, test_scores: nextScores, ...(rank !== undefined ? { rank } : {}) },
    });
    expect(putRes.ok(), `persist failed: ${await putRes.text()}`).toBeTruthy();

    log(`[json_editor_with_schema] ${model_id}: ${metrics.success} score=${metrics.score.toFixed(2)} rank=${rank}`);
    expect(turns.filter((t) => t.score >= 4).length).toBeGreaterThan(0);
  });
});
