/**
 * E2E Suite A — User creation + username/password login (full invitation flow).
 *
 * Flow:
 *   1. Admin logs in via UI LoginForm.
 *   2. Admin creates a new user via the admin user-create page (send_invitation=true).
 *   3. Test extracts the invitation token from emailsender.sender_log.
 *   4. Test opens /welcome#token=<token> in a fresh incognito context.
 *   5. Welcome page verifies the token → auto-sends OTP.
 *   6. Test extracts the OTP from sender_log → enters it → verifies.
 *   7. Test sets a new password → completes onboarding.
 *   8. Test logs in with the new username + password → asserts success.
 *   9. Cleanup: delete user, invitation, sender_log rows.
 *
 * Preconditions (enforced by global.setup.ts):
 *   - FE dev server on 5173, BE on 3001, Postgres on 5432.
 *   - Fake Brevo server running, providers row upserted.
 *   - Casdoor seeded with admin/admin.
 *
 * Locators use data-testid exclusively (brittle-on-purpose convention —
 * see docs/ai/e2e-testid-convention.md).
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers/admin-login";
import {
  waitForInvitationLink,
  waitForOtp,
  extractTokenFromWelcomeLink,
} from "./helpers/otp";
import {
  deleteEmailLogsForRecipient,
  deleteUserProfileByEmail,
  deleteInvitationByEmail,
} from "./helpers/db";

// ─── Test data helpers ──────────────────────────────────────────────────────

/** Generate a unique test user identity for this run. */
function makeTestUser() {
  const ts = Date.now().toString(36);
  const username = `e2e_pwd_${ts}`;
  const email = `e2e_pwd_${ts}@primebrick.test`;
  const displayName = `E2E Pwd ${ts}`;
  const password = `E2E-Test-${ts}!`;
  return {
    username,
    email,
    displayName,
    password,
    invitationToken: "" as string, // filled in Step 2
  };
}

// ─── Suite ──────────────────────────────────────────────────────────────────

