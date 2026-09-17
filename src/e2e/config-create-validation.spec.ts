/**
 * E2E Suite — Config-item create form: full validation matrix.
 *
 * Phase 1: form validation only (no submit, no DB writes). Each test reloads
 * the page for isolation. Phase 2 (later) will add submit + DB verify + cleanup.
 *
 * Coverage:
 *   - Left column: top-level Zod schema (key, type, value, label_key,
 *     description_key, group_key, reserved) — all validation rules.
 *   - Right column: TypeConfigBuilder (ValidationRulesSection +
 *     WidgetConfigSection + JsonPreviewEditor) — per-type field visibility,
 *     per-rule interactions, and the value validation matrix across all
 *     17 types × applicable rules.
 *
 * Preconditions (enforced by global.setup.ts):
 *   - FE dev server on 5173, BE on 3001, Postgres on 5432.
 *   - Casdoor seeded with admin/admin.
 *
 * Locators use data-testid exclusively (brittle-on-purpose convention —
 * see docs/ai/e2e-testid-convention.md).
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers/admin-login";

const CREATE_URL = "/system/settings/configurations/create";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Open the type ComboSelect and select a type by its visible label.
 * ComboSelect options render as [role='option'] in a popover.
 */
async function selectType(page: Page, typeLabel: string): Promise<void> {
  const trigger = page.getByTestId("config-create-type");
  await trigger.waitFor({ state: "visible", timeout: 10000 });
  await trigger.click();
  const option = page.locator("[role='option']").filter({ hasText: typeLabel });
  await option.waitFor({ state: "visible", timeout: 10000 });
  await option.click();
  // Close the popover by clicking elsewhere
  await page.getByTestId("config-create-key").click();
}

/**
 * Fill the config key field and trigger validation.
 */
async function fillKey(page: Page, value: string): Promise<void> {
  const keyInput = page.getByTestId("config-create-key");
  await keyInput.fill(value);
}

/**
 * Assert that a destructive (red) error message is visible within the
 * same field container (parent div.space-y-2 or space-y-1) as the given
 * testid element. The TranslatedFormFieldErrors component renders
 * <div class="text-destructive text-xs font-medium"> per error.
 */
async function expectFieldError(page: Page, testid: string, timeout = 5000): Promise<void> {
  const field = page.getByTestId(testid);
  // The error div is a sibling within the same parent container.
  // Locate the parent container and look for .text-destructive inside it.
  const container = field.locator("xpath=ancestor::div[contains(@class,'space-y-2') or contains(@class,'space-y-1')][1]");
  await expect(container.locator(".text-destructive").first()).toBeVisible({ timeout });
}

/**
 * Assert that NO destructive error message is visible near the given field.
 */
async function expectNoFieldError(page: Page, testid: string): Promise<void> {
  const field = page.getByTestId(testid);
  const container = field.locator("xpath=ancestor::div[contains(@class,'space-y-2') or contains(@class,'space-y-1')][1]");
  await expect(container.locator(".text-destructive")).toHaveCount(0);
}

/**
 * Assert that a testid element is visible.
 */
async function expectVisible(page: Page, testid: string, timeout = 5000): Promise<void> {
  await expect(page.getByTestId(testid)).toBeVisible({ timeout });
}

/**
 * Assert that a testid element is hidden (not in DOM or not visible).
 */
async function expectHidden(page: Page, testid: string): Promise<void> {
  await expect(page.getByTestId(testid)).toBeHidden();
}

/**
 * Wait for the create form to render after navigation.
 */
async function waitForForm(page: Page): Promise<void> {
  await page.getByTestId("config-create-key").waitFor({ state: "visible", timeout: 15000 });
}

// ─── Test setup ─────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(CREATE_URL, { waitUntil: "domcontentloaded" });
  await waitForForm(page);
});

// ─── Step 2: Left column — top-level field validation ──────────────────────

