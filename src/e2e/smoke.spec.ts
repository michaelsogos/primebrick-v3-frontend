import { test, expect } from "@playwright/test";

/**
 * Smoke E2E test — verifies the dev server is reachable and the login page
 * renders. Minimal E2E test to confirm the Playwright setup works.
 * Full E2E tests for user flows (login, navigation, CRUD) are separate tasks.
 */
test("login page loads and renders content", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  // Wait for SvelteKit hydration — the body should have meaningful content
  await expect(page.locator("body")).not.toBeEmpty();
  // Wait for at least one heading or input to appear (post-hydration)
  await expect(page.locator("h1, h2, input, button").first()).toBeVisible({ timeout: 10000 });
});

test("welcome page loads and renders content", async ({ page }) => {
  await page.goto("/welcome", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).not.toBeEmpty();
  await expect(page.locator("h1, h2, input, button").first()).toBeVisible({ timeout: 10000 });
});
