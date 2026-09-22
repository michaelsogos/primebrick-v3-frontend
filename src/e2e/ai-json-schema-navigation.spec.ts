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
      if (!phase.startsWith("loading") && stuck >= 6) {
        throw new Error(`panel stuck at phase "${phase}" for 30s`);
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
  return page.evaluate(async (type) => {
    const [{ schemaForCapabilities }, { typeConfigJsonSchema }, explorer, topicI18n, i18n] = await Promise.all([
      import("/src/lib/components/ui/smart-json-config/type-config-explorer.ts"),
      import("/src/lib/config/type-config-schema.ts"),
      import("/src/lib/components/ui/smart-json-assistant/json-schema-explorer.ts"),
      import("/src/lib/components/ui/smart-json-config/type-config-i18n.ts"),
      import("/src/lib/i18n/index.ts"),
    ]);
    // t is a Svelte Readable — grab the current translator via subscribe().
    let translate!: (key: string) => string;
    (i18n as { t: { subscribe: (fn: (v: (key: string) => string) => void) => () => void } })
      .t.subscribe((v) => { translate = v; })();
    const meta = await (await fetch("/api/v1/entities/config_entry/meta")).json();
    const caps = meta.type_capabilities?.[type] ?? { validation: { required: true, unsigned: false, regex: false }, widget: {} };
    const scoped = schemaForCapabilities(typeConfigJsonSchema as never, caps);
    const roots = topicI18n.localizeTopics(explorer.buildSchemaTopics(scoped), caps, translate) as TopicNode[];
    const flat: Record<string, TopicNode> = {};
    const walk = (nodes: TopicNode[]) => nodes.forEach((n) => { flat[n.path] = n; walk(n.children); });
    walk(roots);
    return { roots, index: flat };
  }, configType);
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
  test.describe.configure({ timeout: 600_000 });

  test.beforeAll(async () => {
    await deleteMfaFactorsByUsername("admin");
    await setAuthMethodEnforcerDismissed("admin", true);
  });

  test("click every explorer topic link; each level matches the schema tree", async () => {
    // Identical bootstrap to ai-json-schema-quality.spec.ts — proven.
    const context = await getSharedContext();
    const page = context.pages()[0] ?? (await context.newPage());

    // ── Auth gate ──
    const isAuthed = () =>
      page.evaluate(async () => {
        try { return (await fetch("/api/v1/auth/me")).ok; } catch { return false; }
      });
    // A reused tab may already sit on the target URL — goto to the same
    // URL aborts (ERR_ABORTED). Navigate only when needed.
    if (!page.url().startsWith(PAGE_URL)) await page.goto(PAGE_URL);
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
      await page.goto(PAGE_URL);
    } else {
      log("session already authenticated");
    }

    await waitVisible(page.locator('[data-testid="config-create-key"]'), "config-create-key");
    await waitVisible(page.locator('a[href^="/system/"]').first(), "app interactive");
    await page.locator('[data-testid="config-create-key"]').fill("e2e_nav_probe");
    // Click may land on a not-yet-hydrated CTA (SSR DOM is visible before
    // Svelte attaches handlers) — retry the click each slot until the
    // sheet actually mounts, bounded at 30s.
    const panel = page.locator(`[data-testid="${PREFIX}-panel"]`);
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

    // Explorer seed message = first cascade. Then compute the expected tree
    // in-page with the app's own modules (same scoping + i18n).
    await waitVisible(page.locator(`[data-testid="${PREFIX}-choices"]`).first(), "explorer seed cascade");
    const { roots, index } = await expectedTree(page, "string");
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
});
