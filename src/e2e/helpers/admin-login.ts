/**
 * E2E admin-login helper — logs in as the seeded admin via the UI LoginForm.
 *
 * The Casdoor setup script (`primebrick-be-v3/scripts/setup-casdoor.ts`) seeds
 * an admin user with username `admin`, password `admin` (overridable via env:
 * `CASDOOR_ADMIN_USERNAME`, `CASDOOR_ADMIN_PASSWORD`). This helper navigates
 * to `/login`, fills the LoginForm via `data-testid` locators, submits, and
 * waits for the redirect away from `/login`.
 *
 * Returns the authenticated `Page` (cookies are set on the context, so any
 * new page in the same context is also authenticated).
 */
import type { Page } from "@playwright/test";

export const ADMIN_USERNAME = process.env.CASDOOR_ADMIN_USERNAME ?? "admin";
export const ADMIN_PASSWORD = process.env.CASDOOR_ADMIN_PASSWORD ?? "admin";

/**
 * Log in as the seeded admin via the UI LoginForm.
 *
 * @param page  A Playwright Page (already opened).
 * @returns     The same Page, now authenticated (cookies set on the context).
 * @throws      If login does not redirect away from `/login` within 15s.
 */
export async function loginAsAdmin(page: Page): Promise<Page> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  // Wait for the LoginForm to hydrate — the username input is always visible
  // (form auth is an invariant, not gated by any config flag).
  await page.getByTestId("login-username-input").waitFor({ state: "visible", timeout: 10000 });

  await page.getByTestId("login-username-input").fill(ADMIN_USERNAME);
  await page.getByTestId("login-password-input").fill(ADMIN_PASSWORD);
  await page.getByTestId("login-submit-button").click();

  // Wait for redirect away from /login (success → / or the redirect URL).
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });

  return page;
}
