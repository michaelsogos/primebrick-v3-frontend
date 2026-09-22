/**
 * E2E Suite — json-schema assistant TOPIC NAVIGATION sweep.
 *
 * Instead of typing prompts, this spec clicks the chat's deterministic
 * schema-explorer links (`smart-json-ai-topic` cards) ONE BY ONE and
 * verifies each destination:
 *   - expandable topic   → a new cascade message whose rendered topics
 *                          match the node's children exactly
 *                          (missing AND exceeding check, per level);
 *   - error_label_key leaf → `smart-json-ai-key-picker` card;
 *   - value_options leaf   → `smart-json-ai-values` CTAs;
 *   - open-domain leaf     → a `smart-json-ai-config-card` (model turn).
 *
 * Source of truth: the SAME modules the app uses, imported in-page via
 * Vite dev (`/src/lib/...`) — buildSchemaTopics + schemaForCapabilities +
 * localizeTopics with the live `t` store — so the expected tree is what
 * the app itself computes, not a duplicated fixture.
 *
 * Determinism: ≤5s evidence slots, 6 retries (30s) per step. Model-bound
 * leaf clicks share the same 30s cap (warm generation is ~5-10s).
 * Model load keeps the 8min download budget (loading_* phases only).
 */
import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { deleteMfaFactorsByUsername, setAuthMethodEnforcerDismissed } from "./helpers/db";
import { mergeTestScoreTurns, type E2ETurn } from "./helpers/test-scores";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const PAGE_URL = `${BASE_URL}/system/settings/configurations/create`;
const PREFIX = "smart-json-ai";
const E2E_PROFILE = "D:\\git\\primebrick\\temp\\pw-edge-profile";
const CDP_URL = "http://127.0.0.1:9333";

const log = (m: string) => console.log(`[nav] ${new Date().toISOString().slice(11, 19)} ${m}`);

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
  log("launching new persistent Edge session (CDP :9333)");
  const context = await chromium.launchPersistentContext(E2E_PROFILE, {
    channel: "msedge",
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: ["--remote-debugging-port=9333"],
  });
  return { context, launched: true };
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
      // 'init' covers the composable-creation chain (config+model catalog
      // ensureLoaded): on a cold profile the Vite module waterfall starves
      // the first fetches — allow 60s before declaring a stall.
      const stallCap = phase === "init" ? 12 : 6;
      if (!phase.startsWith("loading") && stuck >= stallCap) {
        throw new Error(`panel stuck at phase "${phase}" for ${stallCap * 5}s`);
      }
      if (stuck % 4 === 3) log(`  still waiting: phase="${phase}" (${(slot + 1) * 5}s)`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`Timeout waiting for data-ai-phase=${want} (8min download cap)`);
}

// ─── Expected tree, computed in-page with the app's own modules ─────────────

type TopicNode = {
  path: string;
  title: string;
  children: TopicNode[];
  leaf_kind?: string;
  value_options?: unknown[];
};

/**
 * Rebuilds the exact localized topic tree the panel renders: same schema,
 * same capability scoping, same i18n. Runs inside the page so Vite serves
 * the real modules — no fixture duplication.
 */
async function expectedTree(page: Page, configType: string): Promise<{ roots: TopicNode[]; index: Record<string, TopicNode> }> {
  // meta + translation dicts via the context's request — shares the session
  // cookie but does NOT go through the page. In-page fetch/dynamic-import of
  // the live i18n module proved to wedge on cold profiles; the topic titles
  // only need a flat key→string lookup, so we rebuild `t` from the same
  // module dicts the app merges (system + public).
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
      // Race each import — a wedged module fetch would stall the whole
      // Promise.all forever; surface WHICH one instead.
      (window as any).__et_step = url;
      mods.push(
        await Promise.race([
          import(/* @vite-ignore */ url),
          new Promise((_, rej) => setTimeout(() => rej(new Error(`import timeout: ${url}`)), 15_000)),
        ]),
      );
      (window as any).__et_step = `done:${url}`;
    }
    const [{ schemaForCapabilities }, { typeConfigJsonSchema }, explorer, topicI18n] = mods;
    // Flat key→string lookup — same merge the app does (module dicts), and
    // t() returns the key itself when missing.
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

type Counts = { choices: number; picker: number; values: number; config: number };

