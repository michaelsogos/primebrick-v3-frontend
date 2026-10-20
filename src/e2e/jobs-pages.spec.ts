import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/**
 * /jobs — the job module's pages E2E.
 *
 * The job module owns the `/jobs` route prefix (self-declared via
 * `endpoints.nav`). Three pages are HOST-rendered standard list
 * archetypes (kind:"list" → EntityTablePage over /ws/job):
 *
 *   /jobs        job_schedule — `schedule_kind` toolbar preset +
 *                builtin sparkline column
 *   /jobs/runs   job_run      — duration_ms humanizer cell
 *   /jobs/rules  job_rule
 *
 * The module's only custom surface is REMOTE-delivered:
 *
 *   /jobs/new    manual schedule form (jobs-page.js esm-mount chunk)
 *
 * These specs verify: standard single-table rendering, preset AND-ing on
 * the wire, sparkline batch fetch, exactly-one-active nav item
 * (longest-match), module-correct breadcrumbs, module ownership, and the
 * remote page's in-content failure recovery.
 *
 * Requires the live stack: FE :5173, BE :3001, job service :3006 with
 * fe/dist built (job-handler `pnpm fe:build` / `prebuild` handles it).
 */

const REMOTE_CONTENT = "[data-testid='remote-page-content']";
const REMOTE_ERROR = "[data-testid='remote-page-error']";
const SYSTEM_ERROR_PAGE = "[data-testid='error-page']";
const SIDEBAR_LINKS = "[data-sidebar='content'] a[href]";