test.describe("Left column — top-level field validation", () => {
  test("key required — clearing key shows required error", async ({ page }) => {
    await fillKey(page, "x");
    await fillKey(page, "");
    await expectFieldError(page, "config-create-key");
  });

  test("key max length — 101 chars shows tooLong error", async ({ page }) => {
    await fillKey(page, "a".repeat(101));
    await expectFieldError(page, "config-create-key");
  });

  test("key max length — 100 chars is valid (no error)", async ({ page }) => {
    await fillKey(page, "a".repeat(100));
    await expectNoFieldError(page, "config-create-key");
  });

  test("key format — uppercase rejected", async ({ page }) => {
    await fillKey(page, "My_Key");
    await expectFieldError(page, "config-create-key");
  });

  test("key format — leading digit rejected", async ({ page }) => {
    await fillKey(page, "1key");
    await expectFieldError(page, "config-create-key");
  });

  test("key format — spaces rejected", async ({ page }) => {
    await fillKey(page, "my key");
    await expectFieldError(page, "config-create-key");
  });

  test("key format — valid snake_case accepted", async ({ page }) => {
    await fillKey(page, "my_custom_setting");
    await expectNoFieldError(page, "config-create-key");
  });

  test("key uniqueness — existing key shows keyExists error", async ({ page }) => {
    // oidc_issuer_url is a reserved config key that always exists on the configurations page.
    await fillKey(page, "oidc_issuer_url");
    // The keyExists check has a 500ms debounce + API call.
    const keyInput = page.getByTestId("config-create-key");
    const container = keyInput.locator("xpath=ancestor::div[contains(@class,'space-y-2')][1]");
    // The keyExists error is a separate div with text-destructive (not via FormField).
    await expect(container.locator(".text-destructive").first()).toBeVisible({ timeout: 5000 });
  });

  test("type required — selecting then the form validates", async ({ page }) => {
    // Type defaults to 'string'. We verify the type selector is present and functional.
    await expectVisible(page, "config-create-type");
    // Select a different type to trigger validation, then verify no type error.
    await selectType(page, "Boolean");
    await expectNoFieldError(page, "config-create-type");
  });

  test("label_key max length — 101 chars shows tooLong", async ({ page }) => {
    // ComboSelect with allowCreate — type a long value and press Enter to create it.
    const trigger = page.getByTestId("config-create-label-key");
    await trigger.click();
    await page.keyboard.type("a".repeat(101));
    await page.keyboard.press("Enter");
    await expectFieldError(page, "config-create-label-key");
  });

  test("description_key max length — 101 chars shows tooLong", async ({ page }) => {
    const trigger = page.getByTestId("config-create-description-key");
    await trigger.click();
    await page.keyboard.type("a".repeat(101));
    await page.keyboard.press("Enter");
    await expectFieldError(page, "config-create-description-key");
  });

  test("group_key format — uppercase rejected", async ({ page }) => {
    const trigger = page.getByTestId("config-create-group-key");
    await trigger.click();
    await page.keyboard.type("MyGroup");
    await page.keyboard.press("Enter");
    await expectFieldError(page, "config-create-group-key");
  });

  test("group_key format — valid snake_case accepted", async ({ page }) => {
    const trigger = page.getByTestId("config-create-group-key");
    await trigger.click();
    await page.keyboard.type("my_group");
    await page.keyboard.press("Enter");
    await expectNoFieldError(page, "config-create-group-key");
  });

  test("group_key empty is valid", async ({ page }) => {
    // Leave group_key empty — no error should appear.
    await expectNoFieldError(page, "config-create-group-key");
  });

  test("reserved toggle switches without error", async ({ page }) => {
    const toggle = page.getByTestId("config-create-reserved");
    await toggle.click();
    // Toggling reserved should not produce any error.
    await expectNoFieldError(page, "config-create-reserved");
  });

  test("submit disabled when errors present", async ({ page }) => {
    // Fill an invalid key → submit should be disabled.
    await fillKey(page, "Invalid Key With Spaces");
    await expect(page.getByTestId("config-create-submit")).toBeDisabled();
  });

  test("submit enabled when all valid", async ({ page }) => {
    // Fill valid key + type (defaults to string) + a value.
    await fillKey(page, "e2e_test_valid_key");
    const valueInput = page.getByTestId("config-input-string-create");
    await valueInput.fill("test value");
    // Wait for key uniqueness check to settle (no keyExists error for a new key).
    await expect(page.getByTestId("config-create-submit")).toBeEnabled({ timeout: 10000 });
  });
});

