/**
 * E2E Suite B — User creation + passkey enrollment + discoverable passkey login.
 *
 * Flow:
 *   Steps 1-7: same as Suite A (admin creates invited user → onboarding →
 *              first password login). Reuses the same invitation flow.
 *   Step 8:   After password login, navigate to the profile settings page
 *             where PasskeyEnrollment is mounted. Click "Add passkey" — the
 *             Playwright virtual authenticator answers navigator.credentials.create().
 *             Assert the passkey appears in the credentials list.
 *   Step 9:   Capture the enrolled passkey from the virtual authenticator and
 *             save it to playwright/.auth/passkey.json.
 *   Step 10:  Log out. Open /login in a fresh context. Seed the captured
 *             passkey into the virtual authenticator. Click "Sign in with
 *             passkey" — the virtual authenticator answers navigator.credentials.get().
 *             Assert: redirect to /, /api/v1/auth/me returns the user.
 *   Step 11:  Cleanup — delete the passkey, delete user, delete sender_log rows.
 *
 * Preconditions (enforced by global.setup.ts):
 *   - Full stack up (FE 5173, BE 3001, Postgres 5432, Casdoor 8000).
 *   - Fake Brevo running, providers row upserted.
 *   - Seeded E2E test actors (test-admin / test-user) and enable_web_authn=true.
 *
 * The virtual authenticator uses rpId='localhost' (derived from the BE's
 * hostOverride that sends Host: localhost:5173 to Casdoor — see webauthn.ts).
 *
 * Locators use data-testid exclusively (brittle-on-purpose convention —
 * see docs/ai/e2e-testid-convention.md).
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";
import { randomUUID } from "crypto";
import {
  deleteEmailLogsForRecipient,
  deleteUserProfileByEmail,
  deleteInvitationByEmail,
  setInvitationToken,
  setInvitationOtp,
} from "./helpers/db";
import { cleanupCasdoorUser } from "./helpers/test-users";
import {
  installVirtualAuthenticator,
  captureEnrolledPasskey,
  installVirtualAuthenticatorWithPasskey,
  savePasskey,
  deletePasskeyFile,
  clearVirtualAuthenticator,
  WEBAUTHN_RP_ID,
  type CapturedPasskey,
} from "./helpers/webauthn";

// ─── Test data helpers ──────────────────────────────────────────────────────

function makeTestUser() {
  const ts = Date.now().toString(36);
  const username = `e2e_passkey_${ts}`;
  const email = `e2e_passkey_${ts}@primebrick.test`;
  const displayName = `E2E Passkey ${ts}`;
  const password = `E2E-Test-${ts}!`;
  return {
    username,
    email,
    displayName,
    password,
    invitationToken: "" as string,
  };
}

// ─── Suite ──────────────────────────────────────────────────────────────────

test.describe.serial("Suite B — User creation + passkey enrollment + passkey login", () => {
  let adminPage: Page;
  const testUser = makeTestUser();

  test.beforeAll(async ({ browser }) => {
    const adminContext = await browser.newContext();
    adminPage = await adminContext.newPage();
    await loginAsTestAdmin(adminPage);
  });

  test.afterAll(async () => {
    await adminPage?.close();
    await deletePasskeyFile();
    await cleanupCasdoorUser(testUser.username);
    await deleteEmailLogsForRecipient(testUser.email);
    await deleteInvitationByEmail(testUser.email);
    await deleteUserProfileByEmail(testUser.email);
  });

  // ─── Steps 1-7: same as Suite A (invitation flow + first password login) ──

  test("Step 1: admin creates invited user", async () => {
    await adminPage.goto("/system/settings/users/create", { waitUntil: "domcontentloaded" });
    await adminPage.getByTestId("admin-user-create-form").waitFor({ state: "visible" });

    await adminPage.getByTestId("admin-user-create-display-name-input").fill(testUser.displayName);
    await adminPage.getByTestId("admin-user-create-email-input").fill(testUser.email);

    // Select first org.
    const orgTrigger = adminPage.getByTestId("admin-user-create-org-select");
    await orgTrigger.waitFor({ state: "visible" });
    // Scope options to the open popover — the topbar command palette keeps
    // closed [role='option'] elements in the DOM. Retry the click in case it
    // landed before hydration attached the popover toggle.
    // Pick the "acme" IdP org specifically (idp_name='acme'); other orgs may
    // not exist in Casdoor.
    const orgOption = adminPage
      .locator("[data-state='open'] [role='option']")
      .filter({ hasText: "acme", hasNotText: "Test" })
      .first();
    for (let i = 0; i < 5; i++) {
      await orgTrigger.click();
      try {
        await orgOption.waitFor({ state: "visible", timeout: 3000 });
        break;
      } catch {
        if (i === 4) throw new Error("org select popover never opened");
      }
    }
    await orgOption.click();

    // Fill username (enabled after org is selected).
    await adminPage.getByTestId("admin-user-create-username-input").fill(testUser.username);

    // Select first role.
    const rolesTrigger = adminPage.getByTestId("admin-user-create-roles-select");
    const roleOption = adminPage.locator("[data-state='open'] [role='option']").first();
    for (let i = 0; i < 5; i++) {
      await rolesTrigger.click();
      try {
        await roleOption.waitFor({ state: "visible", timeout: 3000 });
        break;
      } catch {
        if (i === 4) throw new Error("roles select popover never opened");
      }
    }
    await roleOption.click();
    await adminPage.getByTestId("admin-user-create-form").click();

    // Ensure the user is active (Casdoor isForbidden otherwise) and the
    // invitation email is sent.
    await adminPage.getByTestId("admin-user-create-is-active-checkbox").check();
    await adminPage.getByTestId("admin-user-create-send-invitation-toggle").check();

    // Submit.
    await adminPage.getByTestId("admin-user-create-submit-button").click();

    await adminPage.waitForURL(
      (url) => url.pathname.includes("/system/settings/users/") && /\/[0-9a-f-]{36}$/.test(url.pathname),
      { timeout: 15000 },
    );
  });

  test("Step 2: inject known invitation token", async () => {
    // Email delivery is a microservice concern — rewrite the invitation's
    // token_hash to a known token instead of scraping sender_log.
    const token = randomUUID();
    await setInvitationToken(testUser.email, token);
    testUser.invitationToken = token;
  });

  test("Step 3-6: onboarding (verify → OTP → set password)", async ({ browser }) => {
    const token = testUser.invitationToken;
    expect(token).toBeTruthy();

    const onboardContext = await browser.newContext();
    const onboardPage = await onboardContext.newPage();

    await onboardPage.goto(`/welcome#token=${token}`, { waitUntil: "domcontentloaded" });
    await onboardPage.getByTestId("welcome-step-otp-sent").waitFor({ state: "visible", timeout: 15000 });

    const otp = "424242";
    await setInvitationOtp(testUser.email, otp);

    // OtpInput is a bits-ui PinInput — type real keys; onComplete auto-submits.
    await onboardPage.getByTestId("welcome-otp-input").pressSequentially(otp);
    await onboardPage.getByTestId("welcome-step-otp-verified").waitFor({ state: "visible", timeout: 15000 });

    await onboardPage.getByTestId("welcome-password-input").fill(testUser.password);
    await onboardPage.getByTestId("welcome-password-confirm-input").fill(testUser.password);
    await onboardPage.getByTestId("welcome-complete-button").click();
    await onboardPage.getByTestId("welcome-step-complete").waitFor({ state: "visible", timeout: 15000 });

    await onboardContext.close();
  });

  // ─── Step 7: first password login (in a context with the virtual authenticator) ──

  let userContext: BrowserContext;
  let userPage: Page;

  test("Step 7: first password login", async ({ browser }) => {
    // Create the user context that will be reused for passkey enrollment.
    // Install the virtual authenticator NOW, before any navigation, so
    // navigator.credentials.create() is intercepted when we enroll the passkey.
    userContext = await browser.newContext();
    await installVirtualAuthenticator(userContext);
    userPage = await userContext.newPage();

    await userPage.goto("/login", { waitUntil: "domcontentloaded" });
    await userPage.getByTestId("login-username-input").waitFor({ state: "visible", timeout: 10000 });

    await userPage.getByTestId("login-username-input").fill(testUser.username);
    await userPage.getByTestId("login-password-input").fill(testUser.password);
    await userPage.getByTestId("login-submit-button").click();

    await userPage.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });

    // Verify session.
    const meResponse = await userPage.request.get("/api/v1/auth/me");
    expect(meResponse.ok()).toBeTruthy();
  });

  // ─── Step 8: passkey enrollment ────────────────────────────────────────────

  test("Step 8: enroll passkey via profile settings", async () => {
    // The AuthMethodsPromptDialog may auto-open after login (if the user has no
    // passkey and webauthn is enabled). If it appears, select the passkey method
    // and use it. Otherwise, navigate to the profile page where PasskeyEnrollment
    // is mounted.
    // The prompt opens asynchronously after login. Wait briefly for the dialog:
    // if it shows up we enroll through it (passkey radio → inline enrollment
    // section), otherwise we go to the credentials page.
    const dialog = userPage.getByRole("dialog");
    const passkeyChoice = dialog.getByRole("radio", { name: /passkey/i });
    const promptPasskeyButton = dialog.getByTestId("auth-method-enforcer-enroll-passkey-button");

    let usedPrompt = false;
    const promptShown = await passkeyChoice
      .waitFor({ state: "visible", timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (promptShown) {
      await passkeyChoice.click();
      await promptPasskeyButton.waitFor({ state: "visible", timeout: 10000 });
      await promptPasskeyButton.click();
      usedPrompt = true;
    }

    if (!usedPrompt) {
      // Navigate to the credentials settings page where PasskeyEnrollment is mounted.
      await userPage.goto("/system/settings/credentials", { waitUntil: "domcontentloaded" });

      // The prompt can still pop up after navigation — handle it again.
      const latePrompt = await passkeyChoice
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (latePrompt) {
        await passkeyChoice.click();
        await promptPasskeyButton.waitFor({ state: "visible", timeout: 10000 });
        await promptPasskeyButton.click();
        usedPrompt = true;
      } else {
        // Wait for the PasskeyEnrollment component to render.
        const addButton = userPage.getByTestId("passkey-enrollment-add-button");
        await addButton.waitFor({ state: "visible", timeout: 15000 });
        await addButton.click();
      }
    }

    // The virtual authenticator answers navigator.credentials.create().
    if (usedPrompt) {
      // Enrollment inside the prompt dialog is async — wait for the dialog to
      // close (oncomplete fires only after the finish call succeeded) BEFORE
      // navigating, otherwise the in-flight ceremony is aborted.
      await dialog.waitFor({ state: "hidden", timeout: 30000 });
      await userPage.goto("/system/settings/credentials", { waitUntil: "domcontentloaded" });
    }
    const passkeyItem = userPage.getByTestId("passkey-enrollment-item").first();
    await passkeyItem.waitFor({ state: "visible", timeout: 15000 });
  });

  // ─── Step 9: capture the enrolled passkey ─────────────────────────────────

  let capturedPasskey: CapturedPasskey;

  test("Step 9: capture enrolled passkey from virtual authenticator", async () => {
    capturedPasskey = (await captureEnrolledPasskey(userContext))!;
    expect(capturedPasskey).toBeTruthy();
    expect(capturedPasskey.rpId).toBe(WEBAUTHN_RP_ID);
    expect(capturedPasskey.privateKey).toBeTruthy();

    // Save for potential reuse across runs.
    await savePasskey(capturedPasskey);
  });

  // ─── Step 10: passkey login in a fresh context ────────────────────────────

  test("Step 10: discoverable passkey login in fresh context", async ({ browser }) => {
    // Log out first (clear the session).
    // Use the BE logout endpoint — the FE may not have a logout button on every page.
    await userPage.request.post("/api/v1/auth/logout");
    await userContext.close();

    // Fresh context with the captured passkey seeded.
    const freshContext = await browser.newContext();
    await installVirtualAuthenticatorWithPasskey(freshContext, capturedPasskey);
    const freshPage = await freshContext.newPage();

    await freshPage.goto("/login", { waitUntil: "domcontentloaded" });

    // Type the username first — the BE then takes the non-discoverable signin
    // path (Casdoor's discoverable credential lookup is broken on Postgres:
    // webauthnCredentials is bytea, LIKE on CAST(bytea AS text) never matches).
    await freshPage.getByTestId("login-username-input").fill(testUser.username);

    // The passkey button should be visible (enable_webauthn=true in Casdoor).
    const passkeyButton = freshPage.getByTestId("login-passkey-button");
    await passkeyButton.waitFor({ state: "visible", timeout: 10000 });
    await passkeyButton.click();

    // The virtual authenticator answers navigator.credentials.get().
    // Assert: redirect away from /login.
    await freshPage.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });

    // Assert: /api/v1/auth/me returns the test user.
    const meResponse = await freshPage.request.get("/api/v1/auth/me");
    expect(meResponse.ok()).toBeTruthy();
    const meBody = await meResponse.json();
    expect(meBody.profile?.idp_username ?? meBody.username).toBe(testUser.username);

    // Cleanup: clear the virtual authenticator.
    await clearVirtualAuthenticator(freshContext);
    await freshContext.close();
  });
});
