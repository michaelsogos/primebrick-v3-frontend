import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/**
 * /system/job — the job module's pages E2E.
 *
 * The job module owns the `/system/job` route prefix (self-declared via
 * `endpoints.nav`). Three pages are HOST-rendered standard list
 * archetypes (kind:"list" → EntityTablePage over /svc/job):
 *
 *   /system/job/job-schedules  job_schedule — `schedule_kind` toolbar
 *                              preset + builtin sparkline column
 *   /system/job/runs           job_run      — duration_ms humanizer cell
 *   /system/job/rules          job_rule
 *
 * The module's only custom surfaces are REMOTE-delivered (jobs-page.js
 * esm-mount chunk):
 *
 *   /system/job/job-schedules/create  manual schedule form
 *   /system/job/rules/create          rule form
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

/**
 * The job module's resolved display label — mirrors the FE
 * `resolveModuleLabel` contract: service_registry `label_key` resolved
 * in the module's OWN en-GB dict, raw `name` as fallback. Resolved live
 * so the assertion tracks the declared label, not a stale literal.
 */
async function expectedJobModuleLabel(page: import("@playwright/test").Page): Promise<string> {
  const modsRes = await page.request.get("/api/v1/modules");
  const mods = (((await modsRes.json()).modules ?? []) as Array<{
    id: string;
    name: string;
    label_key?: string;
  }>);
  const job = mods.find((m) => m.id === "job");
  if (!job?.label_key) return job?.name ?? "job";
  const dictRes = await page.request.get(`/api/v1/system/translations/${job.id}/en-GB`);
  const dict: Record<string, string> = dictRes.ok() ? await dictRes.json() : {};
  return dict[job.label_key] ?? job.name;
}