// ─── Step 3: Right column — per-type field visibility ───────────────────────

test.describe("Right column — per-type field visibility", () => {
  // String-derived types: show required, min, max, regex; hide unsigned, url-protocols
  for (const typeName of ["String", "Text", "Secret", "Email", "Phone"]) {
    test(`type=${typeName.toLowerCase()} shows required, min, max, regex; hides unsigned, url-protocols`, async ({ page }) => {
      await selectType(page, typeName);
      await expectVisible(page, "tcb-required");
      await expectVisible(page, "tcb-min");
      await expectVisible(page, "tcb-max");
      await expectVisible(page, "tcb-regex");
      await expectHidden(page, "tcb-unsigned");
      await expectHidden(page, "tcb-url-protocols");
    });
  }

  test("type=url shows required, min, max, regex, url-protocols; hides unsigned", async ({ page }) => {
    await selectType(page, "URL");
    await expectVisible(page, "tcb-required");
    await expectVisible(page, "tcb-min");
    await expectVisible(page, "tcb-max");
    await expectVisible(page, "tcb-regex");
    await expectVisible(page, "tcb-url-protocols");
    await expectHidden(page, "tcb-unsigned");
  });

  // Numeric types: show required, unsigned, min, max; hide regex, url-protocols
  for (const typeName of ["BigInt", "Number"]) {
    test(`type=${typeName.toLowerCase()} shows required, unsigned, min, max; hides regex, url-protocols`, async ({ page }) => {
      await selectType(page, typeName);
      await expectVisible(page, "tcb-required");
      await expectVisible(page, "tcb-unsigned");
      await expectVisible(page, "tcb-min");
      await expectVisible(page, "tcb-max");
      await expectHidden(page, "tcb-regex");
      await expectHidden(page, "tcb-url-protocols");
    });
  }

  test("type=money shows required, unsigned, min, max, currency; hides regex, url-protocols", async ({ page }) => {
    await selectType(page, "Money");
    await expectVisible(page, "tcb-required");
    await expectVisible(page, "tcb-unsigned");
    await expectVisible(page, "tcb-min");
    await expectVisible(page, "tcb-max");
    await expectVisible(page, "tcb-currency");
    await expectHidden(page, "tcb-regex");
    await expectHidden(page, "tcb-url-protocols");
  });

  test("type=boolean shows required only; hides min, max, unsigned, regex, url-protocols", async ({ page }) => {
    await selectType(page, "Boolean");
    await expectVisible(page, "tcb-required");
    await expectHidden(page, "tcb-min");
    await expectHidden(page, "tcb-max");
    await expectHidden(page, "tcb-unsigned");
    await expectHidden(page, "tcb-regex");
    await expectHidden(page, "tcb-url-protocols");
  });

  test("type=json shows required, min, max; hides unsigned, regex, url-protocols", async ({ page }) => {
    await selectType(page, "JSON");
    await expectVisible(page, "tcb-required");
    await expectVisible(page, "tcb-min");
    await expectVisible(page, "tcb-max");
    await expectHidden(page, "tcb-unsigned");
    await expectHidden(page, "tcb-regex");
    await expectHidden(page, "tcb-url-protocols");
  });

  test("type=badge shows required, badge values editor; hides min, max, unsigned, regex", async ({ page }) => {
    await selectType(page, "Badge");
    await expectVisible(page, "tcb-required");
    await expectVisible(page, "tcb-badge-add");
    await expectHidden(page, "tcb-min");
    await expectHidden(page, "tcb-max");
    await expectHidden(page, "tcb-unsigned");
    await expectHidden(page, "tcb-regex");
  });

  test("type=single_select shows required, select source editor; hides min, max, unsigned, regex", async ({ page }) => {
    await selectType(page, "Single Select");
    await expectVisible(page, "tcb-required");
    await expectVisible(page, "tcb-source-builtin");
    await expectHidden(page, "tcb-min");
    await expectHidden(page, "tcb-max");
    await expectHidden(page, "tcb-unsigned");
    await expectHidden(page, "tcb-regex");
  });

  test("type=multi_select shows required, select source editor; hides min, max, unsigned, regex", async ({ page }) => {
    await selectType(page, "Multi Select");
    await expectVisible(page, "tcb-required");
    await expectVisible(page, "tcb-source-builtin");
    await expectHidden(page, "tcb-min");
    await expectHidden(page, "tcb-max");
    await expectHidden(page, "tcb-unsigned");
    await expectHidden(page, "tcb-regex");
  });

  for (const typeName of ["Date", "DateTime", "Time"]) {
    test(`type=${typeName.toLowerCase()} shows required only; hides min, max, unsigned, regex`, async ({ page }) => {
      await selectType(page, typeName);
      await expectVisible(page, "tcb-required");
      await expectHidden(page, "tcb-min");
      await expectHidden(page, "tcb-max");
      await expectHidden(page, "tcb-unsigned");
      await expectHidden(page, "tcb-regex");
    });
  }
});

