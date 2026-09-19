/**
 * E2E — Login page session boot, post-login redirect, and logout.
 *
 * Covers the login boot state machine (`src/routes/login/+page.svelte`):
 *   1. Valid local session → auto-enter, no form.
 *   2. Expired token → one refresh attempt via HttpOnly cookie → enter.
 *   3. Empty sessionStorage (fresh tab) → refresh still recovers → enter.
 *   4. `?redirect_path=` honored (and sanitized).
 *   5. UI logout → auth cookies + local state cleared → /login shows the
 *      form and does NOT auto-enter (session is officially over).
 *   6. Forced-login flow: 401 → "Go to login" preserves the page as
 *      `?redirect_path=` → post-login lands back on it.
 *
 * Preconditions: same as other auth suites (FE 5173, BE 3001, seeded admin).
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin, ADMIN_USERNAME, ADMIN_PASSWORD } from "./helpers/admin-login";

/** Read the mirrored session user from sessionStorage. */
async function sessionUser(page: Page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem("user") ?? "null"));
}

/** Cookie names present in the browser context. */
async function cookieNames(page: Page): Promise<string[]> {
  const cookies = await page.context().cookies("http://localhost:5173");
  return cookies.map((c) => c.name);
}

test.describe.serial("Login boot, redirect & logout", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();
    await loginAsAdmin(page);
  });

  test.afterAll(async () => {
    await page?.context().close();
  });

  test("auto-enter: valid session skips the login form", async () => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    // Boot sees sessionStorage['user'] with a valid expires_at → navigates away.
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 10000 });
  });

  test("expired token → refresh → redirect_path honored", async () => {
    // Force expires_at into the past — boot must take the refresh branch.
    await page.evaluate(() => {
      const u = JSON.parse(sessionStorage.getItem("user")!);
      u.expires_at = Date.now() - 1000;
      sessionStorage.setItem("user", JSON.stringify(u));
    });
    await page.goto("/login?redirect_path=%2Fsystem%2Fsettings", { waitUntil: "domcontentloaded" });
    // Refresh succeeds via the HttpOnly cookie → lands on the sanitized path
    // (/system/settings → load redirect → /profile).
    await page.waitForURL(/\/system\/settings/, { timeout: 15000 });
    // Token was renewed — session mirror rewritten with a fresh expires_at.
    const user = await sessionUser(page);
    expect(user?.expires_at).toBeGreaterThan(Date.now());
  });

  test("empty sessionStorage (fresh tab) → refresh cookie recovers session", async () => {
    await page.evaluate(() => sessionStorage.clear());
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
    // Refresh rewrote the session mirror.
    expect(await sessionUser(page)).toBeTruthy();
  });

  test("redirect_path sanitization rejects external/protocol-relative URLs", async () => {
    await page.goto("/login?redirect_path=%2F%2Fevil.example", { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
    expect(page.url()).not.toContain("evil.example");
  });

  test("UI logout clears cookies + session state → login shows the form", async () => {
    // Make sure we're inside the app first.
    await page.goto("/system/settings/profile", { waitUntil: "domcontentloaded" });
    await page.getByTestId("sidebar-profile-menu-trigger").waitFor({ state: "visible", timeout: 10000 });
    await page.getByTestId("sidebar-profile-menu-trigger").click();
    await page.getByTestId("sidebar-logout-button").click();

    await page.waitForURL(/\/login/, { timeout: 10000 });

    // Both auth cookies must be gone — httpOnly means only POST /auth/logout
    // could have cleared them.
    const names = await cookieNames(page);
    expect(names).not.toContain("access_token");
    expect(names).not.toContain("refresh_token");

    // Local session mirror cleared.
    expect(await sessionUser(page)).toBeNull();

    // Boot must NOT auto-enter: refresh fails → the form renders and stays.
    await page.getByTestId("login-username-input").waitFor({ state: "visible", timeout: 15000 });
    await page.waitForTimeout(1500);
    expect(page.url()).toContain("/login");
  });

  test("forced 401 → session-expired dialog → Go to login → redirect_path → lands back", async () => {
    // Cookies are already cleared by the logout test. Forge an expired
    // session mirror so apiFetch takes the refresh path, which now fails →
    // the SessionExpiredDialog opens.
    await page.evaluate(() => {
      sessionStorage.setItem("user", JSON.stringify({ username: "admin", expires_at: Date.now() - 1000 }));
    });
    await page.goto("/system/settings/profile", { waitUntil: "domcontentloaded" });

    // The layout's apiFetch('/auth/me') → 401 → expired → refresh → 401 →
    // dialog enqueues the request and opens.
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 15000 });

    // A failed login attempt inside the dialog reveals "Go to login".
    await dialog.getByTestId("login-username-input").fill(ADMIN_USERNAME);
    await dialog.getByTestId("login-password-input").fill("definitely-wrong");
    await dialog.getByTestId("login-submit-button").click();
    await page.getByTestId("session-expired-goto-login").waitFor({ state: "visible", timeout: 10000 });
    await page.getByTestId("session-expired-goto-login").click();

    // URL carries the original page as a sanitized redirect_path.
    await page.waitForURL(/\/login\?redirect_path=/, { timeout: 10000 });
    const qs = new URL(page.url()).searchParams.get("redirect_path");
    expect(qs).toBe("/system/settings/profile");

    // Real login on the full page → lands back on the preserved path.
    await page.getByTestId("login-username-input").fill(ADMIN_USERNAME);
    await page.getByTestId("login-password-input").fill(ADMIN_PASSWORD);
    await page.getByTestId("login-submit-button").click();
    await page.waitForURL(/\/system\/settings\/profile/, { timeout: 15000 });
  });
});
