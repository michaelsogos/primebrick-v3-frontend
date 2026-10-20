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
 *   - the remote chunk mounts and renders the two job sections
 *     (schedules — scope via the meta-declared `schedule_kind` toolbar
 *     preset — and run history); job rules live on the host-rendered
 *     /system/jobs/rules EntityTablePage
 *   - MODULE OWNERSHIP: /system/jobs is declared by the job service's
 *     endpoints.nav registration — it resolves to the `job` module (longest
 *     route_prefix match), appears in the job sidebar nav, and is NOT part
 *     of the settings module's nav even though it lives under /system
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

  test("mounts the remote chunk and renders the two job sections", async ({
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

    // Remote page chrome: title + two sections (schedules / runs), each
    // hosting a mount_host'd EntityListTable.
    await expect(
      content.locator("h1", { hasText: /./ }).first(),
    ).toBeVisible();
    await expect(content.locator("section")).toHaveCount(2);

    // At least one host-mounted entity table finishes loading (meta + rows
    // round-trips through ctx.api → /ws/job → job:3006).
    await expect(
      content.locator("table").first(),
    ).toBeVisible({ timeout: 30000 });
  });

  test("schedule_kind preset: meta-declared toolbar scope, always one active", async ({
    page,
  }) => {
    const listUrls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/entities/job_schedule/list"))
        listUrls.push(decodeURIComponent(req.url()));
    });

    await page.goto("/system/jobs", { waitUntil: "domcontentloaded" });
    const content = page.locator(REMOTE_CONTENT);
    await expect(content).toBeVisible({ timeout: 30000 });
    const schedulesSection = content.locator("section").first();
    await expect(schedulesSection.locator("table")).toBeVisible({
      timeout: 30000,
    });

    // Every segmented toolbar group that RENDERS options (view mode,
    // preset, deletion filter when the entity is soft-deletable) has
    // exactly one option active — the always-one-selected contract,
    // asserted as an invariant. Groups with no pressed-capable children
    // (e.g. the search-scope wrapper) are out of scope.
    const groups = schedulesSection
      .locator("[data-slot='button-group']")
      .filter({ has: page.locator("button[aria-pressed]") });
    const groupCount = await groups.count();
    expect(groupCount).toBeGreaterThanOrEqual(2); // view mode + schedule_kind preset
    for (let i = 0; i < groupCount; i++) {
      await expect(
        groups.nth(i).locator("[aria-pressed='true']"),
      ).toHaveCount(1);
    }

    // The default scope ANDs into every list call as filters[0].
    const lastUrl = listUrls.at(-1) ?? "";
    expect(lastUrl).toContain("filters[0][field]=schedule_type");
    expect(lastUrl).toContain("filters[0][value]=recurring");

    // Switching to "Once" re-queries with the new scope — and the previous
    // option releases aria-pressed (mutually exclusive).
    await schedulesSection
      .locator("button[aria-pressed]")
      .filter({
        hasText: /once|esecuzione singola|einmalig|exécution unique|ejecución única|execução única/i,
      })
      .first()
      .click();
    await expect(async () => {
      const u = listUrls.at(-1) ?? "";
      expect(u).toContain("filters[0][value]=once");
    }).toPass({ timeout: 10000 });

    // "All" is the escape option — a real selection applying no condition:
    // the request carries NO schedule_type scope filter.
    await schedulesSection
      .locator("button[aria-pressed]")
      .filter({ hasText: /all|tutte|alle|toutes|todas/i })
      .first()
      .click();
    await expect(async () => {
      const u = listUrls.at(-1) ?? "";
      expect(u).not.toContain("schedule_type");
    }).toPass({ timeout: 10000 });
  });

  test("sparkline column is builtin — batch stats fetch + svg cells", async ({
    page,
  }) => {
    const statsRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/actions/job-run-stats"))
        statsRequests.push(req.url());
    });

    await page.goto("/system/jobs", { waitUntil: "domcontentloaded" });
    const schedulesSection = page
      .locator(REMOTE_CONTENT)
      .locator("section")
      .first();
    await expect(schedulesSection.locator("table")).toBeVisible({
      timeout: 30000,
    });

    // The run_stats column is meta-declared (type:"sparkline") — the engine
    // batch-POSTs the row keys; cells render the shared SparklineBars svg.
    await expect
      .poll(() => statsRequests.length, { timeout: 15000 })
      .toBeGreaterThan(0);
    // Sparkline svg (or its empty placeholder) inside schedule rows.
    const sparklineCells = schedulesSection.locator(
      "td svg[aria-label='sparkline'], td span",
    );
    await expect(sparklineCells.first()).toBeVisible();
  });

  test("job rules live on the host-rendered /system/jobs/rules list page", async ({
    page,
  }) => {
    // Declared by the job service (kind:"list", entity:"job_rule") —
    // rendered by the standard host EntityTablePage through /ws/job.
    await page.goto("/system/jobs/rules", { waitUntil: "domcontentloaded" });
    await expect(page.locator(SYSTEM_ERROR_PAGE)).toHaveCount(0);
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    // Sidebar: the job module nav carries both links.
    await expect(
      page.locator("a[href='/system/jobs']").first(),
    ).toBeVisible();
    await expect(
      page.locator("a[href='/system/jobs/rules']").first(),
    ).toBeVisible();
  });

  test("is owned by the job module — not by Settings", async ({ page }) => {
    // Longest route_prefix match: /system/jobs resolves to the `job`
    // module even though it sits under settings' broad /system prefix.
    await page.goto("/system/jobs", { waitUntil: "domcontentloaded" });
    await expect(page.locator(REMOTE_CONTENT)).toBeVisible({ timeout: 30000 });

    // The module switcher shows the OWNING module (service display name),
    // and its nav contains the self-declared jobs link.
    const switcher = page.locator("button[title='Job Handler']");
    await expect(switcher).toBeVisible({ timeout: 15000 });
    await expect(
      page.locator("a[href='/system/jobs']").first(),
    ).toBeVisible();

    // Settings' nav does NOT present another module's page: under a real
    // settings route the jobs link is absent.
    await page.goto("/system/settings/profile", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("button[title='Settings']")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator("a[href='/system/jobs']")).toHaveCount(0);
  });

  test("is reachable through the module switcher (job module home)", async ({
    page,
  }) => {
    await page.goto("/system/settings/profile", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("button[title='Settings']")).toBeVisible({
      timeout: 15000,
    });

    // Module switcher → Job Handler: its first route_prefix (/system/jobs)
    // is the module home — selection navigates straight onto the page.
    await page.locator("button[title='Settings']").click();
    await page.getByRole("menuitem", { name: "Job Handler" }).click();

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