// ─── Step 4: Right column — ValidationRulesSection rule interactions ───────

test.describe("Right column — validation rule interactions", () => {
  test("required toggle ON shows required-error-key field; OFF hides it", async ({ page }) => {
    // Default type is string.
    const requiredToggle = page.getByTestId("tcb-required");
    // Toggle ON
    await requiredToggle.click();
    await expectVisible(page, "tcb-required-error-key");
    // Toggle OFF
    await requiredToggle.click();
    await expectHidden(page, "tcb-required-error-key");
  });

  test("min set shows min-error-key field; cleared hides it", async ({ page }) => {
    const minInput = page.getByTestId("tcb-min");
    await minInput.fill("5");
    await expectVisible(page, "tcb-min-error-key");
    await minInput.fill("");
    await expectHidden(page, "tcb-min-error-key");
  });

  test("max set shows max-error-key field; cleared hides it", async ({ page }) => {
    const maxInput = page.getByTestId("tcb-max");
    await maxInput.fill("100");
    await expectVisible(page, "tcb-max-error-key");
    await maxInput.fill("");
    await expectHidden(page, "tcb-max-error-key");
  });

  test("regex pattern set shows regex-error-key field; cleared hides it", async ({ page }) => {
    const regexInput = page.getByTestId("tcb-regex");
    await regexInput.fill("^[A-Z]{3}$");
    await expectVisible(page, "tcb-regex-error-key");
    await regexInput.fill("");
    await expectHidden(page, "tcb-regex-error-key");
  });

  test("invalid regex pattern shows tcb-regex-error", async ({ page }) => {
    const regexInput = page.getByTestId("tcb-regex");
    await regexInput.fill("[invalid");
    await expectVisible(page, "tcb-regex-error");
  });

  test("valid regex pattern hides tcb-regex-error", async ({ page }) => {
    const regexInput = page.getByTestId("tcb-regex");
    await regexInput.fill("^[A-Z]{3}$");
    await expectHidden(page, "tcb-regex-error");
  });

  test("url protocols set shows url-error-key field; cleared hides it", async ({ page }) => {
    await selectType(page, "URL");
    const urlProtocolsInput = page.getByTestId("tcb-url-protocols");
    await urlProtocolsInput.fill("https");
    await expectVisible(page, "tcb-url-error-key");
    await urlProtocolsInput.fill("");
    await expectHidden(page, "tcb-url-error-key");
  });

  test("unsigned toggle ON for bigint changes value validation to reject negatives", async ({ page }) => {
    await selectType(page, "BigInt");
    // Toggle unsigned ON
    await page.getByTestId("tcb-unsigned").click();
    // Enter a negative value
    const valueInput = page.getByTestId("config-input-number-create");
    await valueInput.fill("-5");
    await expectFieldError(page, "config-input-number-create");
  });

  test("unsigned toggle OFF for bigint allows negatives", async ({ page }) => {
    await selectType(page, "BigInt");
    // Unsigned is OFF by default
    const valueInput = page.getByTestId("config-input-number-create");
    await valueInput.fill("-5");
    await expectNoFieldError(page, "config-input-number-create");
  });
});

