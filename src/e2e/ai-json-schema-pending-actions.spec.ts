/**
 * E2E — json-schema assistant PENDING-ACTION false-pick regression.
 *
 * Reproduces the reported bug: while a topic-navigation cascade is pending,
 * the user types a NEW request ("minimo 4 e massimo 8 caratteri") that is
 * merely on the same TOPIC as a pending option. The model must NOT emit
 * {"action":"pick"} — a pick would render a new cascade for the wrongly
 * selected topic instead of generating the requested config.
 *
 * Flow (mirrors the manual repro):
 *   1. seed cascade (root topics pending)
 *   2. click "validation rules" topic → "required" leaf → "True" value CTA
 *   3. model proposes config → Apply → assistant re-shows navigation
 *   4. type the free-text request → send
 *   5. ASSERT: choices-container count UNCHANGED (no pick executed)
 *      AND a new config card (or plain assistant reply) was produced.
 *
 * Scoring: every step is a "mixed"-phase turn merged into the shared
 * `json_editor_with_schema_test_score` case (alongside the "conversation",
 * "navigation" and "chat" phases owned by the other specs) — aggregates and
 * the model rank cover ALL turns across phases.
 */
import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { deleteMfaFactorsByUsername, setAuthMethodEnforcerDismissed } from "./helpers/db";
import { mergeTestScoreTurns, type E2ETurn } from "./helpers/test-scores";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const PAGE_URL = `${BASE_URL}/system/settings/configurations/create`;
const PREFIX = "smart-json-ai";
const E2E_PROFILE = "D:\\git\\primebrick\\temp\\pw-edge-profile";
const CDP_URL = "http://127.0.0.1:9333";

const log = (m: string) => console.log(`[pending] ${new Date().toISOString().slice(11, 19)} ${m}`);

async function poll<T>(fn: () => Promise<T | null>, what: string, maxRetries = 12): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    const out = await fn().catch(() => null);
    if (out !== null && out !== false) return out;
    await new Promise((r) => setTimeout(r, 5000));
    if (i % 4 === 3) log(`  still waiting: ${what} (${(i + 1) * 5}s)`);
  }
  throw new Error(`Timeout waiting for ${what} (${maxRetries * 5}s)`);
}

/**
 * Kill zombie Edge processes that hold the E2E profile. Killed playwright
 * runs leave a browser with the profile locked but a wedged CDP/renderer —
 * the next launch then exits instantly ("opening in existing browser
 * session") and every evaluate hangs. These processes are test-owned.
 */
