import { extJsonStringify, extJsonParse } from "@primebrick/core/ext-json";
import { test, expect, type Page, type Route } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

// Shared Edge session + one ephemeral actor: parallel workers race the same
// login surface. Vendor drift is sequential user evidence, never concurrency.
test.describe.configure({ mode: "serial" });

/* Vendor drift proportionality — the end-user contract (2026-11-27):
 * a remote page must NEVER die on a patch drift, and NEVER die on ANY
 * @primebrick/* drift — the enforcement of version staleness lives at
 * lint time, not in the user's face. Third-party minor/major drift keeps
 * the runtime block because internal API shapes genuinely change.
 *
 * The simulation intercepts the host vendor-manifest.json and inflates
 * versions — the same wire the loader handshakes against, no fixtures:
 *
 *   @primebrick/* minor drift  → page MOUNTS (never blocks, any drift)
 *   third-party patch drift    → page MOUNTS
 *   third-party minor drift    → vendor error panel (still blocked)
 *
 * Vehicle: /crm/customers/create — the live component_url route on the
 * crm-pages chunk (same remote-mount machinery every remote page rides).
 */

const REMOTE_CONTENT = '[data-testid="remote-page-content"]';
const REMOTE_ERROR = '[data-testid="remote-page-error"]';

type ManifestEntry = { url: string; version: string };
type Manifest = Record<string, ManifestEntry>;

/** Rewrite the host manifest versions for keys matching `match`. */
async function serveDriftedManifest(
  page: Page,
  match: (key: string) => boolean,
  bump: (version: string) => string,
): Promise<void> {
  await page.route("**/vendor-manifest.json", async (route: Route) => {
    const res = await route.fetch();
    const manifest = extJsonParse(await res.text()) as Manifest;
    for (const [key, entry] of Object.entries(manifest)) {
      if (match(key)) entry.version = bump(entry.version);
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: extJsonStringify(manifest),
    });
  });
}

function bumpMinor(version: string): string {
  const [major, minor] = version.split(".");
  return `${major}.${Number(minor) + 1}.0`;
}

function bumpPatch(version: string): string {
  const [major, minor] = version.split(".");
  return `${major}.${minor}.99`;
}

test.describe("vendor drift proportionality — runtime never brutal", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("@primebrick/* minor drift — the remote page MOUNTS, never blocks", async ({ page }) => {
    await serveDriftedManifest(page, (key) => key.startsWith("@primebrick/"), bumpMinor);
    await page.goto("/crm/customers/create", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(REMOTE_CONTENT),
      "the page mounts despite @primebrick minor drift — runtime never blocks our libs",
    ).toBeVisible({ timeout: 5_000 });
    expect(await page.locator(REMOTE_ERROR).count(), "no vendor error panel for @primebrick drift").toBe(0);
  });

  test("third-party patch drift — the remote page MOUNTS", async ({ page }) => {
    await serveDriftedManifest(page, (key) => key.startsWith("svelte"), bumpPatch);
    await page.goto("/crm/customers/create", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(REMOTE_CONTENT),
      "the page mounts despite a svelte patch drift",
    ).toBeVisible({ timeout: 5_000 });
    expect(await page.locator(REMOTE_ERROR).count(), "no vendor error panel for patch drift").toBe(0);
  });

  test("third-party minor drift — the vendor error panel still blocks", async ({ page }) => {
    await serveDriftedManifest(page, (key) => key.startsWith("svelte"), bumpMinor);
    await page.goto("/crm/customers/create", { waitUntil: "domcontentloaded" });
    const errorPanel = page.locator(REMOTE_ERROR);
    await expect(
      errorPanel,
      "svelte minor drift keeps the runtime block — internal API shapes genuinely change",
    ).toBeVisible({ timeout: 5_000 });
    await expect(errorPanel).toHaveAttribute("data-error-kind", "vendor");
    // The content container is always in the DOM (binds before import resolves)
    // — the truthful assertion is that it stays hidden and empty behind the block.
    const content = page.locator(REMOTE_CONTENT);
    await expect(content, "the content container stays hidden behind the vendor block").toBeHidden();
    expect(await content.innerHTML(), "nothing mounts inside the blocked container").toBe("");
  });
});