// ─── Step 5: Value field validation per type × rule ────────────────────────

test.describe("Value field validation per type × rule", () => {
  // ── String-derived types: min/max/regex ──────────────────────────────────

  test("string: value shorter than min shows tooShort error", async ({ page }) => {
    await page.getByTestId("tcb-min").fill("5");
    const valueInput = page.getByTestId("config-input-string-create");
    await valueInput.fill("ab");
    await expectFieldError(page, "config-input-string-create");
  });

  test("string: value longer than max shows tooLong error", async ({ page }) => {
    await page.getByTestId("tcb-max").fill("3");
    const valueInput = page.getByTestId("config-input-string-create");
    await valueInput.fill("abcd");
    await expectFieldError(page, "config-input-string-create");
  });

  test("string: value not matching regex shows regexMismatch error", async ({ page }) => {
    await page.getByTestId("tcb-regex").fill("^[A-Z]{3}$");
    const valueInput = page.getByTestId("config-input-string-create");
    await valueInput.fill("abc");
    await expectFieldError(page, "config-input-string-create");
  });

  test("string: value matching regex shows no error", async ({ page }) => {
    await page.getByTestId("tcb-regex").fill("^[A-Z]{3}$");
    const valueInput = page.getByTestId("config-input-string-create");
    await valueInput.fill("ABC");
    await expectNoFieldError(page, "config-input-string-create");
  });

  test("string: required + empty shows required error", async ({ page }) => {
    await page.getByTestId("tcb-required").click();
    const valueInput = page.getByTestId("config-input-string-create");
    await valueInput.fill("");
    await expectFieldError(page, "config-input-string-create");
  });

  test("text: min validation shows tooShort error", async ({ page }) => {
    await selectType(page, "Text");
    await page.getByTestId("tcb-min").fill("5");
    const valueInput = page.getByTestId("config-input-text-create");
    await valueInput.fill("ab");
    await expectFieldError(page, "config-input-text-create");
  });

  test("text: max validation shows tooLong error", async ({ page }) => {
    await selectType(page, "Text");
    await page.getByTestId("tcb-max").fill("3");
    const valueInput = page.getByTestId("config-input-text-create");
    await valueInput.fill("abcd");
    await expectFieldError(page, "config-input-text-create");
  });

  test("text: regex validation shows regexMismatch error", async ({ page }) => {
    await selectType(page, "Text");
    await page.getByTestId("tcb-regex").fill("^[A-Z]{3}$");
    const valueInput = page.getByTestId("config-input-text-create");
    await valueInput.fill("abc");
    await expectFieldError(page, "config-input-text-create");
  });

  test("secret: min validation shows tooShort error", async ({ page }) => {
    await selectType(page, "Secret");
    await page.getByTestId("tcb-min").fill("5");
    const valueInput = page.getByTestId("config-input-secret-create");
    await valueInput.fill("ab");
    await expectFieldError(page, "config-input-secret-create");
  });

  test("secret: max validation shows tooLong error", async ({ page }) => {
    await selectType(page, "Secret");
    await page.getByTestId("tcb-max").fill("3");
    const valueInput = page.getByTestId("config-input-secret-create");
    await valueInput.fill("abcd");
    await expectFieldError(page, "config-input-secret-create");
  });

  test("secret: regex validation shows regexMismatch error", async ({ page }) => {
    await selectType(page, "Secret");
    await page.getByTestId("tcb-regex").fill("^[A-Z]{3}$");
    const valueInput = page.getByTestId("config-input-secret-create");
    await valueInput.fill("abc");
    await expectFieldError(page, "config-input-secret-create");
  });

  // ── Numeric types: type + min/max + unsigned ──────────────────────────────

  test("bigint: non-numeric value shows invalidBigint error", async ({ page }) => {
    await selectType(page, "BigInt");
    const valueInput = page.getByTestId("config-input-number-create");
    await valueInput.fill("abc");
    await expectFieldError(page, "config-input-number-create");
  });

  test("bigint: negative with unsigned shows invalidBigintUnsigned error", async ({ page }) => {
    await selectType(page, "BigInt");
    await page.getByTestId("tcb-unsigned").click();
    const valueInput = page.getByTestId("config-input-number-create");
    await valueInput.fill("-5");
    await expectFieldError(page, "config-input-number-create");
  });

  test("bigint: value below min shows min error", async ({ page }) => {
    await selectType(page, "BigInt");
    await page.getByTestId("tcb-min").fill("10");
    const valueInput = page.getByTestId("config-input-number-create");
    await valueInput.fill("5");
    await expectFieldError(page, "config-input-number-create");
  });

  test("bigint: value above max shows max error", async ({ page }) => {
    await selectType(page, "BigInt");
    await page.getByTestId("tcb-max").fill("100");
    const valueInput = page.getByTestId("config-input-number-create");
    await valueInput.fill("500");
    await expectFieldError(page, "config-input-number-create");
  });

  test("number: non-numeric shows invalidNumber error", async ({ page }) => {
    await selectType(page, "Number");
    const valueInput = page.getByTestId("config-input-number-create");
    await valueInput.fill("abc");
    await expectFieldError(page, "config-input-number-create");
  });

  test("number: value below min shows min error", async ({ page }) => {
    await selectType(page, "Number");
    await page.getByTestId("tcb-min").fill("10");
    const valueInput = page.getByTestId("config-input-number-create");
    await valueInput.fill("5");
    await expectFieldError(page, "config-input-number-create");
  });

  test("number: value above max shows max error", async ({ page }) => {
    await selectType(page, "Number");
    await page.getByTestId("tcb-max").fill("100");
    const valueInput = page.getByTestId("config-input-number-create");
    await valueInput.fill("500");
    await expectFieldError(page, "config-input-number-create");
  });

  test("money: non-numeric shows invalidNumber error", async ({ page }) => {
    await selectType(page, "Money");
    const valueInput = page.getByTestId("config-input-money-create");
    await valueInput.fill("abc");
    await expectFieldError(page, "config-input-money-create");
  });

  test("money: value below min shows min error", async ({ page }) => {
    await selectType(page, "Money");
    await page.getByTestId("tcb-min").fill("10");
    const valueInput = page.getByTestId("config-input-money-create");
    await valueInput.fill("5");
    await expectFieldError(page, "config-input-money-create");
  });

  // ── Type-specific value validation ────────────────────────────────────────

  test("url: malformed URL shows invalidUrl error", async ({ page }) => {
    await selectType(page, "URL");
    const valueInput = page.getByTestId("config-input-url-create");
    await valueInput.fill("not-a-url");
    await expectFieldError(page, "config-input-url-create");
  });

  test("url: valid URL shows no error", async ({ page }) => {
    await selectType(page, "URL");
    const valueInput = page.getByTestId("config-input-url-create");
    await valueInput.fill("https://example.com");
    await expectNoFieldError(page, "config-input-url-create");
  });

  test("url: protocol not in allowed list shows invalidUrlProtocol error", async ({ page }) => {
    await selectType(page, "URL");
    await page.getByTestId("tcb-url-protocols").fill("https");
    const valueInput = page.getByTestId("config-input-url-create");
    await valueInput.fill("http://example.com");
    await expectFieldError(page, "config-input-url-create");
  });

  test("email: malformed shows invalidEmail error", async ({ page }) => {
    await selectType(page, "Email");
    const valueInput = page.getByTestId("config-input-email-create");
    await valueInput.fill("not-an-email");
    await expectFieldError(page, "config-input-email-create");
  });

  test("email: valid shows no error", async ({ page }) => {
    await selectType(page, "Email");
    const valueInput = page.getByTestId("config-input-email-create");
    await valueInput.fill("a@b.com");
    await expectNoFieldError(page, "config-input-email-create");
  });

  test("phone: invalid shows invalidPhone error", async ({ page }) => {
    await selectType(page, "Phone");
    const valueInput = page.getByTestId("config-input-phone-create");
    await valueInput.fill("123");
    await expectFieldError(page, "config-input-phone-create");
  });

  test("phone: valid shows no error", async ({ page }) => {
    await selectType(page, "Phone");
    const valueInput = page.getByTestId("config-input-phone-create");
    await valueInput.fill("+15551234567");
    await expectNoFieldError(page, "config-input-phone-create");
  });

  test("json: malformed shows invalidJson error", async ({ page }) => {
    await selectType(page, "JSON");
    const valueInput = page.getByTestId("config-input-text-create");
    await valueInput.fill("{invalid");
    await expectFieldError(page, "config-input-text-create");
  });

  test("json: valid shows no error", async ({ page }) => {
    await selectType(page, "JSON");
    const valueInput = page.getByTestId("config-input-text-create");
    await valueInput.fill('{"a":1}');
    await expectNoFieldError(page, "config-input-text-create");
  });

  // ── Badge / select / date types (required only) ───────────────────────────

  test("badge: required + no selection shows required error", async ({ page }) => {
    await selectType(page, "Badge");
    await page.getByTestId("tcb-required").click();
    // Badge value widget is a ComboSelect — leave it empty.
    await expectFieldError(page, "config-input-badge-create");
  });

  test("single_select: required + no selection shows required error", async ({ page }) => {
    await selectType(page, "Single Select");
    await page.getByTestId("tcb-required").click();
    await expectFieldError(page, "config-input-single-select-create");
  });

  test("multi_select: required + no selection shows required error", async ({ page }) => {
    await selectType(page, "Multi Select");
    await page.getByTestId("tcb-required").click();
    await expectFieldError(page, "config-input-multi-select-create");
  });

  test("date: required + empty shows required error", async ({ page }) => {
    await selectType(page, "Date");
    await page.getByTestId("tcb-required").click();
    // DateWheelPicker has no testid — assert the value field error via the
    // FormField container. The error appears in the FormField's error area.
    // We locate via the form's value field by its label context.
    // The value FormField is the 3rd FormField on the page. We scope to the
    // config-create-type's ancestor form and look for the value field's errors.
    const form = page.locator("#config-create-form");
    // The value field errors are in the FormField with name="value".
    // TranslatedFormFieldErrors renders inside the value FormField.
    // We assert at least one .text-destructive appears in the form after
    // toggling required (the required error on the empty value).
    await expect(form.locator(".text-destructive").first()).toBeVisible({ timeout: 5000 });
  });

  test("datetime: required + empty shows required error", async ({ page }) => {
    await selectType(page, "DateTime");
    await page.getByTestId("tcb-required").click();
    const form = page.locator("#config-create-form");
    await expect(form.locator(".text-destructive").first()).toBeVisible({ timeout: 5000 });
  });

  test("time: required + empty shows required error", async ({ page }) => {
    await selectType(page, "Time");
    await page.getByTestId("tcb-required").click();
    const form = page.locator("#config-create-form");
    await expect(form.locator(".text-destructive").first()).toBeVisible({ timeout: 5000 });
  });
});

