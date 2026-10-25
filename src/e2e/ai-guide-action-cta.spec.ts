/**
 * E2E — Guide assistant action CTAs (plan guide-actions-navigate-mcp T8).
 *
 * The Guide's agentic loop emits ONLY `navigate` actions (S4 selects routes
 * from the runtime census — covered by ai-guide-loop-parity.spec.ts). The
 * `tool` action path — chips → confirm dialog → POST /api/v1/system/mcp/call
 * → shared MCP dispatch — is exercised here end-to-end WITHOUT a model turn:
 * messages carrying actions are injected through the composable's dev handle
 * (`window.__ai_panels`), so the real chips + real confirm dialog + real
 * `callMcpTool` fetch run against an intercepted transport.
 *
 * Asserts:
 *   - injected navigate action → chip click → same-tab goto
 *   - injected read tool (list_entities) → click executes immediately
 *     (no dialog), POST body verified, result appended as assistant message
 *   - injected mutating tool (create_entity) → click opens the confirm
 *     dialog with editable args → execute → POST verified → done state +
 *     result message; cancel path closes without a POST
 */
import { test, expect, type Page } from "@playwright/test";
import { deleteMfaFactorsByUsername, setAuthMethodEnforcerDismissed } from "./helpers/db";
import { E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD } from "./helpers/admin-login";
import { getSharedContext, focusedPage } from "./helpers/edge-context";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const PREFIX = "smart-guide-ai";

const log = (m: string) => console.log(`[act-cta] ${new Date().toISOString().slice(11, 19)} ${m}`);

type DebugWindow = Window & {
  __ai_panels?: Record<string, {
    addLocalAssistantMessage: (
      content: string,
      choices?: unknown,
      actions?: unknown[],
    ) => void;
  }>;
};

async function ensureAuth(page: Page): Promise<void> {
  const isAuthed = () =>
    page.evaluate(async () => {
      try { return (await fetch("/api/v1/auth/me")).ok; } catch { return false; }
    });
  await page.goto(BASE_URL);
  if (await isAuthed()) return;
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  for (let i = 0; i < 6 && page.url().includes("/login"); i++) {
    const input = page.getByTestId("login-username-input");
    if (await input.isVisible().catch(() => false)) {
      await input.fill(E2E_ADMIN_USERNAME, { timeout: 5000 });
      await page.getByTestId("login-password-input").fill(E2E_ADMIN_PASSWORD, { timeout: 5000 });
      await page.getByTestId("login-submit-button").click({ timeout: 5000 });
    }
    await page.waitForTimeout(5000);
  }
  for (let i = 0; i < 12 && !(await isAuthed()); i++) await page.waitForTimeout(5000);
  await page.goto(BASE_URL);
  // The enforcer modal ("Secure your account") can survive the DB flag when
  // the session is restored from the persistent profile — dismiss via UI.
  const enforcerDismiss = page.getByTestId("auth-method-enforcer-dismiss-button");
  try {
    await enforcerDismiss.waitFor({ state: "visible", timeout: 5000 });
    await enforcerDismiss.click({ timeout: 5000 });
    await enforcerDismiss.waitFor({ state: "hidden", timeout: 5000 });
    log("MFA enforcer dismissed");
  } catch {
    await enforcerDismiss.waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
  }
}

async function openGuidePanel(page: Page): Promise<void> {
  const panel = page.locator(`[data-testid="${PREFIX}-panel"]`);
  for (let i = 0; i < 6; i++) {
    await page.getByTestId("app-topbar-guide-ai-cta").click({ timeout: 5000 }).catch(() => {});
    if (await panel.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false)) return;
  }
  throw new Error("guide panel did not mount");
}

/** Inject an assistant message carrying actions — no model turn needed. */
async function injectActions(page: Page, content: string, actions: unknown[]): Promise<void> {
  await page.waitForFunction(
    () => (window as DebugWindow).__ai_panels?.["smart-guide-ai"] !== undefined,
    { timeout: 30_000 },
  );
  await page.evaluate(
    ({ content, actions }) => {
      (window as DebugWindow).__ai_panels!["smart-guide-ai"].addLocalAssistantMessage(
        content,
        null,
        actions,
      );
    },
    { content, actions },
  );
}