test.describe("/system/job/* pages (module-owned)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("/system/job/job-schedules renders ONE standard list table for job_schedule", async ({
    page,
  }) => {
    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
    await expect(page.locator(SYSTEM_ERROR_PAGE)).toHaveCount(0);

    // Standard archetype: a single EntityTablePage table — not the old
    // multi-section custom page.
    const tables = page.locator("table");
    await expect(tables).toHaveCount(1, { timeout: 30000 });
    // Schedule CTA — census-driven toolbar create (`kind:"create"` on
    // job_schedule → /system/job/job-schedules/create remote form, label
    // job.jobs.scheduleNew). navStrategy defaults to 'popup': the CTA opens
    // the remote create page in a NEW TAB — the parent stays on the list.
    const createBtn = page.getByTestId("entity-create-cta");
    await expect(createBtn).toBeVisible();
    const [popup] = await Promise.all([
      page.context().waitForEvent("page", { timeout: 15000 }),
      createBtn.click(),
    ]);
    await popup.waitForLoadState("domcontentloaded");
    await expect(popup).toHaveURL(/\/system\/job\/job-schedules\/create/);
    await expect(page).toHaveURL(/\/system\/job\/job-schedules$/);
    await popup.close();
  });

  test("schedule_kind preset: meta-declared toolbar scope, always one active", async ({
    page,
  }) => {
    const listUrls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/entities/job_schedule/list"))
        listUrls.push(decodeURIComponent(req.url()));
    });

    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
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
    const onceMark = listUrls.length;
    await expect(async () => {
      await onceBtn.click();
      await expect(onceBtn).toHaveAttribute("aria-pressed", "true", {
        timeout: 2000,
      });
    }).toPass({ timeout: 15000 });
    // Poll requests issued AFTER the click — `at(-1)` can pick a stale
    // in-flight list fetch (mount refetch under parallel-worker load).
    await expect(async () => {
      expect(
        listUrls.slice(onceMark).some((u) =>
          u.includes("filters[0][value]=once"),
        ),
      ).toBe(true);
    }).toPass({ timeout: 10000 });

    // "All" is the escape option — a real selection applying no condition:
    // the request carries NO schedule_type scope filter.
    const allMark = listUrls.length;
    await expect(async () => {
      await allBtn.click();
      await expect(allBtn).toHaveAttribute("aria-pressed", "true", {
        timeout: 2000,
      });
    }).toPass({ timeout: 15000 });
    await expect(async () => {
      expect(
        listUrls
          .slice(allMark)
          .some((u) => !u.includes("schedule_type")),
      ).toBe(true);
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

    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
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

    // The SAME sparkline must render in the card view modes — the batch
    // sparklineData map flows through the card chain into TableCell, and the
    // virtual column must not hit the empty-field (Ban) fallback.
    for (const icon of ["layout-list", "layout-grid"]) {
      await page
        .locator(`button:has(svg.lucide-${icon})`)
        .first()
        .click();
      await expect(
        page.locator(`svg[aria-label='sparkline']`).first(),
      ).toBeVisible({ timeout: 10000 });
      // Back to table for the next iteration.
      await page
        .locator("button:has(svg.lucide-table-2)")
        .first()
        .click();
      await expect(page.locator("table")).toBeVisible({ timeout: 10000 });
    }
  });

  test("/system/job/runs and /system/job/rules render standard list tables", async ({
    page,
  }) => {
    for (const route of ["/system/job/runs", "/system/job/rules"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator(SYSTEM_ERROR_PAGE)).toHaveCount(0);
      await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    }
  });

  test("/system/job/rules create CTA → NEW TAB archetype EntityFormPage (no remote mount)", async ({
    page,
    context,
  }) => {
    await page.goto("/system/job/rules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });

    // create.single is enabled for admins — the New CTA opens a CHILD TAB
    // (navStrategy popup, the platform convention) mounting the
    // host-rendered entity-form archetype (page_props.form, no component_url).
    const createBtn = page.getByTestId("entity-create-cta");
    await expect(createBtn).toBeVisible();
    const [popup] = await Promise.all([
      context.waitForEvent("page", { timeout: 15000 }),
      createBtn.click(),
    ]);
    await popup.waitForLoadState("domcontentloaded");
    await expect(popup).toHaveURL(/\/system\/job\/rules\/create$/);

    // Contract: the archetype renders — remote mount must NOT.
    await expect(popup.getByTestId("entity-form-page")).toBeVisible({ timeout: 30000 });
    await expect(popup.locator(REMOTE_CONTENT)).toHaveCount(0);
    // The 8 declared fields render in declaration order (meta.columns-driven).
    for (const key of [
      "name",
      "event_subject",
      "filter",
      "schedule_spec",
      "target_subject",
      "execution_context",
      "source_subject",
      "enabled",
    ]) {
      await expect(popup.getByTestId(`entity-form-field-${key}`)).toBeVisible();
    }
    await expect(popup.getByTestId("entity-form-submit")).toBeVisible();
    // Header anatomy: module breadcrumb + description line under the title.
    await expect(popup.locator("nav").first()).toBeVisible();
    await popup.close();
  });

  test("job_run version history endpoint works — audit tables exist", async ({
    page,
  }) => {
    await page.goto("/system/job/runs", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });

    // The regression was `relation "job.job_runs_audit" does not exist` —
    // the endpoint must answer 200 (empty page is fine, the table exists).
    const result = await page.evaluate(async () => {
      const list = await fetch(
        "/svc/job/api/v1/entities/job_run/list?page=1&page_size=1",
      )
        .then((r) => r.json())
        .catch(() => null);
      const row = list?.rows?.[0] ?? null;
      if (!row?.uuid) return { status: -1, body: "no job_run row" };
      const res = await fetch(
        `/svc/job/api/v1/entities/job_run/${row.uuid}/audit?page=1&limit=20`,
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
    for (const route of ["/system/job/job-schedules", "/system/job/rules", "/system/settings/profile"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator(SYSTEM_ERROR_PAGE)).toHaveCount(0);
    }
    expect(errors.filter((e) => e.includes("effect_orphan"))).toEqual([]);
  });

  test("sidebar: exactly ONE nav item active on /system/job/rules", async ({
    page,
  }) => {
    await page.goto("/system/job/rules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    // Wait for module nav to resolve (scoped to the sidebar — the
    // breadcrumb's module link shares the same href).
    await expect(
      page.locator(`${SIDEBAR_LINKS}[href='/system/job/rules']`).first(),
    ).toBeVisible({ timeout: 15000 });

    // Longest-match wins: /system/job/rules is active, /system/job is NOT (it is a
    // prefix of the current route, not the route itself).
    await expect(
      page.locator(`${SIDEBAR_LINKS}[href='/system/job/rules']`),
    ).toHaveAttribute("data-active", "true");
    await expect(
      page.locator(`${SIDEBAR_LINKS}[href='/system/job/job-schedules']`),
    ).not.toHaveAttribute("data-active", "true");

    // Invariant: never more than one active nav link in the sidebar.
    const activeCount = await page
      .locator(`${SIDEBAR_LINKS}[data-active='true']`)
      .count();
    expect(activeCount).toBe(1);
  });

  test("breadcrumb on /system/job/rules is System / {job module} — never Settings", async ({
    page,
  }) => {
    await page.goto("/system/job/rules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    // Wait for module nav to load (breadcrumb items come from it).
    await expect(
      page.locator("a[href='/system/job/rules']").first(),
    ).toBeVisible({ timeout: 15000 });

    // The breadcrumb menu trigger carries the OWNING module's display
    // name as aria-label — the resolved job.module.name label, never
    // "Settings" (the old copy-paste bug rendered app.system + the
    // settings tab menu here).
    const trigger = page.getByRole("button", { name: await expectedJobModuleLabel(page) });
    await expect(trigger).toBeVisible();

    // The breadcrumb shape is {root} / {module} / … — the root-level
    // segment is "System" (part_of), and the module menu is Job's own.
    // No foreign-module ("Settings") segment may appear.
    const breadcrumbNav = trigger.locator("xpath=ancestor::nav[1]");
    // Root segment: a menu trigger whose VISIBLE text is the translated
    // root label ("System") — its accessible name is the group aria-label
    // ("Level"), so match on text content.
    await expect(
      breadcrumbNav.locator("button").filter({ hasText: /system|sistema/i }).first(),
    ).toBeVisible();
    await expect(breadcrumbNav).not.toContainText(/settings|impostazioni/i);
  });

  test("is owned by the job module — not by Settings", async ({ page }) => {
    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });

    // The app launcher shows the OWNING module (`App / Module`), and its
    // nav contains the self-declared links.
    const switcher = page.locator("[data-testid='app-launcher-trigger']");
    await expect(switcher).toContainText(await expectedJobModuleLabel(page), { timeout: 15000 });
    await expect(page.locator("a[href='/system/job/job-schedules']").first()).toBeVisible();
    await expect(page.locator("a[href='/system/job/rules']").first()).toBeVisible();

    // Settings' nav does NOT present another module's pages.
    await page.goto("/system/settings/profile", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("[data-testid='app-launcher-trigger']")).toContainText(
      /settings/i,
      { timeout: 15000 },
    );
    await expect(page.locator("a[href='/system/job/job-schedules']")).toHaveCount(0);
  });

  test("is reachable through the app launcher (job module home)", async ({
    page,
  }) => {
    await page.goto("/system/settings/profile", {
      waitUntil: "domcontentloaded",
    });
    const trigger = page.locator("[data-testid='app-launcher-trigger']");
    await expect(trigger).toContainText(/settings/i, { timeout: 15000 });

    // App launcher → select System (module column descends) → click Job
    // Handler's goto CTA: nav[0].href (/system/job/job-schedules) is the
    // module home.
    await trigger.click();
    await page
      .locator("[data-testid='app-launcher-apps'] [role='option'][data-app-root='system']")
      .first()
      .click();
    await page
      .locator("[data-testid='app-launcher-modules'] [role='option'][data-module-id='job']")
      .first()
      .locator("[data-testid='launcher-cta']")
      .click();

    await page.waitForURL("**/system/job/job-schedules", { timeout: 10000 });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
  });

  test("/system/job/job-schedules/create mounts the remote schedule form", async ({ page }) => {
    await page.goto("/system/job/job-schedules/create", { waitUntil: "domcontentloaded" });

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

    await page.goto("/system/job/job-schedules/create", { waitUntil: "domcontentloaded" });

    // In-content error panel — classified 'network' (fetch threw).
    const errorPanel = page.locator(REMOTE_ERROR);
    await expect(errorPanel).toBeVisible({ timeout: 30000 });
    await expect(errorPanel).toHaveAttribute("data-error-kind", "network");

    // The app shell survives: sidebar nav is still rendered, and the
    // failure NEVER escalated to the system full-page error.
    await expect(page.locator(SYSTEM_ERROR_PAGE)).toHaveCount(0);
    await expect(page.locator("a[href='/system/job/job-schedules']").first()).toBeVisible({
      timeout: 15000,
    });

    // Retry recovers: unblock the asset and hit the panel's retry action —
    // the remote mounts without a page reload. The upstream service may be
    // mid-restart (bun --hot): a real user would hit retry again, so allow a
    // bounded number of attempts instead of racing a single shot.
    await page.unroute("**/api/v1/module-assets/**");
    const content = page.locator(REMOTE_CONTENT);
    await expect
      .poll(
        async () => {
          if (await errorPanel.isVisible().catch(() => false)) {
            await page.getByTestId("remote-page-retry").click();
          }
          return content.isVisible().catch(() => false);
        },
        { timeout: 30000, intervals: [1000, 2000, 3000] },
      )
      .toBe(true);
    await expect(errorPanel).toHaveCount(0);
  });
});