function killEdgeZombies(): void {
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='msedge.exe'\\" | Where-Object { \\$_.CommandLine -like '*pw-edge-profile*' } | ForEach-Object { Stop-Process -Id \\$_.ProcessId -Force }"`,
      { timeout: 20_000, stdio: "ignore" },
    );
    log("killed zombie pw-edge-profile Edge processes");
  } catch {
    /* none running or query failed — proceed */
  }
}

async function launchEdge(): Promise<BrowserContext> {
  log("launching new persistent Edge session (CDP :9333)");
  return chromium.launchPersistentContext(E2E_PROFILE, {
    channel: "msedge",
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: ["--remote-debugging-port=9333"],
  });
}

async function getSharedContext(): Promise<{ context: BrowserContext; launched: boolean }> {
  try {
    const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 15000 });
    const ctx = browser.contexts()[0];
    if (ctx) {
      log("attached to running Edge session (CDP :9333)");
      return { context: ctx, launched: false };
    }
  } catch {
    /* no debug session up — launch one */
  }
  try {
    return { context: await launchEdge(), launched: true };
  } catch {
    // Singleton handoff to a zombie — kill it and retry once.
    killEdgeZombies();
    await new Promise((r) => setTimeout(r, 3000));
    return { context: await launchEdge(), launched: true };
  }
}

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
      const stallCap = phase === "init" ? 12 : 6;
      if (!phase.startsWith("loading") && stuck >= stallCap) {
        throw new Error(`panel stuck at phase "${phase}" for ${stallCap * 5}s`);
      }
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`Timeout waiting for data-ai-phase=${want} (8min download cap)`);
}

type TopicNode = {
  path: string;
  title: string;
  children: TopicNode[];
  leaf_kind?: string;
  value_options?: unknown[];
};

/** Same in-page expected-tree computation as the navigation spec. */
async function expectedTree(page: Page, configType: string): Promise<{ roots: TopicNode[]; index: Record<string, TopicNode> }> {
  const [meta, sysDict, pubDict] = await Promise.all([
    page.request.get(`${BASE_URL}/api/v1/entities/config_entry/meta`).then((r) => r.json()),
    page.request.get(`${BASE_URL}/api/v1/system/translations/system/it-IT`).then((r) => (r.ok() ? r.json() : {})),
    page.request.get(`${BASE_URL}/api/v1/system/translations/public/it-IT`).then((r) => (r.ok() ? r.json() : {})),
  ]);
  return page.evaluate(async ({ type, meta, dicts }) => {
    const mods: any[] = [];
    for (const url of [
      "/src/lib/components/ui/smart-json-config/type-config-explorer.ts",
      "/src/lib/config/type-config-schema.ts",
      "/src/lib/components/ui/smart-json-assistant/json-schema-explorer.ts",
      "/src/lib/components/ui/smart-json-config/type-config-i18n.ts",
    ]) {
      (window as any).__et_step = url;
      mods.push(
        await Promise.race([
          import(/* @vite-ignore */ url),
          new Promise((_, rej) => setTimeout(() => rej(new Error(`import timeout: ${url}`)), 15_000)),
        ]),
      );
    }
    const [{ schemaForCapabilities }, { typeConfigJsonSchema }, explorer, topicI18n] = mods;
    const flatDict = { ...(dicts.public as Record<string, string>), ...(dicts.system as Record<string, string>) };
    const translate = (key: string) => flatDict[key] ?? key;
    const caps = meta.type_capabilities?.[type] ?? { validation: { required: true, unsigned: false, regex: false }, widget: {} };
    const scoped = schemaForCapabilities(typeConfigJsonSchema as never, caps);
    const roots = topicI18n.localizeTopics(explorer.buildSchemaTopics(scoped), caps, translate) as TopicNode[];
    const flat: Record<string, TopicNode> = {};
    const walk = (nodes: TopicNode[]) => nodes.forEach((n) => { flat[n.path] = n; walk(n.children); });
    walk(roots);
    return { roots, index: flat };
  }, { type: configType, meta, dicts: { system: sysDict, public: pubDict } });
}

const choices = (page: Page) => page.locator(`[data-testid="${PREFIX}-choices"]`);
const typing = (page: Page) => page.locator(`[data-testid="${PREFIX}-typing"]`);

/** Wait until a generation turn finishes: typing indicator appears then goes. */
async function waitTurnDone(page: Page, maxS = 90): Promise<void> {
  await poll(async () => ((await typing(page).count()) > 0 ? true : null), "typing started", 6).catch(() =>
    log("  (typing indicator never appeared — fast local turn)"),
  );
  await poll(async () => ((await typing(page).count()) === 0 ? true : null), "typing finished", Math.ceil(maxS / 5));
}

test.describe("JSON-schema assistant — pending-action false pick", () => {
  test.describe.configure({ timeout: 600_000, mode: "serial" });

  test.beforeAll(async () => {
    await deleteMfaFactorsByUsername("admin");
    await setAuthMethodEnforcerDismissed("admin", true);
  });

  test("free text on the same topic as a pending cascade must NOT emit pick", async () => {
    let { context, launched } = await getSharedContext();
    let page = context.pages()[0] ?? (await context.newPage());

    // Liveness probe — an attached CDP browser can be alive while the page's
    // renderer is dead (zombie session from a killed run): evaluate would
    // hang forever. Bounded probe → relaunch the context once.
    const alive = await Promise.race([
      page.evaluate(() => true).then(() => true),
      new Promise<false>((r) => setTimeout(() => r(false), 10_000)),
    ]).catch(() => false);
    if (!alive) {
      log("page renderer wedged — relaunching Edge once");
      await context.close().catch(() => {});
      ({ context, launched } = await getSharedContext());
      page = context.pages()[0] ?? (await context.newPage());
    }

    page.on("pageerror", (e) => log(`  pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") log(`  console.error: ${m.text()}`);
      if (m.text().startsWith("[chat-actions]")) log(`  ${m.text()}`);
    });

    const isAuthed = () =>
      page.evaluate(async () => {
        try { return (await fetch("/api/v1/auth/me")).ok; } catch { return false; }
      });
    const online = () =>
      page.evaluate(async () => {
        try { return (await fetch("/api/v1/health", { signal: AbortSignal.timeout(4000) })).ok; } catch { return false; }
      });
    if (!page.url().startsWith(PAGE_URL)) await page.goto(PAGE_URL);

    // A freshly-launched Edge occasionally boots with a wedged network
    // service (app shows "Offline", every in-page fetch hangs while curl
    // works). Detect it fast and relaunch the context once.
    if (launched && !(await online().catch(() => false))) {
      log("in-page fetch wedged on fresh launch — relaunching Edge once");
      await context.close().catch(() => {});
      ({ context } = await getSharedContext());
      page = context.pages()[0] ?? (await context.newPage());
      if (!page.url().startsWith(PAGE_URL)) await page.goto(PAGE_URL);
    }

    const langNow = await page.evaluate(() => sessionStorage.getItem("pb.lang"));
    if (langNow !== "it-IT") {
      await page.evaluate(() => sessionStorage.setItem("pb.lang", "it-IT"));
      await page.reload();
    }

    if (!(await isAuthed())) {
      log("logging in as admin");
      await page.goto(`${BASE_URL}/login`);
      let submitted = false;
      for (let i = 0; i < 6 && page.url().includes("/login"); i++) {
        const input = page.getByTestId("login-username-input");
        if (!submitted && (await input.isVisible().catch(() => false))) {
          await input.fill("admin");
          await page.getByTestId("login-password-input").fill("admin");
          await page.getByTestId("login-submit-button").click();
          submitted = true;
        }
        await page.waitForTimeout(5000);
      }
      await poll(async () => ((await isAuthed()) ? true : null), "auth/me authenticated");
      await page.goto(PAGE_URL);
    }

    await page.locator('[data-testid="config-create-key"]').waitFor({ state: "visible", timeout: 30_000 });

    // Gate the sheet open on the app reporting backend-online: if the sheet
    // mounts while the health poller still reports offline, every apiFetch
    // fast-fails → config.ensureLoaded() resolves empty → no model → the
    // panel sits at data-ai-phase="init" forever.
    await poll(async () => {
      const ok = await page.evaluate(async () => {
        try { return (await fetch("/api/v1/health", { signal: AbortSignal.timeout(4000) })).ok; } catch { return false; }
      }).catch(() => false);
      if (!ok) return null;
      const offlineBadge = await page.locator("button:has(.text-red-700)").count();
      return offlineBadge === 0 ? true : null;
    }, "app health chip online", 12);

    await page.locator('[data-testid="config-create-key"]').fill("e2e_pending_probe");

    const panel = page.locator(`[data-testid="${PREFIX}-panel"]`);
    if (!(await panel.isVisible().catch(() => false))) {
      for (let i = 0; i < 6; i++) {
        await page.locator('[data-testid="tcb-ai-assistant-cta"]').click().catch(() => {});
        try {
          await panel.waitFor({ state: "visible", timeout: 5000 });
          break;
        } catch {
          if (i === 5) throw new Error("Timeout waiting for smart-json-ai-panel (30s)");
        }
      }
    }
    try {
      await waitPanelPhase(page, "ready");
    } catch (e) {
      // init-stall diagnostics — find WHERE the creation chain wedged
      // instead of re-running blind.
      const diag = await Promise.race([
        page.evaluate(async () => {
        const out: Record<string, unknown> = {};
        try { out.health = (await fetch("/api/v1/health")).status; } catch (err) { out.health = String(err); }
        try { out.config_meta = (await fetch("/api/v1/entities/config_entry/meta")).status; } catch (err) { out.config_meta = String(err); }
        try { out.models = (await fetch("/api/v1/entities/ai_model")).status; } catch (err) { out.models = String(err); }
        out.online = navigator.onLine;
        return out;
      }).catch((err) => ({ evaluate_failed: String(err) })),
        new Promise<Record<string, unknown>>((r) =>
          setTimeout(() => r({ evaluate_timeout: true }), 15_000),
        ),
      ]);
      log(`init-stall diagnostics: ${JSON.stringify(diag)}`);
      throw e;
    }
    log("model ready");

    const newSession = page.locator(`[data-testid="${PREFIX}-new-session"]`);
    if (await newSession.isVisible().catch(() => false)) {
      await newSession.click();
      await waitPanelPhase(page, "ready");
    }

    // Discover the model_id via the selector's selected menu item — same
    // mechanism as the navigation spec.
    await page.locator(`[data-testid="${PREFIX}-model-trigger"]`).click();
    const model_id = await poll(async () => {
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

    // ── "mixed" phase turns — merged into json_editor_with_schema_test_score
    // in the finally so partial evidence is never lost on a mid-flow fail. ──
    const mixedTurns: E2ETurn[] = [];
    const failures: string[] = [];
    const record = (t: Omit<E2ETurn, "n">) => {
      mixedTurns.push({ n: mixedTurns.length + 1, ...t });
      log(`  turn ${mixedTurns.length}: ${t.verdict} (${t.response_s.toFixed(1)}s) — ${t.reason}`);
    };

    try {

    // ── Step 1: seed cascade pending ──
    await poll(async () => ((await choices(page).count()) > 0 ? true : null), "seed cascade");
    log(`seed cascade rendered (${await choices(page).count()} container)`);

    // ── Step 2: navigate to the 'required' boolean leaf via expected tree ──
    const { roots, index } = await expectedTree(page, "string");
    // Find the boolean leaf — prefer the 'required' rule (user's repro).
    const targetPath =
      Object.keys(index).find((p) => /(^|\.)required$/.test(p) && index[p]!.value_options?.includes(true)) ??
      Object.keys(index).find((p) => index[p]!.value_options?.includes(true));
    expect(targetPath, "no boolean leaf with value_options in topic tree").toBeTruthy();
    const target = index[targetPath!]!;
    log(`target leaf: ${target.path}`);

    // Click each ancestor in turn: the cascade for level k is the LAST
    // `-choices` container; the card index is the ancestor's position in
    // its parent's children array.
    const segs = target.path.split(".");
    let siblings = roots;
    for (let depth = 0; depth < segs.length; depth++) {
      const nodePath = segs.slice(0, depth + 1).join(".");
      const node = index[nodePath]!;
      const cardIdx = siblings.findIndex((s) => s.path === nodePath);
      expect(cardIdx, `ancestor ${nodePath} not among rendered siblings`).toBeGreaterThanOrEqual(0);

      const container = choices(page).last();
      const before = await choices(page).count();
      await container.locator(`[data-testid="${PREFIX}-topic"]`).nth(cardIdx).click({ timeout: 5000 });
      log(`  clicked topic "${node.title}" (depth ${depth})`);

      if (depth < segs.length - 1) {
        // Expandable topic → a new cascade container is appended.
        await poll(async () => ((await choices(page).count()) > before ? true : null), `cascade for ${nodePath}`);
        siblings = node.children;
      } else {
        // Boolean leaf → value CTAs render in a dedicated `-values` row.
        const values = page.locator(`[data-testid="${PREFIX}-values"]`).last();
        await poll(
          async () => ((await values.locator(`[data-testid="${PREFIX}-value"]`).count()) > 0 ? true : null),
          `value CTAs for ${nodePath}`,
        );
        // value_options = [false, true] — True is the affirmative pick.
        const trueIdx = (target.value_options as unknown[]).indexOf(true);
        await values.locator(`[data-testid="${PREFIX}-value"]`).nth(trueIdx).click({ timeout: 5000 });
        log(`  clicked value "True" (index ${trueIdx})`);
      }
    }

    // ── Step 3 (turn 1): model turn → config card → Apply ──
    const tApply = Date.now();
    const cards = page.locator(`[data-testid="${PREFIX}-config-card"]`);
    try {
      await waitTurnDone(page);
      await poll(async () => ((await cards.count()) > 0 ? true : null), "config card after value pick");
      const lastCard = cards.last();
      await lastCard.locator(`[data-testid="${PREFIX}-apply"]`).click();
      await lastCard.locator(`[data-testid="${PREFIX}-applied"]`).waitFor({ state: "visible", timeout: 15_000 });
      record({
        prompt: `click: ${target.path} = True → apply`,
        expected: "config card + applied",
        actual: "applied",
        score: 5, verdict: "pass",
        reason: "config generated and applied",
        response_s: (Date.now() - tApply) / 1000,
      });
    } catch (e) {
      record({
        prompt: `click: ${target.path} = True → apply`,
        expected: "config card + applied",
        actual: String(e).slice(0, 300),
        score: 0, verdict: "fail",
        reason: "no config card / apply failed",
        response_s: (Date.now() - tApply) / 1000,
      });
      failures.push("required=True config flow failed");
      throw e; // every later step depends on this
    }
    log("config applied");

    // After apply the assistant re-shows navigation — wait for it if it
    // comes, then snapshot the pending-state counters. NOTE: `-choices`
    // wraps every message with choices INCLUDING config cards — the
    // pick-detector is the `-topic` card count, which only grows when the
    // model resolves a navigation choice.
    await poll(async () => true, "post-apply settle", 1).catch(() => {});
    await page.waitForTimeout(2000);
    const topicsBefore = await page.locator(`[data-testid="${PREFIX}-topic"]`).count();
    const cardsBefore = await cards.count();
    log(`pending state: topics=${topicsBefore} configCards=${cardsBefore}`);

    // ── Step 4 (turn 2): free-text NEW request on the same topic — the
    // classifier must NOT emit a pick; the reply must be a new config card. ──
    const tNew = Date.now();
    await page.locator(`[data-testid="${PREFIX}-input"]`).fill("minimo 4 e massimo 8 caratteri");
    await page.locator(`[data-testid="${PREFIX}-send"]`).click();
    log('sent "minimo 4 e massimo 8 caratteri"');
    await waitTurnDone(page, 120);
    const topicsAfter = await page.locator(`[data-testid="${PREFIX}-topic"]`).count();
    const cardsAfter = await cards.count();
    log(`after reply: topics=${topicsAfter} (was ${topicsBefore}) configCards=${cardsAfter} (was ${cardsBefore})`);
    {
      const picked = topicsAfter > topicsBefore;
      const produced = cardsAfter > cardsBefore;
      const score = picked ? 0 : produced ? 5 : 2;
      record({
        prompt: "minimo 4 e massimo 8 caratteri (pending topic cascade)",
        expected: "new config card, NO topic pick",
        actual: `topics ${topicsBefore}→${topicsAfter}, configCards ${cardsBefore}→${cardsAfter}`,
        score,
        verdict: score === 5 ? "pass" : score === 0 ? "fail" : "partial",
        reason: picked
          ? "FALSE PICK — new topic cards appeared for a non-selection message"
          : produced
            ? "classified as new request, config generated"
            : "no pick but no config card produced either",
        response_s: (Date.now() - tNew) / 1000,
      });
      if (picked) failures.push("pending cascade: false pick on 'minimo 4 e massimo 8 caratteri'");
      else if (!produced) failures.push("pending cascade: no config card produced");
    }

    // ── Step 6 (turn 3, positive control): the pending config card must
    // still be resolvable by natural language — "applica" is an apply. ──
    const appliedBefore = await page.locator(`[data-testid="${PREFIX}-applied"]`).count();
    const tAppl = Date.now();
    await page.locator(`[data-testid="${PREFIX}-input"]`).fill("applica");
    await page.locator(`[data-testid="${PREFIX}-send"]`).click();
    log('sent "applica" (positive control)');
    const applOk = await poll(
      async () => {
        const n = await page.locator(`[data-testid="${PREFIX}-applied"]`).count();
        return n > appliedBefore ? true : null;
      },
      "applied badge after 'applica'",
      12,
    ).then(() => true).catch(() => false);
    record({
      prompt: "applica (pending config card)",
      expected: "apply action executed",
      actual: applOk ? "applied badge" : "no applied badge in 60s",
      score: applOk ? 5 : 0,
      verdict: applOk ? "pass" : "fail",
      reason: applOk ? "apply resolved by natural language" : "apply NOT resolved by natural language",
      response_s: (Date.now() - tAppl) / 1000,
    });
    if (!applOk) failures.push("'applica' did not resolve the pending config card");
    else log("apply action resolved by natural language — OK");

    // ── Step 7 (baseline revise): navigate to an error_label_key leaf,
    // type a baseline message, then send a CORRECTION — the classifier must
    // emit {"revise":true} and a NEW translations preview must appear. ──
    const keyLeafPath = Object.keys(index).find((p) => index[p]!.leaf_kind === 'error_label_key');
    expect(keyLeafPath, 'no error_label_key leaf in topic tree').toBeTruthy();
    const keyLeaf = index[keyLeafPath!]!;
    log(`key-picker leaf: ${keyLeaf.path}`);

    const kSegs = keyLeaf.path.split('.');
    let kSiblings = roots;
    for (let d = 0; d < kSegs.length; d++) {
      const np = kSegs.slice(0, d + 1).join('.');
      const nd = index[np]!;
      const ci = kSiblings.findIndex((s) => s.path === np);
      expect(ci, `ancestor ${np} not among rendered siblings`).toBeGreaterThanOrEqual(0);
      const container = choices(page).last();
      const before = await choices(page).count();
      await container.locator(`[data-testid="${PREFIX}-topic"]`).nth(ci).click({ timeout: 5000 });
      if (d < kSegs.length - 1) {
        await poll(async () => ((await choices(page).count()) > before ? true : null), `cascade for ${np}`);
        kSiblings = nd.children;
      } else {
        await poll(
          async () => ((await page.locator(`[data-testid="${PREFIX}-key-picker"]`).count()) > 0 ? true : null),
          `key-picker for ${np}`,
        );
      }
    }
    log("key-picker reached");

    // ── Step 8 (turn 4): baseline message → key_picker intercept →
    // translate → preview card. ──
    const previews = page.locator(`[data-testid="${PREFIX}-translations-preview"]`);
    const previewsBefore = await previews.count();
    const tBase = Date.now();
    await page.locator(`[data-testid="${PREFIX}-input"]`).fill("il campo è obbligatorio");
    await page.locator(`[data-testid="${PREFIX}-send"]`).click();
    const baseOk = await poll(
      async () => ((await previews.count()) > previewsBefore ? true : null),
      "translations preview after baseline",
      18,
    ).then(() => true).catch(() => false);
    record({
      prompt: "il campo è obbligatorio (key-picker free text)",
      expected: "translations preview",
      actual: baseOk ? "preview shown" : "no preview in 90s",
      score: baseOk ? 5 : 0,
      verdict: baseOk ? "pass" : "fail",
      reason: baseOk ? "baseline translated, preview rendered" : "baseline produced no translations preview",
      response_s: (Date.now() - tBase) / 1000,
    });
    if (!baseOk) { failures.push("baseline produced no translations preview"); throw new Error("baseline preview missing"); }
    log("baseline translated — preview shown");

    // ── Turn 5: correction — must route to `revise`, producing a SECOND
    // preview whose translations carry the EXTRACTED content, not the raw
    // sentence ("no scusa, intendevo" is preamble — never translated). ──
    const tRev1 = Date.now();
    await page.locator(`[data-testid="${PREFIX}-input"]`).fill("no scusa, intendevo il valore nel campo non è valido");
    await page.locator(`[data-testid="${PREFIX}-send"]`).click();
    log('sent correction "no scusa, intendevo ..."');
    const rev1Ok = await poll(
      async () => ((await previews.count()) > previewsBefore + 1 ? true : null),
      "revised translations preview",
      18,
    ).then(() => true).catch(() => false);
    {
      const revisedText = rev1Ok ? await previews.last().innerText() : "";
      const hasContent = /valore|value/i.test(revisedText);
      const hasPreamble = /scusa|intendevo/i.test(revisedText);
      const score = !rev1Ok ? 0 : hasContent && !hasPreamble ? 5 : 2;
      record({
        prompt: "no scusa, intendevo il valore nel campo non è valido",
        expected: "revise → new preview with extracted baseline",
        actual: rev1Ok ? `preview: "${revisedText.slice(0, 200)}"` : "no new preview in 90s",
        score,
        verdict: score === 5 ? "pass" : score === 0 ? "fail" : "partial",
        reason: !rev1Ok
          ? "correction did not produce a revised preview"
          : hasPreamble
            ? "preview contains the raw preamble — content NOT extracted"
            : hasContent
              ? "revise extracted and translated the corrected baseline"
              : "preview exists but corrected content missing",
        response_s: (Date.now() - tRev1) / 1000,
      });
      if (score === 0) { failures.push("first correction produced no revised preview"); throw new Error("revise failed"); }
      if (score === 2) failures.push("first correction preview content wrong/preamble kept");
    }
    log("baseline revised — preview carries corrected content only");

    // ── Turn 6: a SECOND consecutive correction on the new pending preview —
    // the live-reported "goes haywire on the next turn" case. ──
    const tRev2 = Date.now();
    await page.locator(`[data-testid="${PREFIX}-input"]`).fill("anzi no, scrivi: il campo non può essere vuoto");
    await page.locator(`[data-testid="${PREFIX}-send"]`).click();
    log('sent second correction "anzi no, scrivi: ..."');
    const rev2Ok = await poll(
      async () => ((await previews.count()) > previewsBefore + 2 ? true : null),
      "third translations preview",
      18,
    ).then(() => true).catch(() => false);
    {
      const thirdText = rev2Ok ? await previews.last().innerText() : "";
      const hasContent = /vuoto|empty/i.test(thirdText);
      const hasPreamble = /anzi|scrivi/i.test(thirdText);
      const score = !rev2Ok ? 0 : hasContent && !hasPreamble ? 5 : 2;
      record({
        prompt: "anzi no, scrivi: il campo non può essere vuoto",
        expected: "revise → third preview with extracted baseline",
        actual: rev2Ok ? `preview: "${thirdText.slice(0, 200)}"` : "no new preview in 90s",
        score,
        verdict: score === 5 ? "pass" : score === 0 ? "fail" : "partial",
        reason: !rev2Ok
          ? "second correction produced no revised preview"
          : hasPreamble
            ? "preview contains the raw preamble — content NOT extracted"
            : hasContent
              ? "consecutive revise extracted and translated correctly"
              : "preview exists but corrected content missing",
        response_s: (Date.now() - tRev2) / 1000,
      });
      if (score < 5) failures.push("second correction failed or kept preamble");
    }
    log("second correction revised — preview carries extracted content");

    } finally {
      // Merge the "mixed" turns into the shared case — partial evidence is
      // still recorded when the flow breaks mid-way.
      if (mixedTurns.length) {
        const res = await mergeTestScoreTurns(
          model_id, "json_editor_with_schema_test_score", "mixed", mixedTurns,
        );
        log(`[json_editor_with_schema] ${model_id}: merged score=${res.score.toFixed(2)} rank=${res.rank} (total turns=${res.total_turns})`);
      }
    }

    expect(failures, `mixed-phase failures:\n${failures.join("\n")}`).toEqual([]);
  });
});