test.describe("/jobs pages (module-owned)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("/jobs renders ONE standard list table for job_schedule", async ({
    page,
  }) => {
    await page.goto("/jobs", { waitUntil: "domcontentloaded" });
    await expect(page.locator(SYSTEM_ERROR_PAGE)).toHaveCount(0);

    // Standard archetype: a single EntityTablePage table — not the old
    // multi-section custom page.
    const tables = page.locator("table");
    await expect(tables).toHaveCount(1, { timeout: 30000 });
    // Schedule CTA (page-level header action) → the remote /jobs/new page.
    await expect(page.getByTestId("jobs-schedule-cta")).toBeVisible();
  });

  test("schedule_kind preset: meta-declared toolbar scope, always one active", async ({
    page,
  }) => {
    const listUrls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/entities/job_schedule/list"))
        listUrls.push(decodeURIComponent(req.url()));
    });

    await page.goto("/jobs", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });

    // Every segmented toolbar group that RENDERS options (view mode,
    // preset, deletion filter when the entity is soft-deletable) has
    // exactly one option active — the always-one-selected contract,
    // asserted as an invariant. Groups with no pressed-capable children
    // (e.g. the search-scope wrapper) are out of scope.
    const groups = page
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

    // Button groups are ICON-ONLY by design — no visible label text, the
    // meaning is carried by the tooltip (title) and the accessible name.
    const presetGroup = groups.filter({
      has: page.getByRole("button", {
        name: /once|esecuzione singola|einmalig|exécution unique|ejecución única|execução única/i,
      }),
    });
    for (const btn of await presetGroup
      .first()
      .locator("button[aria-pressed]")
      .all()) {
      await expect(btn).toHaveAttribute("title", /\S/);
      expect(await btn.innerText()).toBe("");
      await expect(btn.locator("svg")).toBeVisible();
    }
    // Icon contract: single-execution option uses "zap"; the all-option
    // uses the same icon as the jobs page (list-clock).
    await expect(
      presetGroup.first().locator("button svg.lucide-zap"),
    ).toBeVisible();
    await expect(
      presetGroup.first().locator("button svg.lucide-list-clock"),
    ).toBeVisible();

    // Switching options re-queries with the new scope. Clicks are scoped
    // inside the preset group (other controls may share the label) and
    // retried until aria-pressed flips — a click landing before hydration
    // is silently dropped by the browser.
    const preset = presetGroup.first();
    const onceBtn = preset.getByRole("button", {
      name: /once|esecuzione singola|einmalig|exécution unique|ejecución única|execução única/i,
    });
    const allBtn = preset.getByRole("button", {
      name: /all|tutte|alle|toutes|todas/i,
    });
    await expect(async () => {
      await onceBtn.click();
      await expect(onceBtn).toHaveAttribute("aria-pressed", "true", {
        timeout: 2000,
      });
    }).toPass({ timeout: 15000 });
    await expect(async () => {
      const u = listUrls.at(-1) ?? "";
      expect(u).toContain("filters[0][value]=once");
    }).toPass({ timeout: 10000 });

    // "All" is the escape option — a real selection applying no condition:
    // the request carries NO schedule_type scope filter.
    await expect(async () => {
      await allBtn.click();
      await expect(allBtn).toHaveAttribute("aria-pressed", "true", {
        timeout: 2000,
      });
    }).toPass({ timeout: 15000 });
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

    await page.goto("/jobs", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });

    // The run_stats column is meta-declared (type:"sparkline") — the engine
    // batch-POSTs the row keys; cells render the shared SparklineBars svg.
    await expect
      .poll(() => statsRequests.length, { timeout: 15000 })
      .toBeGreaterThan(0);
    const sparklineCells = page.locator(
      "td svg[aria-label='sparkline'], td span",
    );
    await expect(sparklineCells.first()).toBeVisible();
  });

  test("/jobs/runs and /jobs/rules render standard list tables", async ({
    page,
  }) => {
    for (const route of ["/jobs/runs", "/jobs/rules"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator(SYSTEM_ERROR_PAGE)).toHaveCount(0);
      await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    }
  });

  test("/jobs/rules exposes the create CTA → /jobs/rules/new remote form", async ({
    page,
  }) => {
    await page.goto("/jobs/rules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });

    // create.single is enabled for admins — the New CTA must be present
    // and navigate to the module-owned remote create page.
    const createBtn = page.getByTestId("entity-create-cta");
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    await page.waitForURL("**/jobs/rules/new", { timeout: 10000 });
    const content = page.locator(REMOTE_CONTENT);
    await expect(content).toBeVisible({ timeout: 30000 });
    await expect(content.locator("input#rule-name")).toBeVisible();
    await expect(content.locator("input#rule-event")).toBeVisible();
    await expect(content.locator("input#rule-spec")).toBeVisible();
    await expect(content.locator("input#rule-target")).toBeVisible();
  });

  test("job_run version history endpoint works — audit tables exist", async ({
    page,
  }) => {
    await page.goto("/jobs/runs", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });

    // The regression was `relation "job.job_runs_audit" does not exist` —
    // the endpoint must answer 200 (empty page is fine, the table exists).
    const result = await page.evaluate(async () => {
      const list = await fetch(
        "/ws/job/api/v1/entities/job_run/list?page=1&page_size=1",
      )
        .then((r) => r.json())
        .catch(() => null);
      const row = list?.rows?.[0] ?? null;
      if (!row?.uuid) return { status: -1, body: "no job_run row" };
      const res = await fetch(
        `/ws/job/api/v1/entities/job_run/${row.uuid}/audit?page=1&limit=20`,
      );
      return { status: res.status, body: await res.text() };
    });
    expect(result.status).toBe(200);
    expect(result.body).not.toContain("does not exist");
  });

  test("cold load hydrates cleanly — no effect_orphan (vite deps must stay consistent)", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    // Full document loads — every hydration path must stay orphan-free.
    for (const route of ["/jobs", "/jobs/rules", "/system/settings/profile"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator(SYSTEM_ERROR_PAGE)).toHaveCount(0);
    }
    expect(errors.filter((e) => e.includes("effect_orphan"))).toEqual([]);
  });

  test("sidebar: exactly ONE nav item active on /jobs/rules", async ({
    page,
  }) => {
    await page.goto("/jobs/rules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    // Wait for module nav to resolve.
    await expect(
      page.locator("a[href='/jobs/rules']").first(),
    ).toBeVisible({ timeout: 15000 });

    // Longest-match wins: /jobs/rules is active, /jobs is NOT (it is a
    // prefix of the current route, not the route itself).
    await expect(
      page.locator("a[href='/jobs/rules']"),
    ).toHaveAttribute("data-active", "true");
    await expect(page.locator("a[href='/jobs']")).not.toHaveAttribute(
      "data-active",
      "true",
    );

    // Invariant: never more than one active nav link in the sidebar.
    const activeCount = await page
      .locator(`${SIDEBAR_LINKS}[data-active='true']`)
      .count();
    expect(activeCount).toBe(1);
  });

  test("breadcrumb on /jobs/rules is the job module menu — never Settings", async ({
    page,
  }) => {
    await page.goto("/jobs/rules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    // Wait for module nav to load (breadcrumb items come from it).
    await expect(
      page.locator("a[href='/jobs/rules']").first(),
    ).toBeVisible({ timeout: 15000 });

    // The breadcrumb menu trigger carries the OWNING module's display
    // name as aria-label — "Job Handler", never "Settings" (the old
    // copy-paste bug rendered app.system + the settings tab menu here).
    const trigger = page.getByRole("button", { name: "Job Handler" });
    await expect(trigger).toBeVisible();

    // The breadcrumb ancestor contains no foreign-module segment.
    const breadcrumbNav = trigger.locator("xpath=ancestor::nav[1]");
    await expect(breadcrumbNav).not.toContainText(
      /settings|impostazioni|system/i,
    );
  });

  test("is owned by the job module — not by Settings", async ({ page }) => {
    await page.goto("/jobs", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });

    // The module switcher shows the OWNING module (service display name),
    // and its nav contains the self-declared links.
    const switcher = page.locator("button[title='Job Handler']");
    await expect(switcher).toBeVisible({ timeout: 15000 });
    await expect(page.locator("a[href='/jobs']").first()).toBeVisible();
    await expect(page.locator("a[href='/jobs/rules']").first()).toBeVisible();

    // Settings' nav does NOT present another module's pages.
    await page.goto("/system/settings/profile", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("button[title='Settings']")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator("a[href='/jobs']")).toHaveCount(0);
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

    // Module switcher → Job Handler: nav[0].href (/jobs) is the module
    // home — selection navigates straight onto the page.
    await page.locator("button[title='Settings']").click();
    await page.getByRole("menuitem", { name: "Job Handler" }).click();

    await page.waitForURL("**/jobs", { timeout: 10000 });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
  });

  test("/jobs/new mounts the remote schedule form", async ({ page }) => {
    await page.goto("/jobs/new", { waitUntil: "domcontentloaded" });

    const content = page.locator(REMOTE_CONTENT);
    await expect(content).toBeVisible({ timeout: 30000 });
    await expect(page.locator(SYSTEM_ERROR_PAGE)).toHaveCount(0);
    await expect(page.locator(REMOTE_ERROR)).toHaveCount(0);

    // The remote page renders its form fields.
    await expect(content.locator("form")).toBeVisible();
    await expect(content.locator("input#sched-name")).toBeVisible();
    await expect(content.locator("input#sched-spec")).toBeVisible();
  });

  test("remote asset failure degrades to an in-content error panel — shell stays", async ({
    page,
  }) => {
    // Simulate the job service's module-assets endpoint being unreachable:
    // the chunk fetch aborts before import() is even attempted.
    await page.route("**/api/v1/module-assets/**", (route) =>
      route.abort("connectionrefused"),
    );

    await page.goto("/jobs/new", { waitUntil: "domcontentloaded" });

    // In-content error panel — classified 'network' (fetch threw).
    const errorPanel = page.locator(REMOTE_ERROR);
    await expect(errorPanel).toBeVisible({ timeout: 30000 });
    await expect(errorPanel).toHaveAttribute("data-error-kind", "network");

    // The app shell survives: sidebar nav is still rendered, and the
    // failure NEVER escalated to the system full-page error.
    await expect(page.locator(SYSTEM_ERROR_PAGE)).toHaveCount(0);
    await expect(page.locator("a[href='/jobs']").first()).toBeVisible({
      timeout: 15000,
    });

    // Retry recovers: unblock the asset and hit the panel's retry action —
    // the remote mounts without a page reload.
    await page.unroute("**/api/v1/module-assets/**");
    await page.getByTestId("remote-page-retry").click();
    await expect(page.locator(REMOTE_CONTENT)).toBeVisible({ timeout: 30000 });
    await expect(errorPanel).toHaveCount(0);
  });
});
