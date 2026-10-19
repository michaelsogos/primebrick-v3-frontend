import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/**
 * /system/jobs — first module-owned remote page (esm-mount pilot) E2E.
 *
 * The route's UI is shipped by the job service as a precompiled ESM chunk
 * (`/ws/job/api/v1/module-assets/jobs-page.js`); the FE route is a shim that
 * resolves the route declaration from the routes census and mounts it via
 * RemotePageMount. These specs verify:
 *
 *   - the remote chunk mounts and renders the four job sections
 *   - the page is reachable through the settings-module sidebar link
 *   - asset delivery failures degrade to an IN-CONTENT error panel — the
 *     app shell is never replaced by the system full-page error
 *   - the error panel's retry recovers without a reload
 *
 * Requires the live stack: FE :5173, BE :3001, job service :3006 with
 * fe/dist built (job-handler `pnpm fe:build` / `prebuild` handles it).
 */

const REMOTE_CONTENT = "[data-testid='remote-page-content']";
const REMOTE_ERROR = "[data-testid='remote-page-error']";
const SYSTEM_ERROR_PAGE = "[data-testid='error-page']";

test.describe("/system/jobs (remote module page)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("mounts the remote chunk and renders the four job sections", async ({
    page,
  }) => {
    await page.goto("/system/jobs", { waitUntil: "domcontentloaded" });

    // Chunk probe-fetch + import + mount — generous timeout for cold dev
    // transform; the loading skeleton may flash first.
    const content = page.locator(REMOTE_CONTENT);
    await expect(content).toBeVisible({ timeout: 30000 });

    // Never the system full-page error, never the in-content error panel.
    await expect(page.locator(SYSTEM_ERROR_PAGE)).toHaveCount(0);
    await expect(page.locator(REMOTE_ERROR)).toHaveCount(0);

    // Remote page chrome: title + four sections (recurring / once / rules /
    // runs), each hosting a mount_host'd EntityListTable.
    await expect(
      content.locator("h1", { hasText: /./ }).first(),
    ).toBeVisible();
    await expect(content.locator("section")).toHaveCount(4);

    // At least one host-mounted entity table finishes loading (meta + rows
    // round-trips through ctx.api → /ws/job → job:3006).
    await expect(
      content.locator("table").first(),
    ).toBeVisible({ timeout: 30000 });
  });

  test("is reachable through the settings-module sidebar link", async ({
    page,
  }) => {
    // Any /system/* route activates the settings module — its nav list
    // contains the jobs entry (module-nav-meta: id 'jobs', icon list-clock).
    await page.goto("/system/settings/profile", {
      waitUntil: "domcontentloaded",
    });

    const jobsLink = page.locator("a[href='/system/jobs']").first();
    await expect(jobsLink).toBeVisible({ timeout: 15000 });
    await jobsLink.click();

    await page.waitForURL("**/system/jobs", { timeout: 10000 });
    await expect(page.locator(REMOTE_CONTENT)).toBeVisible({ timeout: 30000 });
    await expect(page.locator(REMOTE_ERROR)).toHaveCount(0);
  });

  test("asset failure degrades to an in-content error panel — shell stays", async ({
    page,
  }) => {
    // Simulate the job service's module-assets endpoint being unreachable:
    // the chunk fetch aborts before import() is even attempted.
    await page.route("**/api/v1/module-assets/**", (route) =>
      route.abort("connectionrefused"),
    );

    await page.goto("/system/jobs", { waitUntil: "domcontentloaded" });

    // In-content error panel — classified 'network' (fetch threw).
    const errorPanel = page.locator(REMOTE_ERROR);
    await expect(errorPanel).toBeVisible({ timeout: 30000 });
    await expect(errorPanel).toHaveAttribute("data-error-kind", "network");

    // The app shell survives: sidebar nav is still rendered, and the
    // failure NEVER escalated to the system full-page error.
    await expect(page.locator(SYSTEM_ERROR_PAGE)).toHaveCount(0);
    await expect(
      page.locator("a[href='/system/jobs']").first(),
    ).toBeVisible();

    // Retry recovers: unblock the asset and hit the panel's retry action —
    // the remote mounts without a page reload.
    await page.unroute("**/api/v1/module-assets/**");
    await page.getByTestId("remote-page-retry").click();
    await expect(page.locator(REMOTE_CONTENT)).toBeVisible({ timeout: 30000 });
    await expect(errorPanel).toHaveCount(0);
  });
});
