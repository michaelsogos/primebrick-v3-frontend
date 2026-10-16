/**
 * E2E admin-login helper — logs in as the EPHEMERAL E2E test actor minted by
 * `global.setup.ts` (see `helpers/test-users.ts`). Each run creates a
 * throwaway admin user with a random password and deletes it in teardown —
 * no static privileged credentials ever persist in the environment.
 *
 * ⚠️ NEVER use the dev bootstrap `admin` user in tests of any kind. It is a
 * human first-login identity, not test data. Also never destroy/recreate the
 * real `admin`'s credentials, secrets, MFA factors, or passkeys to bypass
 * MFA — MFA suites operate on the ephemeral test actor only.
 *
 * Credentials reach the workers via env vars published by globalSetup:
 *   `E2E_ADMIN_USERNAME` / `E2E_ADMIN_PASSWORD`.
 * (`E2E_USER_USERNAME` / `E2E_USER_PASSWORD` are reserved for a non-admin
 * actor if a suite ever needs one.)
 */
import type { Page } from "@playwright/test";

const RESERVED_DEV_USERNAMES = new Set(["admin"]);

export const E2E_ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? "";
export const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
export const E2E_USER_USERNAME = process.env.E2E_USER_USERNAME ?? "";
export const E2E_USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? "";

/** Guard: refuses to authenticate as a reserved dev identity in tests. */
function assertTestActor(username: string): void {
  if (RESERVED_DEV_USERNAMES.has(username)) {
    throw new Error(
      `[E2E] Refusing to log in as "${username}" — the dev bootstrap admin is ` +
        `forbidden in tests. Tests authenticate as the ephemeral actor minted ` +
        `by global.setup.ts (E2E_ADMIN_* env vars).`,
    );
  }
  if (!username) {
    throw new Error(
      "[E2E] E2E_ADMIN_USERNAME is empty — global.setup.ts mints the test " +
        "actor before the suites run; it must have failed or been skipped.",
    );
  }
}

/**
 * Log in as the ephemeral E2E admin test actor via the UI LoginForm.
 *
 * @param page  A Playwright Page (already opened).
 * @returns     The same Page, now authenticated (cookies set on the context).
 * @throws      If the resolved username is a reserved dev identity / empty, or
 *              if login does not redirect away from `/login` within 15s.
 */
export async function loginAsTestAdmin(page: Page): Promise<Page> {
  assertTestActor(E2E_ADMIN_USERNAME);
  return loginAs(page, E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD);
}

/**
 * Log in as a non-admin E2E test actor via the UI LoginForm (env-provided).
 */
export async function loginAsTestUser(page: Page): Promise<Page> {
  assertTestActor(E2E_USER_USERNAME);
  return loginAs(page, E2E_USER_USERNAME, E2E_USER_PASSWORD);
}

async function loginAs(page: Page, username: string, password: string): Promise<Page> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  // Wait for the LoginForm to hydrate — the username input is always visible
  // (form auth is an invariant, not gated by any config flag).
  await page.getByTestId("login-username-input").waitFor({ state: "visible", timeout: 10000 });

  await page.getByTestId("login-username-input").fill(username);
  await page.getByTestId("login-password-input").fill(password);
  await page.getByTestId("login-submit-button").click();

  // Wait for redirect away from /login (success → / or the redirect URL).
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });

  // The auth-method enforcer dialog may overlay the app ("Secure your
  // account"). Dismiss it so it never intercepts pointer events in tests.
  await dismissAuthMethodEnforcer(page);

  return page;
}

/**
 * If the AuthMethodsPromptDialog is visible, check "Don't show this again"
 * (persists `auth_method_enforcer_dismissed` via the API) and dismiss it.
 * No-op when the dialog never appears. Never throws.
 */
async function dismissAuthMethodEnforcer(page: Page): Promise<void> {
  const dismissButton = page.getByTestId("auth-method-enforcer-dismiss-button");
  try {
    await dismissButton.waitFor({ state: "visible", timeout: 5000 });
    const checkbox = page.getByRole("dialog").getByRole("checkbox");
    if (await checkbox.isVisible().catch(() => false)) {
      await checkbox.check({ force: true });
    }
    await dismissButton.click();
    await dismissButton.waitFor({ state: "hidden", timeout: 5000 });
  } catch {
    // Dialog not shown (already dismissed / a method already enrolled).
  }
}
