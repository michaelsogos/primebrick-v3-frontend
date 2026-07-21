/**
 * E2E Suite C — MFA enrollment + login MFA challenge + step-up.
 *
 * Flow:
 *   1. Admin logs in (may or may not have MFA — we handle both cases).
 *   2. Admin navigates to profile page → MFA management section.
 *   3. Admin enrolls a new MFA factor (TOTP) via the UI.
 *      - Extracts the TOTP secret from the enrollment dialog.
 *      - Generates a TOTP code using the helper.
 *      - Completes enrollment.
 *   4. Admin logs out.
 *   5. Admin logs in again → MFA challenge appears.
 *   6. Enter TOTP code → login succeeds.
 *   7. Cleanup: delete the enrolled MFA factor via the UI.
 *
 * Preconditions (enforced by global.setup.ts):
 *   - FE dev server on 5173, BE on 3001, Postgres on 5432.
 *   - Casdoor seeded with admin/admin.
 *   - MFA enabled in auth config.
 *
 * Locators use data-testid exclusively (brittle-on-purpose convention).
 */
import { test, expect, type Page } from "@playwright/test";
import { generateTotp } from "./helpers/totp";
import { deleteMfaFactorsByUsername, setAuthMethodEnforcerDismissed } from "./helpers/db";

// ─── Suite ──────────────────────────────────────────────────────────────────

