/**
 * Bubble-chrome verification — opens the shared smart-ai panel via the FARO
 * guide CTA, sends ONE turn, and dumps the user bubble's inline style +
 * computed CSS as empirical evidence. One-off diagnostic spec.
 */
import { test, type Page } from "@playwright/test";
import { deleteMfaFactorsByUsername, setAuthMethodEnforcerDismissed, getPool } from "./helpers/db";
import { E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD } from "./helpers/admin-login";
import { getSharedContext, focusedPage } from "./helpers/edge-context";

const PREFIX = "smart-guide-ai";
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const log = (m: string) => console.log(`[spec] ${new Date().toISOString().slice(11, 19)} ${m}`);

async function poll<T>(fn: () => Promise<T | null>, what: string, maxRetries = 6): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    const out = await fn().catch(() => null);
    if (out !== null && out !== false) return out;
    await new Promise((r) => setTimeout(r, 5000));
    if (i % 4 === 3) log(`  still waiting: ${what} (${(i + 1) * 5}s)`);
  }
  throw new Error(`Timeout waiting for ${what}`);
}

async function waitPanelPhase(page: Page, want: string): Promise<string> {
  const panel = page.locator(`[data-testid="${PREFIX}-panel"]`);
  let lastPhase = "";
  for (let slot = 0; slot < 96; slot++) {
    const phase = (await panel.getAttribute("data-ai-phase").catch(() => null)) ?? "";
    if (phase === want) return phase;
    if (phase === "webgpu_required" || phase === "error") throw new Error(`panel phase "${phase}"`);
    if (phase && phase !== lastPhase) { lastPhase = phase; log(`  data-ai-phase="${phase}"`); }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`Timeout waiting for data-ai-phase=${want}`);
}

test.describe("bubble chrome — empirical DOM verification", () => {
  test.describe.configure({ timeout: 600_000 });

  test.beforeAll(async () => {
    await deleteMfaFactorsByUsername(E2E_ADMIN_USERNAME);
    await setAuthMethodEnforcerDismissed(E2E_ADMIN_USERNAME, true);
    // Copy the real dev admin's avatar_color (green) onto the E2E actor so
    // the verified chrome matches what the user sees in their session.
    const admin = await getPool().query(
      `SELECT avatar_color, avatar_initials FROM public.user_profiles WHERE idp_username = 'admin'`,
    );
    if (admin.rows[0]?.avatar_color) {
      await getPool().query(
        `UPDATE public.user_profiles SET avatar_color = $1, avatar_initials = $2 WHERE idp_username = $3`,
        [admin.rows[0].avatar_color, admin.rows[0].avatar_initials, E2E_ADMIN_USERNAME],
      );
      console.log(`[setup] actor avatar_color := ${admin.rows[0].avatar_color} (${admin.rows[0].avatar_initials})`);
    }
  });

  test("user bubble gradient evidence", async () => {
    const { context } = await getSharedContext();
    const page = await focusedPage(context);

    const isAuthed = () =>
      page.evaluate(async () => {
        try { return (await fetch("/api/v1/auth/me")).ok; } catch { return false; }
      });
    await page.goto(BASE_URL);
    if (!(await isAuthed())) {
      log("401 — logging in");
      await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
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

    const me = await page.evaluate(async () => {
      const r = await fetch("/api/v1/auth/me", { credentials: "include" });
      return r.ok ? await r.json() : null;
    });
    log(`[auth/me] avatar_color=${me?.profile?.avatar_color} initials=${me?.profile?.avatar_initials}`);

    const enforcerDismiss = page.getByTestId("auth-method-enforcer-dismiss-button");
    try {
      await enforcerDismiss.waitFor({ state: "visible", timeout: 5000 });
      await enforcerDismiss.click({ timeout: 5000 });
      await enforcerDismiss.waitFor({ state: "hidden", timeout: 5000 });
    } catch {
      await enforcerDismiss.waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
    }

    await page.locator('a[href^="/system/"]').first().waitFor({ state: "visible", timeout: 30_000 });
    const panel = page.locator(`[data-testid="${PREFIX}-panel"]`);
    for (let i = 0; i < 6; i++) {
      await page.getByTestId("app-topbar-guide-ai-cta").click({ timeout: 5000 }).catch(() => {});
      try { await panel.waitFor({ state: "visible", timeout: 5000 }); break; }
      catch { if (i === 5) throw new Error("sheet never mounted"); }
    }
    log("guide sheet mounted");
    await waitPanelPhase(page, "ready");
    log("model ready");

    // Send one turn — the user bubble renders immediately, no answer needed.
    const input = page.locator(`[data-testid="${PREFIX}-input"]`);
    const send = page.locator(`[data-testid="${PREFIX}-send"]`);
    await input.fill("test bubble chrome");
    await send.click({ timeout: 15_000 });
    await page.waitForTimeout(1500);

    const res = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="smart-guide-ai-panel"]');
      if (!root) return { error: "panel gone" };
      const rows = [...root.querySelectorAll(".justify-end")];
      const row = rows[rows.length - 1] as HTMLElement | undefined;
      if (!row) return { error: "no user row" };
      const bubble = row.querySelector(".rounded-lg") as HTMLElement | null;
      const cs = bubble ? getComputedStyle(bubble) : null;
      const avatar = row.querySelector("[class*='avatar'], .avatar-hex") as HTMLElement | null;
      const acs = avatar ? getComputedStyle(avatar) : null;
      return {
        row_html: row.outerHTML.slice(0, 2500),
        bubble_inline_style: bubble?.getAttribute("style") ?? null,
        bubble_backgroundImage: cs?.backgroundImage,
        bubble_backgroundColor: cs?.backgroundColor,
        bubble_border: cs?.border,
        avatar_html: avatar?.outerHTML?.slice(0, 600) ?? null,
        avatar_backgroundImage: acs?.backgroundImage,
      };
    });
    log("=== USER BUBBLE EVIDENCE ===");
    console.log(JSON.stringify(res, null, 1));
  });
});