test.describe("Guide action CTAs — tool path (transport intercepted)", () => {
  test.describe.configure({ timeout: 300_000 });

  test.beforeAll(async () => {
    await deleteMfaFactorsByUsername(E2E_ADMIN_USERNAME);
    await setAuthMethodEnforcerDismissed(E2E_ADMIN_USERNAME, true);
  });

  test("navigate / read-tool / mutating-tool CTAs execute the real client path", async () => {
    const { context } = await getSharedContext();
    const page = await focusedPage(context);
    page.on("pageerror", (e) => log(`pageerror: ${e.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        log(`console.${msg.type()}: ${msg.text().slice(0, 300)}`);
      }
    });

    // ── Intercept the MCP shim — deterministic transport, asserted body ──
    const mcpCalls: { tool: string; args: Record<string, unknown> }[] = [];
    await page.route("**/api/v1/system/mcp/call", async (route) => {
      const body = route.request().postDataJSON() as { tool: string; args: Record<string, unknown> };
      mcpCalls.push(body);
      if (body.tool === "get_entity_meta") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            result: { fields: [{ name: "email", required: true }, { name: "name", required: false }] },
          }),
        });
      }
      if (body.tool === "list_entities") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, result: { user: [{ uuid: "u-1", email: "a@b.c" }] } }),
        });
      }
      if (body.tool === "create_entity") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, result: { uuid: "new-uuid-1" } }),
        });
      }
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: `Unknown tool ${body.tool}` }),
      });
    });

    await ensureAuth(page);
    await openGuidePanel(page);

    // ── 1. navigate action → same-tab goto ──────────────────────────────
    await injectActions(page, "Apri la pagina utenti.", [
      { kind: "navigate", route: "/system/settings/users", label: "Vai a Utenti" },
    ]);
    const navChip = page.locator('[data-testid="ai-action-0"]').last();
    await navChip.waitFor({ state: "visible", timeout: 10_000 });
    await navChip.click();
    await expect.poll(() => page.url(), { timeout: 10_000 }).toContain("/system/settings/users");
    log(`navigate CTA landed on ${page.url()}`);
    await page.goto(BASE_URL);
    await openGuidePanel(page);

    // ── 2. read tool → immediate execution, no dialog ────────────────────
    await injectActions(page, "Elenco utenti.", [
      {
        kind: "tool",
        tool: "list_entities",
        args: { module: "auth", entity: "user" },
        label: "Lista utenti",
      },
    ]);
    const readChip = page.locator('[data-testid="ai-action-0"]').last();
    await readChip.waitFor({ state: "visible", timeout: 10_000 });
    const answersBefore = await page.locator(`[data-testid^="${PREFIX}-answer-"]`).count();
    await readChip.click();
    await expect
      .poll(() => mcpCalls.filter((c) => c.tool === "list_entities").length, { timeout: 10_000 })
      .toBe(1);
    expect(mcpCalls.at(-1)!.args).toEqual({ module: "auth", entity: "user" });
    // No confirm dialog for read tools.
    await expect(page.getByTestId("guide-action-execute")).toHaveCount(0);
    // Result appended as a local assistant message.
    await expect
      .poll(() => page.locator(`[data-testid^="${PREFIX}-answer-"]`).count(), { timeout: 10_000 })
      .toBeGreaterThan(answersBefore);
    await expect(readChip).toBeDisabled({ timeout: 10_000 });
    log("read tool executed immediately, result appended");

    // ── 3. mutating tool → confirm dialog → execute → POST ──────────────
    await injectActions(page, "Crea un utente.", [
      {
        kind: "tool",
        tool: "create_entity",
        args: { module: "auth", entity: "user", data: { email: "test@x.com" } },
        label: "Crea utente",
      },
    ]);
    const mutChip = page.locator('[data-testid="ai-action-0"]').last();
    await mutChip.waitFor({ state: "visible", timeout: 10_000 });
    await mutChip.click();
    const argsArea = page.getByTestId("guide-action-args");
    await argsArea.waitFor({ state: "visible", timeout: 10_000 });
    // Args are editable JSON — model's payload pre-fills the textarea.
    const argsValue = await argsArea.inputValue();
    expect(JSON.parse(argsValue)).toMatchObject({ entity: "user" });
    await page.getByTestId("guide-action-execute").click();
    await expect
      .poll(() => mcpCalls.filter((c) => c.tool === "create_entity").length, { timeout: 10_000 })
      .toBe(1);
    expect(mcpCalls.at(-1)!.args).toMatchObject({ module: "auth", entity: "user" });
    await expect(page.getByTestId("guide-action-result")).toBeVisible({ timeout: 10_000 });
    log("mutating tool executed through confirm dialog");

    // ── 4. cancel path → dialog closes, no POST ─────────────────────────
    await page.keyboard.press("Escape");
    const callsBeforeCancel = mcpCalls.length;
    await injectActions(page, "Elimina un utente.", [
      {
        kind: "tool",
        tool: "delete_entity",
        args: { module: "auth", entity: "user", uuid: "u-9" },
        label: "Elimina utente",
      },
    ]);
    const delChip = page.locator('[data-testid="ai-action-0"]').last();
    await delChip.click();
    const dialog = page.locator('[data-slot="dialog-content"]').last();
    await dialog.waitFor({ state: "visible", timeout: 10_000 });
    const cancelBtn = dialog.locator('button:has-text("Cancel"), button:has-text("Annulla")');
    await cancelBtn.click();
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });
    await page.waitForTimeout(1000);
    // get_entity pre-load for the entity card may fire (uuid present) — the
    // destructive call itself must not.
    expect(mcpCalls.filter((c) => c.tool === "delete_entity").length).toBe(0);
    log(`cancel path clean (${mcpCalls.length - callsBeforeCancel} non-destructive preloads)`);

    console.log("[act-cta-calls]", JSON.stringify(mcpCalls.map((c) => c.tool)));
  });

  test("client-registry admin surface — list renders live registry rows", async () => {
    const { context } = await getSharedContext();
    const page = await focusedPage(context);
    await ensureAuth(page);
    await page.goto(`${BASE_URL}/system/settings/clients`, { waitUntil: "domcontentloaded" });
    // The live registry (populated by service enrollment) must surface as
    // rows in the admin list — proof the entity route + meta + list page
    // are wired end-to-end, not just compiled.
    await expect(page.getByText("primebrick-api/3.1.0").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("primebrick-ai/3.1.0").first()).toBeVisible({ timeout: 15_000 });
    log("client_registry list renders live registry rows");
  });
});