/** Per-kind counts of outcome elements (cascade / picker / values / config). */
async function outcomeCounts(page: Page): Promise<Counts> {
  const [choices, picker, values, config] = await Promise.all([
    page.locator(`[data-testid="${PREFIX}-choices"]`).count(),
    page.locator(`[data-testid="${PREFIX}-key-picker"]`).count(),
    page.locator(`[data-testid="${PREFIX}-values"]`).count(),
    page.locator(`[data-testid="${PREFIX}-config-card"]`).count(),
  ]);
  return { choices, picker, values, config };
}
const outcomeTotal = (c: Counts) => c.choices + c.picker + c.values + c.config;

type OutcomeKind = "cascade" | "key-picker" | "value-ctas" | "config-card";

/** Expected outcome kind for a topic node. */
function expectedKind(node: TopicNode): OutcomeKind {
  if (node.children.length > 0) return "cascade";
  if (node.leaf_kind === "error_label_key") return "key-picker";
  if (node.value_options?.length) return "value-ctas";
  return "config-card";
}
/** Outcome kind produced by a click, from per-kind count deltas. Every new
 * message renders a `-choices` wrapper — leaf outcomes (picker/values/config)
 * ALSO bump the choices count, so the specific kinds are checked first. */
function producedKind(before: Counts, after: Counts): OutcomeKind | "none" {
  if (after.picker > before.picker) return "key-picker";
  if (after.values > before.values) return "value-ctas";
  if (after.config > before.config) return "config-card";
  if (after.choices > before.choices) return "cascade";
  return "none";
}