test.describe.serial("Suite C — MFA enrollment + login MFA challenge", () => {
  let adminPage: Page;
  let totpSecret: string = "";

  test.beforeAll(async ({ browser }) => {
    // Delete any existing MFA factors for the admin user so login doesn't
    // trigger an MFA challenge.
    await deleteMfaFactorsByUsername("admin");
    // Dismiss the auth method enforcer dialog via DB so it doesn't block
    // the profile page interaction. The dialog is now DB-persisted, not
    // sessionStorage-based.
    await setAuthMethodEnforcerDismissed("admin", true);

    const adminContext = await browser.newContext();
    adminPage = await adminContext.newPage();

    // Login directly (not using loginAsAdmin helper — it uses domcontentloaded
    // which can race with the FE's hydration on IPv6).
    await adminPage.goto("/login", { waitUntil: "networkidle" });
    await adminPage.getByTestId("login-username-input").waitFor({ state: "visible", timeout: 10000 });
    await adminPage.getByTestId("login-username-input").fill("admin");
    await adminPage.getByTestId("login-password-input").fill("admin");
    await adminPage.getByTestId("login-submit-button").click();
    await adminPage.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
  });

  test.afterAll(async () => {
    // Cleanup: delete all MFA factors for the admin user via DB
    try {
      await deleteMfaFactorsByUsername("admin");
      // Re-enable the auth method enforcer dialog for other suites
      await setAuthMethodEnforcerDismissed("admin", false);
    } catch (e) {
      console.warn("[MFA E2E] Cleanup failed:", e);
    }
    await adminPage?.close();
  });

  test("Step 1: navigate to profile page and find MFA section", async () => {
    // The auth method enforcer dialog was dismissed via DB in beforeAll.
    // No sessionStorage hack needed — the dialog is DB-persisted now.
    await adminPage.goto("/system/settings/profile", { waitUntil: "domcontentloaded" });

    // Wait for the MFA management section to appear.
    // It only renders if MFA is enabled in auth config.
    const mfaSection = adminPage.getByTestId("mfa-management-empty").or(
      adminPage.getByTestId("mfa-management-list"),
    );
    await mfaSection.waitFor({ state: "visible", timeout: 15000 });
  });

  test("Step 2: enroll a new MFA factor", async () => {
    // We're in the empty state (factors were deleted in beforeAll).
    // Scroll to the MFA section and click the "enroll" button.
    const enrollButton = adminPage.getByTestId("mfa-enroll-button");
    await enrollButton.scrollIntoViewIfNeeded();
    await enrollButton.waitFor({ state: "visible", timeout: 10000 });
    await enrollButton.click();

    // Wait for the enrollment dialog to open and the QR step to appear.
    // The secret is displayed in a <code> element with data-testid="mfa-enroll-secret".
    const secretEl = adminPage.getByTestId("mfa-enroll-secret");
    await secretEl.waitFor({ state: "visible", timeout: 15000 });
    totpSecret = await secretEl.textContent() ?? "";
    expect(totpSecret).toMatch(/^[A-Z2-7]+$/); // base32

    // Click "Continue" to move to the verify step.
    await adminPage.getByTestId("mfa-enroll-continue-button").click();

    // Wait for the code input to appear.
    const codeInput = adminPage.getByTestId("mfa-enroll-code-input");
    await codeInput.waitFor({ state: "visible", timeout: 10000 });

    // Optionally fill a label.
    const labelInput = adminPage.getByTestId("mfa-enroll-label-input");
    await labelInput.fill("E2E Test Authenticator");

    // Generate a TOTP code from the secret and enter it.
    const code = generateTotp(totpSecret);
    await codeInput.fill(code);

    // Click the verify button.
    await adminPage.getByTestId("mfa-enroll-finish-button").click();

    // Wait for the dialog to close and the factor to appear in the list.
    await adminPage.getByTestId("mfa-management-list").waitFor({ state: "visible", timeout: 15000 });
    expect(await adminPage.getByTestId("mfa-management-item").count()).toBeGreaterThanOrEqual(1);
  });

  test("Step 3: verify /api/v1/auth/me reports has_mfa=true", async () => {
    const resp = await adminPage.request.get("/api/v1/auth/me");
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.has_mfa).toBe(true);
  });

  test("Step 4: log out", async () => {
    // Logout via the API
    await adminPage.request.post("/api/v1/auth/logout");
    // Navigate to login page to confirm we're logged out
    await adminPage.goto("/login", { waitUntil: "domcontentloaded" });
    await adminPage.getByTestId("login-username-input").waitFor({ state: "visible", timeout: 10000 });
  });

  test("Step 5: login triggers MFA challenge", async ({ browser }) => {
    // Use a fresh context to ensure no stale session
    const loginContext = await browser.newContext();
    const loginPage = await loginContext.newPage();

    await loginPage.goto("/login", { waitUntil: "networkidle" });
    await loginPage.getByTestId("login-username-input").waitFor({ state: "visible", timeout: 10000 });

    await loginPage.getByTestId("login-username-input").fill("admin");
    await loginPage.getByTestId("login-password-input").fill("admin");
    await loginPage.getByTestId("login-submit-button").click();

    // The MFA challenge should appear (instead of redirecting to the app).
    const mfaCodeInput = loginPage.getByTestId("mfa-code-input");
    await mfaCodeInput.waitFor({ state: "visible", timeout: 15000 });

    // Generate a TOTP code and enter it.
    const code = generateTotp(totpSecret);
    await mfaCodeInput.fill(code);
    await loginPage.getByTestId("mfa-verify-button").click();

    // Assert: redirect away from /login (success → app home).
    await loginPage.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });

    // Assert: session is established.
    const meResponse = await loginPage.request.get("/api/v1/auth/me");
    expect(meResponse.ok()).toBeTruthy();

    await loginContext.close();
  });

  test("Step 6: login with wrong TOTP code fails", async ({ browser }) => {
    const loginContext = await browser.newContext();
    const loginPage = await loginContext.newPage();

    await loginPage.goto("/login", { waitUntil: "networkidle" });
    await loginPage.getByTestId("login-username-input").waitFor({ state: "visible", timeout: 10000 });

    await loginPage.getByTestId("login-username-input").fill("admin");
    await loginPage.getByTestId("login-password-input").fill("admin");
    await loginPage.getByTestId("login-submit-button").click();

    // Wait for MFA challenge.
    const mfaCodeInput = loginPage.getByTestId("mfa-code-input");
    await mfaCodeInput.waitFor({ state: "visible", timeout: 15000 });

    // Enter a wrong code (all zeros — unlikely to match).
    await mfaCodeInput.fill("000000");
    await loginPage.getByTestId("mfa-verify-button").click();

    // The login page should NOT redirect — the user stays on /login.
    // We expect an error to appear (either an alert or the URL stays /login).
    await loginPage.waitForTimeout(2000); // give the API time to respond
    expect(loginPage.url()).toContain("/login");

    await loginContext.close();
  });
});