// ─── Step 6: WidgetConfigSection per type ───────────────────────────────────

test.describe("Widget config section per type", () => {
  test("money: currency selector visible and changeable", async ({ page }) => {
    await selectType(page, "Money");
    await expectVisible(page, "tcb-currency");
    // Open the currency selector and pick a different currency.
    const currencyTrigger = page.getByTestId("tcb-currency");
    await currencyTrigger.click();
    const option = page.locator("[role='option']").first();
    await option.waitFor({ state: "visible", timeout: 10000 });
    await option.click();
  });

  test("badge: add/remove badge value rows", async ({ page }) => {
    await selectType(page, "Badge");
    // Initially no rows — click add.
    await page.getByTestId("tcb-badge-add").click();
    await expectVisible(page, "tcb-badge-value");
    await expectVisible(page, "tcb-badge-remove");
    // Remove the row.
    await page.getByTestId("tcb-badge-remove").click();
    await expectHidden(page, "tcb-badge-value");
  });

  test("badge: badge value/label/color inputs editable", async ({ page }) => {
    await selectType(page, "Badge");
    await page.getByTestId("tcb-badge-add").click();
    await page.getByTestId("tcb-badge-value").fill("active");
    await page.getByTestId("tcb-badge-label").fill("Active");
    await page.getByTestId("tcb-badge-color").fill("#00ff00");
    // Verify the values are set.
    await expect(page.getByTestId("tcb-badge-value")).toHaveValue("active");
    await expect(page.getByTestId("tcb-badge-label")).toHaveValue("Active");
  });

  test("single_select: builtin source mode shows builtin-source selector", async ({ page }) => {
    await selectType(page, "Single Select");
    // Builtin mode is the default.
    await expectVisible(page, "tcb-source-builtin");
    await expectVisible(page, "tcb-builtin-source");
    await expectHidden(page, "tcb-api-url");
  });

  test("single_select: api source mode shows api-url, api-verb, value-field, label-field", async ({ page }) => {
    await selectType(page, "Single Select");
    await page.getByTestId("tcb-source-api").click();
    await expectVisible(page, "tcb-api-url");
    await expectVisible(page, "tcb-api-verb");
    await expectVisible(page, "tcb-value-field");
    await expectVisible(page, "tcb-label-field");
    await expectHidden(page, "tcb-builtin-source");
  });

  test("multi_select: same source editor behavior as single_select", async ({ page }) => {
    await selectType(page, "Multi Select");
    await expectVisible(page, "tcb-source-builtin");
    await expectVisible(page, "tcb-builtin-source");
    // Switch to API mode.
    await page.getByTestId("tcb-source-api").click();
    await expectVisible(page, "tcb-api-url");
    await expectVisible(page, "tcb-api-verb");
    await expectVisible(page, "tcb-value-field");
    await expectVisible(page, "tcb-label-field");
  });
});