test.describe("JSON-schema assistant — topic navigation sweep", () => {
  test.describe.configure({ timeout: 600_000, mode: "serial" });

  test.beforeAll(async () => {
    await deleteMfaFactorsByUsername("admin");
    await setAuthMethodEnforcerDismissed("admin", true);
  });

  /**
   * Shared bootstrap: attach the Edge session, land on the config-create
   * page (auth-gated), open the assistant sheet, wait model-ready, start a
   * NEW session and return {page, model_id}. Used by both tests — the chat
   * phase got its own test so each phase keeps its own 10min budget.
   */
  async function bootAssistant(): Promise<{ page: Page; model_id: string }> {
    let { context, launched } = await getSharedContext();
    let page = context.pages()[0] ?? (await context.newPage());

    // ── Auth gate ──
    const isAuthed = () =>
      page.evaluate(async () => {
        try { return (await fetch("/api/v1/auth/me")).ok; } catch { return false; }
      });
    // A reused tab may already sit on the target URL — goto to the same
    // URL aborts (ERR_ABORTED). Navigate only when needed.
    if (!page.url().startsWith(PAGE_URL)) await page.goto(PAGE_URL);
    log("landed: " + page.url());

    // ── Connectivity probe — a freshly-launched Edge occasionally boots with
    // a wedged network service (app shows "Offline", every in-page fetch
    // hangs while curl works). Detect it fast and relaunch the context once.
    const online = () =>
      page.evaluate(async () => {
        try {
          return (await fetch("/api/v1/health", { signal: AbortSignal.timeout(4000) })).ok;
        } catch {
          return false;
        }
      });
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
      await page.goto(PAGE_URL);
    } else {
      log("session already authenticated");
    }

    await waitVisible(page.locator('[data-testid="config-create-key"]'), "config-create-key");
    await waitVisible(page.locator('a[href^="/system/"]').first(), "app interactive");

    // Gate the sheet open on the app reporting backend-online: if the sheet
    // mounts while backendState.offline is still true (transient wedge at
    // boot), every apiFetch fast-fails → config.ensureLoaded() resolves empty
    // → no configured model → ai never created → data-ai-phase="init" forever.
    // The AppShell health poller self-heals within ~5s of network recovery;
    // the badge's chip class is the observable proxy (i18n-independent).
    await poll(async () => {
      if (!(await online().catch(() => false))) return null;
      const offlineBadge = await page.locator("button:has(.text-red-700)").count();
      return offlineBadge === 0 ? true : null;
    }, "app health chip online", 12);

    await page.locator('[data-testid="config-create-key"]').fill("e2e_nav_probe");
    // Click may land on a not-yet-hydrated CTA (SSR DOM is visible before
    // Svelte attaches handlers) — retry the click each slot until the
    // sheet actually mounts, bounded at 30s.
    const panel = page.locator(`[data-testid="${PREFIX}-panel"]`);
    if (!(await panel.isVisible().catch(() => false))) {
      for (let i = 0; i < 6; i++) {
        await page.locator('[data-testid="tcb-ai-assistant-cta"]').click().catch(() => {});
        try {
          await panel.waitFor({ state: "visible", timeout: 5000 });
          break;
        } catch {
          if (i === 5) throw new Error("Timeout waiting for smart-json-ai-panel (30s)");
          log(`  sheet not mounted yet — retrying CTA click (${(i + 1) * 5}s)`);
        }
      }
    }
    log("assistant sheet mounted");

    const phase = await waitPanelPhase(page, "ready");
    log(`model ready (data-ai-phase=${phase})`);

    // Clean chat session for the "navigation" phase — the conversation spec
    // owns its own session; turns from both merge into the same test case.
    const newSession = page.locator(`[data-testid="${PREFIX}-new-session"]`);
    if (await newSession.isVisible().catch(() => false)) {
      await newSession.click();
      await waitPanelPhase(page, "ready");
      log("new session started");
    }

    // Discover the model_id via the selector's selected menu item
    // (role="menuitem" + font-semibold = selected row).
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
    return { page, model_id };
  }

  test("click every explorer topic link; each level matches the schema tree", async () => {
    const { page, model_id } = await bootAssistant();

    // Explorer seed message = first cascade. Then compute the expected tree
    // in-page with the app's own modules (same scoping + i18n). The evaluate
    // does dynamic imports + fetch — bound it: a wedged page would hang the
    // test until the 10min cap otherwise.
    await waitVisible(page.locator(`[data-testid="${PREFIX}-choices"]`).first(), "explorer seed cascade");
    const { roots, index } = await poll(
      async () =>
        Promise.race([
          expectedTree(page, "string"),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("evaluate timeout")), 45_000)),
        ]).catch(async (e) => {
          const step = await page.evaluate(() => (window as any).__et_step ?? "(none)").catch(() => "(evaluate dead)");
          log(`  expectedTree failed: ${(e as Error).message} — last step: ${step}`);
          return null;
        }),
      "expectedTree in-page evaluate",
      2,
    );
    expect(roots.length, "schema explorer produced no root topics").toBeGreaterThan(0);
    log(`expected tree: ${roots.length} root topics, ${Object.keys(index).length} total nodes`);

    // ── DFS over the cascade, clicking each topic link one by one ──
    // Every click is a "navigation" turn scored into the SAME
    // json_editor_with_schema_test_score case as the conversation spec.
    const failures: string[] = [];
    const visited = new Set<string>();
    const navTurns: E2ETurn[] = [];
    // Queue entries: the choices-container index that holds this level +
    // the expected child nodes it should render.
    type Level = { containerIdx: number; children: TopicNode[]; via: string };
    const stack: Level[] = [{ containerIdx: 0, children: roots, via: "seed" }];

    while (stack.length) {
      const level = stack.pop()!;
      const container = page.locator(`[data-testid="${PREFIX}-choices"]`).nth(level.containerIdx);
      const cards = container.locator(`[data-testid="${PREFIX}-topic"]`);

      // Missing/exceeding at this level: rendered titles vs expected.
      const renderedTitles = await container
        .locator(`[data-testid="${PREFIX}-topic"] p.text-xs.font-medium`)
        .allTextContents();
      const expectedTitles = level.children.map((c) => c.title);
      const missing = expectedTitles.filter((t) => !renderedTitles.includes(t));
      const exceeding = renderedTitles.filter((t) => !expectedTitles.includes(t));
      if (missing.length) failures.push(`[${level.via}] missing topics: ${missing.join(" | ")}`);
      if (exceeding.length) failures.push(`[${level.via}] exceeding topics: ${exceeding.join(" | ")}`);
      log(`  level "${level.via}": ${renderedTitles.length}/${expectedTitles.length} topics (missing=${missing.length} exceeding=${exceeding.length})`);
      if (missing.length || exceeding.length) continue; // level corrupt — don't click through it

      // Click each topic one by one (by index — titles may repeat).
      for (let i = 0; i < level.children.length; i++) {
        const node = level.children[i];
        if (visited.has(node.path)) { log(`    · ${node.path} — already visited, skipped`); continue; }
        visited.add(node.path);

        const want = expectedKind(node);
        const before = await outcomeCounts(page);
        const t0 = Date.now();
        await cards.nth(i).click({ timeout: 5000 });
        // Outcome evidence: a new outcome element appears (cascade/picker/
        // values/config-card). Model-bound leaves share the 30s cap.
        let outcome = await poll(async () => {
          const now = await outcomeCounts(page);
          return outcomeTotal(now) > outcomeTotal(before) ? now : null;
        }, `outcome for topic "${node.title}"`, 6).catch(() => null);
        // Open-domain leaf: the message's -choices wrapper can mount before
        // the model's config card resolves — wait specifically for the card.
        if (outcome && want === "config-card" && outcome.config <= before.config) {
          outcome = await poll(async () => {
            const now = await outcomeCounts(page);
            return now.config > before.config ? now : null;
          }, `config card for "${node.title}"`, 6).catch(() => outcome);
        }
        const response_s = (Date.now() - t0) / 1000;

        // Score the click as a navigation turn: correct kind=5, wrong kind=2,
        // no outcome=0.
        const got = outcome ? producedKind(before, outcome) : "none";
        // Evidence on leaf misses: capture the model's last assistant text
        // (the bubble) so the failure/turn shows what it actually answered.
        let actualEvidence: string = got;
        if (want === "config-card" && got !== "config-card") {
          const lastBubble = await page
            .locator(`[data-testid="${PREFIX}-panel"] .whitespace-pre-wrap`)
            .last()
            .textContent()
            .catch(() => null);
          actualEvidence = `${got} | last assistant msg: ${(lastBubble ?? "(none)").slice(0, 300)}`;
        }
        const turnScore = got === want ? 5 : got === "none" ? 0 : 2;
        navTurns.push({
          n: navTurns.length + 1,
          prompt: `click: ${node.path}`,
          expected: want,
          actual: actualEvidence,
          score: turnScore,
          verdict: turnScore === 5 ? "pass" : turnScore === 0 ? "fail" : "partial",
          reason: `${node.title} → ${got}`,
          response_s,
        });

        if (!outcome) {
          failures.push(`[${level.via}] topic "${node.title}" (${node.path}) produced no outcome in 30s`);
          log(`    ✗ ${node.path} — no outcome`);
          continue;
        }
        if (got !== want) {
          failures.push(`[${level.via}] "${node.title}" expected ${want}, got ${got}`);
          log(`    ✗ ${node.path} — expected ${want}, got ${got} (${response_s.toFixed(1)}s)`);
          continue;
        }
        log(`    ✓ ${node.path} → ${got} (${response_s.toFixed(1)}s)`);

        if (want === "cascade") {
          // Expandable → the NEW cascade container lists its children.
          stack.push({ containerIdx: outcome.choices - 1, children: node.children, via: node.path });
        }
      }
    }

    log(`visited ${visited.size} topic nodes`);

    // Merge the "navigation" turns into json_editor_with_schema_test_score —
    // same case as the conversation spec; aggregates cover ALL turns.
    const res = await mergeTestScoreTurns(model_id, "json_editor_with_schema_test_score", "navigation", navTurns);
    log(`[json_editor_with_schema] ${model_id}: merged score=${res.score.toFixed(2)} rank=${res.rank} (total turns=${res.total_turns})`);

    expect(failures, `navigation failures:\n${failures.join("\n")}`).toEqual([]);
  });

  test("answer pending choices via natural-language chat", async () => {
    // ── CHAT phase: the SAME explorer answered via chat input ──
    // Pending choices are wrapped into the user message ([Pending actions]);
    // the model replies with a strict action JSON that the app executes
    // exactly like the equivalent card click.
    const { page, model_id } = await bootAssistant();
    await waitVisible(page.locator(`[data-testid="${PREFIX}-choices"]`).first(), "chat-phase seed cascade");
    const { roots } = await poll(
      async () =>
        Promise.race([
          expectedTree(page, "string"),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("evaluate timeout")), 45_000)),
        ]).catch(async (e) => {
          const step = await page.evaluate(() => (window as any).__et_step ?? "(none)").catch(() => "(evaluate dead)");
          log(`  expectedTree failed: ${(e as Error).message} — last step: ${step}`);
          return null;
        }),
      "expectedTree in-page evaluate",
      3,
    );
    expect(roots.length, "schema explorer produced no root topics").toBeGreaterThan(0);

    const failures: string[] = [];

    const chatInput = page.locator(`[data-testid="${PREFIX}-input"]`);
    const chatTurns: E2ETurn[] = [];

    /** Type a chat message and wait for a NEW outcome element to appear. */
    async function chatSay(text: string, want: OutcomeKind | "applied" | "discarded"): Promise<{ got: string; response_s: number; evidence: string }> {
      const before = await outcomeCounts(page);
      const appliedBefore = await page.locator(`[data-testid="${PREFIX}-applied"]`).count();
      const t0 = Date.now();
      await chatInput.fill(text);
      await chatInput.press("Enter");
      const outcome = await poll(async () => {
        if (want === "applied") {
          const now = await page.locator(`[data-testid="${PREFIX}-applied"]`).count();
          return now > appliedBefore ? "applied" : null;
        }
        if (want === "discarded") {
          const now = await outcomeCounts(page);
          return now.config < before.config ? "discarded" : null;
        }
        const now = await outcomeCounts(page);
        return outcomeTotal(now) > outcomeTotal(before) ? producedKind(before, now) : null;
      }, `chat outcome "${want}" for "${text}"`, 6).catch(() => null);
      const response_s = (Date.now() - t0) / 1000;
      let evidence = outcome ?? "none";
      if (!outcome) {
        const lastBubble = await page
          .locator(`[data-testid="${PREFIX}-panel"] .whitespace-pre-wrap`)
          .last()
          .textContent()
          .catch(() => null);
        evidence = `none | last assistant msg: ${(lastBubble ?? "(none)").slice(0, 300)}`;
      }
      return { got: outcome ?? "none", response_s, evidence };
    }

    const recordChatTurn = (prompt: string, want: string, r: { got: string; response_s: number; evidence: string }) => {
      const score = r.got === want ? 5 : r.got === "none" ? 0 : 2;
      chatTurns.push({
        n: chatTurns.length + 1,
        prompt,
        expected: want,
        actual: r.evidence,
        score,
        verdict: score === 5 ? "pass" : score === 0 ? "fail" : "partial",
        reason: `"${prompt}" → ${r.got}`,
        response_s: r.response_s,
      });
      log(`    ${r.got === want ? "✓" : "✗"} chat "${prompt}" → ${r.got} (${r.response_s.toFixed(1)}s)`);
      if (r.got !== want) failures.push(`[chat] "${prompt}" expected ${want}, got ${r.got}`);
    };

    // T1: pick the first root topic BY TITLE → cascade of its children.
    const chatRoot = roots[0];
    {
      const r = await chatSay(chatRoot.title, "cascade");
      recordChatTurn(`chat: "${chatRoot.title}"`, "cascade", r);
      if (r.got === "cascade") {
        // The new cascade must render exactly the node's children.
        const container = page.locator(`[data-testid="${PREFIX}-choices"]`).last();
        const rendered = await container.locator(`[data-testid="${PREFIX}-topic"] p.text-xs.font-medium`).allTextContents();
        const expected = chatRoot.children.map((c) => c.title);
        const missing = expected.filter((t) => !rendered.includes(t));
        const exceeding = rendered.filter((t) => !expected.includes(t));
        if (missing.length || exceeding.length) {
          failures.push(`[chat] cascade of "${chatRoot.title}": missing=${missing.join("|")} exceeding=${exceeding.join("|")}`);
        }
      }
    }

    // T2: pick the first child BY ORDINAL → its expected outcome kind.
    const chatChild = chatRoot.children[0];
    const wantChild = chatChild ? expectedKind(chatChild) : "cascade";
    {
      const r = await chatSay("1", wantChild);
      recordChatTurn(`chat: "1" (${chatChild?.path ?? "none"})`, wantChild, r);
    }

    // T3: the child offers closed-domain values → pick by VALUE text.
    if (wantChild === "value-ctas" && chatChild?.value_options?.length) {
      const r = await chatSay("true", "config-card");
      recordChatTurn('chat: "true" (value pick)', "config-card", r);

      // T4: the config card is pending → discard it in natural language.
      if (r.got === "config-card") {
        const d = await chatSay("scarta", "discarded");
        recordChatTurn('chat: "scarta" (discard)', "discarded", d);
      }

      // T5: ask again → new config card → apply via chat; the builder's
      // required toggle must turn on (form-state proof of the apply path).
      const again = await chatSay("rendi il campo obbligatorio", "config-card");
      recordChatTurn('chat: "rendi il campo obbligatorio"', "config-card", again);
      if (again.got === "config-card") {
        const a = await chatSay("applica", "applied");
        recordChatTurn('chat: "applica" (apply)', "applied", a);
        if (a.got === "applied") {
          const state = await page.locator('[data-testid="tcb-required"]').getAttribute('data-state').catch(() => null);
          if (state !== 'checked') failures.push(`[chat] apply via chat: tcb-required data-state=${state}`);
        }
      }
    }

    // Merge the "chat" turns into the SAME json_editor_with_schema_test_score
    // case — aggregates cover ALL turns (conversation + navigation + chat).
    const resChat = await mergeTestScoreTurns(model_id, "json_editor_with_schema_test_score", "chat", chatTurns);
    log(`[json_editor_with_schema] ${model_id}: merged score=${resChat.score.toFixed(2)} rank=${resChat.rank} (total turns=${resChat.total_turns})`);

    expect(failures, `chat failures:\n${failures.join("\n")}`).toEqual([]);
  });
});