test.describe.serial("Suite A — User creation + password login", () => {
  test.describe.configure({ mode: "serial" });

  let adminPage: Page;
  const testUser = makeTestUser();

  test.beforeAll(async ({ browser }) => {
    const adminContext = await browser.newContext();
    adminPage = await adminContext.newPage();
    await loginAsAdmin(adminPage);
  });

  test.afterAll(async () => {
    // Cleanup: close admin page, delete test data from DB.
    await adminPage?.close();
    await deleteEmailLogsForRecipient(testUser.email);
    await deleteInvitationByEmail(testUser.email);
    await deleteUserProfileByEmail(testUser.email);
  });

  test("Step 1: admin creates invited user", async () => {
    await adminPage.goto("/system/settings/users/create", { waitUntil: "domcontentloaded" });

    // Wait for the form to render.
    await adminPage.getByTestId("admin-user-create-form").waitFor({ state: "visible" });

    // Fill display name + email.
    await adminPage.getByTestId("admin-user-create-display-name-input").fill(testUser.displayName);
    await adminPage.getByTestId("admin-user-create-email-input").fill(testUser.email);

    // Select the first available org from the ComboSelect.
    // The org dropdown loads asynchronously — wait for it to be enabled.
    const orgTrigger = adminPage.getByTestId("admin-user-create-org-select");
    await orgTrigger.waitFor({ state: "visible" });
    await orgTrigger.click();
    // Wait for the popover to open and the first option to appear.
    const orgOption = adminPage.locator("[role='option']").first();
    await orgOption.waitFor({ state: "visible", timeout: 10000 });
    await orgOption.click();

    // Now the username field is enabled — fill it.
    await adminPage.getByTestId("admin-user-create-username-input").fill(testUser.username);

    // Select the first available role.
    const rolesTrigger = adminPage.getByTestId("admin-user-create-roles-select");
    await rolesTrigger.click();
    const roleOption = adminPage.locator("[role='option']").first();
    await roleOption.waitFor({ state: "visible", timeout: 10000 });
    await roleOption.click();
    // Close the roles dropdown by clicking elsewhere.
    await adminPage.getByTestId("admin-user-create-form").click();

    // Ensure send_invitation is checked (it may default to checked or unchecked).
    const sendInvToggle = adminPage.getByTestId("admin-user-create-send-invitation-toggle");
    await sendInvToggle.check();

    // Submit the form.
    await adminPage.getByTestId("admin-user-create-submit-button").click();

    // Assert: redirect to the new user's detail page (URL contains a UUID).
    await adminPage.waitForURL(
      (url) => url.pathname.includes("/system/settings/users/") && /\/[0-9a-f-]{36}$/.test(url.pathname),
      { timeout: 15000 },
    );
  });

  test("Step 2: extract invitation token from sender_log", async () => {
    // The invitation_welcome email is sent to the test user's email.
    // We poll sender_log for it and parse the welcome link.
    const link = await waitForInvitationLink(testUser.email, 20000);
    expect(link).toContain("#token=");

    const token = extractTokenFromWelcomeLink(link);
    expect(token).toHaveLength(36); // UUID-format token

    // Store the token for the next step via a shared variable.
    testUser.invitationToken = token;
  });

  test("Step 3-6: onboarding (verify token → OTP → set password)", async ({ browser }) => {
    const token = testUser.invitationToken;
    expect(token).toBeTruthy();

    // Use a fresh incognito context — the new user has no session.
    const onboardContext = await browser.newContext();
    const onboardPage = await onboardContext.newPage();

    // Navigate to /welcome with the token in the fragment.
    await onboardPage.goto(`/welcome#token=${token}`, { waitUntil: "domcontentloaded" });

    // The welcome page auto-verifies the token on mount, then auto-sends OTP.
    // Wait for the OTP-sent step to appear.
    await onboardPage.getByTestId("welcome-step-otp-sent").waitFor({ state: "visible", timeout: 15000 });

    // Extract the OTP from the sender_log (otp_verification email).
    const otp = await waitForOtp(testUser.email, 20000);
    expect(otp).toMatch(/^\d{6}$/);

    // Enter the OTP and verify.
    await onboardPage.getByTestId("welcome-otp-input").fill(otp);
    await onboardPage.getByTestId("welcome-next-button").click();

    // Wait for the password-set step.
    await onboardPage.getByTestId("welcome-step-otp-verified").waitFor({ state: "visible", timeout: 15000 });

    // Set the new password.
    await onboardPage.getByTestId("welcome-password-input").fill(testUser.password);
    await onboardPage.getByTestId("welcome-password-confirm-input").fill(testUser.password);
    await onboardPage.getByTestId("welcome-complete-button").click();

    // Wait for the complete step.
    await onboardPage.getByTestId("welcome-step-complete").waitFor({ state: "visible", timeout: 15000 });

    await onboardContext.close();
  });

  test("Step 7: login with username + password", async ({ browser }) => {
    // Fresh context — no existing session.
    const loginContext = await browser.newContext();
    const loginPage = await loginContext.newPage();

    await loginPage.goto("/login", { waitUntil: "domcontentloaded" });

    // Wait for the LoginForm to hydrate.
    await loginPage.getByTestId("login-username-input").waitFor({ state: "visible", timeout: 10000 });

    await loginPage.getByTestId("login-username-input").fill(testUser.username);
    await loginPage.getByTestId("login-password-input").fill(testUser.password);
    await loginPage.getByTestId("login-submit-button").click();

    // Assert: redirect away from /login (success → / or app home).
    await loginPage.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });

    // Assert: /api/v1/auth/me returns the user (session is established).
    const meResponse = await loginPage.request.get("/api/v1/auth/me");
    expect(meResponse.ok()).toBeTruthy();
    const meBody = await meResponse.json();
    expect(meBody.username ?? meBody.profile?.username).toBe(testUser.username);

    await loginContext.close();
  });
});