// ─── Step 7: Advanced JSON mode ─────────────────────────────────────────────

test.describe("Advanced JSON mode", () => {
  test("advanced toggle ON shows raw JSON editor; OFF shows preview", async ({ page }) => {
    // Default: advanced OFF → preview visible.
    await expectVisible(page, "tcb-preview-toggle");
    // Toggle advanced ON.
    await page.getByTestId("tcb-advanced").click();
    await expectVisible(page, "tcb-raw-json");
    await expectHidden(page, "tcb-preview-toggle");
    // Toggle advanced OFF.
    await page.getByTestId("tcb-advanced").click();
    await expectVisible(page, "tcb-preview-toggle");
    await expectHidden(page, "tcb-raw-json");
  });

  test("invalid JSON in raw editor shows tcb-raw-json-error", async ({ page }) => {
    await page.getByTestId("tcb-advanced").click();
    const rawJsonEditor = page.getByTestId("tcb-raw-json");
    await rawJsonEditor.fill("{invalid");
    await expectVisible(page, "tcb-raw-json-error");
  });

  test("valid JSON in raw editor hides error and updates preview", async ({ page }) => {
    await page.getByTestId("tcb-advanced").click();
    const rawJsonEditor = page.getByTestId("tcb-raw-json");
    await rawJsonEditor.fill('{"validation":{"required":true}}');
    await expectHidden(page, "tcb-raw-json-error");
    // Toggle back to preview mode.
    await page.getByTestId("tcb-advanced").click();
    const preview = page.getByTestId("tcb-json-preview");
    await expect(preview).toContainText('"required":true');
  });

  test("preview toggle collapses/expands JSON preview", async ({ page }) => {
    // Preview is open by default.
    await expectVisible(page, "tcb-json-preview");
    // Collapse.
    await page.getByTestId("tcb-preview-toggle").click();
    await expectHidden(page, "tcb-json-preview");
    // Expand.
    await page.getByTestId("tcb-preview-toggle").click();
    await expectVisible(page, "tcb-json-preview");
  });
});
