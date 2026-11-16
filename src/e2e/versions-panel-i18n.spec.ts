/**
 * versions-panel i18n — installed-module names resolve through each
 * service's OWN dict (label_key → $t), never the raw registry `name`.
 * In it-IT every registered module has an Italian display name; an
 * unresolved key must still fall back to `name`, never the raw key.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

test.use({ actionTimeout: 5000 });

async function pinItalian(page: import("@playwright/test").Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const langNow = await page.evaluate(() => sessionStorage.getItem("pb.lang"));
  if (langNow !== "it-IT") {
    await page.evaluate(() => sessionStorage.setItem("pb.lang", "it-IT"));
    await page.reload({ waitUntil: "domcontentloaded" });
  }
}

test("versions panel — installed modules show localized display names (it-IT)", async ({
  page,
}) => {
  await loginAsTestAdmin(page);
  await pinItalian(page);
  await page.goto("/system/settings", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Versioni" }).first().click();
  const installed = page.getByTestId("versions-accordion-installed");
  await expect(installed).toBeVisible();
  // The accordion is default-collapsed for non-core sections.
  await installed.getByRole("button").first().click();

  // Known registry names vs their it-IT label_key translations — every
  // online module resolves its own dict (loaded best-effort by the
  // panel itself), so raw English names must NOT appear.
  const expected: Record<string, string> = {
    "Process Manager": "Gestore dei Processi",
    "Email Manager": "Gestore delle Email",
    "AI Assistants Manager": "Gestore degli Assistenti AI",
    "Webhook Ingress": "Ingresso Webhook",
    Settings: "Impostazioni",
  };
  for (const [english, italian] of Object.entries(expected)) {
    await expect(installed).toContainText(italian, { timeout: 15000 });
    // The English registry name must not render as the primary label —
    // scoped to the medium-weight span so the mono `code` note and the
    // base_url lines stay exempt.
    await expect(
      installed.locator("span.truncate.text-sm.font-medium", { hasText: english }),
    ).toHaveCount(0);
  }
  // No raw label_key ever leaks.
  await expect(installed).not.toContainText(/\.module\.name/);
});
