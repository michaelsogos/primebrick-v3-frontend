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
 *   /system/job/triggers          job_trigger
 *
 * The module's only custom surface is the host-rendered entity-form
 * archetype (page_props.form, NO remote mount):
 *
 *   /system/job/triggers/create          trigger form
 *
 * Manual schedule arming was absorbed into triggers — `job_schedules` is
 * a pure armed-state registry (no create route, no create CTA). The
 * module's only remote surface is the `job.runDetail` SHEET (covered by
 * remote-sheet specs); remote-PAGE machinery is exercised here through
 * crm's live `/system/crm/pipeline` component_url route.
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
    // NO create CTA — job_schedule is a pure armed-state registry: manual
    // schedule arming was absorbed into triggers (a schedule-only trigger
    // IS the declaration), so the census declares no kind:"create" route
    // for the entity and the toolbar must not offer one.
    await expect(page.getByTestId("entity-create-cta")).toHaveCount(0);
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

  test("/system/job/runs and /system/job/triggers render standard list tables", async ({
    page,
  }) => {
    for (const route of ["/system/job/runs", "/system/job/triggers"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator(SYSTEM_ERROR_PAGE)).toHaveCount(0);
      await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    }
  });

  test("/system/job/triggers renders columns in meta order — destination after source, filters after schedule", async ({
    page,
  }) => {
    await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr[data-row-index]").first()).toBeVisible({ timeout: 30000 });

    // Wire contract — meta `order` values: event_subject(source) <
    // target_subject(destination) < schedule_spec < filter. The served
    // array stays in declaration order; orderedColumns sorts by `order`.
    const meta = await page.evaluate(async () => {
      const res = await fetch("/svc/job/api/v1/entities/job_trigger/meta");
      const body = await res.json();
      return (body.columns ?? []) as { key: string; order: number }[];
    });
    const ord = (k: string) => meta.find((c) => c.key === k)?.order ?? -1;
    expect(ord("event_subject")).toBeGreaterThan(-1);
    expect(ord("target_subject")).toBeGreaterThan(ord("event_subject"));
    expect(ord("target_subject")).toBeLessThan(ord("schedule_spec"));
    expect(ord("schedule_spec")).toBeLessThan(ord("filter"));

    // DOM contract — the visible thead mirrors meta order (filter is
    // default_visible:false, so only the first three can appear as th).
    const headers = await page.locator("table thead th").allTextContents();
    const hIdx = (re: RegExp) => headers.findIndex((h) => re.test(h));
    const srcIdx = hIdx(/listening|sorgente|source|ereignisquelle|origen|origem/i);
    const dstIdx = hIdx(/destination|destinazione|destino|ereignisziel/i);
    expect(srcIdx).toBeGreaterThan(-1);
    expect(dstIdx).toBe(srcIdx + 1);
  });

  test("/system/job/triggers default column visibility — next_run shown, is_system hidden-but-toggleable", async ({
    page,
  }) => {
    // Served contract — the meta declares the defaults the ELT derives
    // its fresh-profile visibleKeys from.
    await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    const flags = await page.evaluate(async () => {
      const res = await fetch("/svc/job/api/v1/entities/job_trigger/meta");
      const cols = ((await res.json()).columns ?? []) as {
        key: string;
        default_visible?: boolean;
        hideable?: boolean;
      }[];
      const find = (k: string) => cols.find((c) => c.key === k);
      return { is_system: find("is_system"), next_run: find("next_run") };
    });
    expect(flags.is_system?.default_visible).toBe(false);
    expect(flags.is_system?.hideable).not.toBe(false);
    expect(flags.next_run?.default_visible).toBe(true);
    expect(flags.next_run?.hideable).not.toBe(false);

    // Rendered contract — a fresh context has no stored visibleKeys, so
    // the meta defaults decide: a next_run header exists, is_system does
    // not (it lives in the picker only).
    const headers = await page.locator("table thead th").allTextContents();
    const has = (re: RegExp) => headers.some((h) => re.test(h));
    expect(
      has(/next run|prossima esecuzione|nächste ausführung|prochaine exécution|próxima ejecución|próxima execução/i),
    ).toBe(true);
    expect(has(/^\s*system|sistema\s*$/i)).toBe(false);

    // Picker contract — both stay user-toggleable (enabled), next_run
    // checked, is_system unchecked.
    await page.getByRole("button", { name: /columns|colonne|spalten|colonnes|columnas|colunas/i }).first().click();
    const nextRunToggle = page.getByTestId("columns-toggle-next_run");
    const isSystemToggle = page.getByTestId("columns-toggle-is_system");
    await expect(nextRunToggle).toBeVisible({ timeout: 15000 });
    await expect(isSystemToggle).toBeVisible();
    for (const toggle of [nextRunToggle, isSystemToggle]) {
      await expect(toggle).toBeEnabled();
    }
    await expect(nextRunToggle.locator('[data-state="checked"]')).toHaveCount(1);
    await expect(nextRunToggle.locator('[data-state="unchecked"]')).toHaveCount(0);
    await expect(isSystemToggle.locator('[data-state="checked"]')).toHaveCount(0);
    await expect(isSystemToggle.locator('[data-state="unchecked"]')).toHaveCount(1);
    await page.keyboard.press("Escape");
  });

  test("/system/job/triggers create CTA → NEW TAB archetype EntityFormPage (no remote mount)", async ({
    page,
    context,
  }) => {
    await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
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
    await expect(popup).toHaveURL(/\/system\/job\/triggers\/create$/);

    // Contract: the archetype renders — remote mount must NOT.
    await expect(popup.getByTestId("entity-form-page")).toBeVisible({ timeout: 30000 });
    await expect(popup.locator(REMOTE_CONTENT)).toHaveCount(0);
    // The 7 declared fields render in declaration order (TRIGGER_FORM
    // page_props.form — no `enabled`: soft-delete IS the disable).
    for (const key of [
      "name",
      "event_subject",
      "target_subject",
      "schedule_spec",
      "run_as",
      "filter",
      "payload_map",
    ]) {
      await expect(popup.getByTestId(`entity-form-field-${key}`)).toBeVisible();
    }
    await expect(popup.getByTestId("entity-form-submit")).toBeVisible();
    // Header anatomy: module breadcrumb + description line under the title.
    await expect(popup.locator("nav").first()).toBeVisible();
    await popup.close();
  });

  test("/system/job/runs meta contract — service_code dropped, trigger projected, subject anatomy", async ({
    page,
  }) => {
    await page.goto("/system/job/runs", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });

    // Served-meta contract — the physical drop + calculated projections.
    const meta = await page.evaluate(async () => {
      const res = await fetch("/svc/job/api/v1/entities/job_run/meta");
      return res.json();
    });
    const cols = (meta.columns ?? []) as {
      key: string;
      type?: string;
      format?: string;
      kind?: string;
      icon?: string;
      color?: string;
      default_visible?: boolean;
      filterable?: boolean;
      ref?: { entity?: string; key_field?: string; filter_field?: string };
      badge?: { values?: Record<string, { color?: string; label_key?: string }> };
      null_label?: unknown;
    }[];
    const keys = cols.map((c) => c.key);
    expect(keys).not.toContain("service_code"); // physical DROP — gone everywhere
    expect(keys).not.toContain("trigger_uuid"); // hidden:true → row payload only
    expect(keys).not.toContain("error_detail"); // hidden:true → sheet surface only
    const byKey = (k: string) => cols.find((c) => c.key === k);

    // Friendly lineage: calculated ref drilling job_trigger by the stamped uuid.
    expect(byKey("trigger")).toMatchObject({
      type: "ref",
      kind: "calculated",
      default_visible: true,
      ref: { entity: "job_trigger", key_field: "trigger_uuid" },
    });
    // Owning schedule — calculated ref, business-key drill on the subject.
    expect(byKey("schedule")).toMatchObject({
      type: "ref",
      kind: "calculated",
      default_visible: true,
      ref: {
        entity: "job_schedule",
        key_field: "schedule_subject",
        filter_field: "schedule_subject",
      },
    });
    // Ordinary NULLs render "-" — no destructive null_label anywhere.
    expect(byKey("trigger")?.null_label).toBeUndefined();
    expect(byKey("schedule_subject")?.null_label).toBeUndefined();
    // SOURCE + DESTINATION — the same nats_subject anatomy pair schedules carry.
    expect(byKey("schedule_subject")).toMatchObject({
      type: "text",
      format: "nats_subject",
      icon: "zap",
      default_visible: true,
    });
    expect(byKey("target_subject")).toMatchObject({
      type: "text",
      format: "nats_subject",
      icon: "send",
      color: "sky-500",
      default_visible: true,
    });
    expect(byKey("run_as")?.default_visible).toBe(true);
    for (const k of ["fire_seq", "report"] as const) {
      expect(byKey(k)).toMatchObject({ default_visible: false, filterable: false });
    }
    // Status badge recolor (A.2): dispatched info, skipped gray, lost amber.
    const statusValues = byKey("status")?.badge?.values ?? {};
    expect(statusValues.dispatched?.color).toBe("info");
    expect(statusValues.skipped?.color).toBe("gray");
    expect(statusValues.lost?.color).toBe("amber");
    expect(statusValues.succeeded?.color).toBe("green");
    expect(statusValues.failed?.color).toBe("red");
    // error_code — closed badge enum, every item mapped to a translated label.
    const errorValues = byKey("error_code")?.badge?.values ?? {};
    expect(Object.keys(errorValues).sort()).toEqual(
      [
        "EXECUTION_ERROR",
        "HANDLER_ERROR",
        "VALIDATION_ERROR",
        "DENIED",
        "DISPATCH_ERROR",
        "DISPATCH_TIMEOUT",
        "AUTH_ACTOR_UNRESOLVABLE",
        "SCHEDULE_PAUSED",
        "SCHEDULE_DISARMED",
      ].sort(),
    );
    for (const v of Object.values(errorValues)) {
      expect(v.label_key).toMatch(/^job\.entities\.job_run\.status\./);
      expect(v.color).toBeTruthy();
    }

    expect(meta.table?.default_sort).toEqual({ key: "created_at", dir: "desc" });
    const preset = (meta.table?.filter_presets ?? []).find(
      (p: { id: string }) => p.id === "outcome",
    );
    expect(preset).toMatchObject({ display: "button_group", default_option: "all" });

    // Rendered contract — trigger + schedule refs and BOTH subject columns
    // (source + destination) visible by default.
    const headers = await page.locator("table thead th").allTextContents();
    const has = (re: RegExp) => headers.some((h) => re.test(h));
    expect(has(/trigger|attivatore|auslöser|déclencheur|disparador|acionador/i)).toBe(true);
    expect(has(/queue|coda|warteschlange|file|cola|fila/i)).toBe(true);
    expect(has(/destination|destinazione|ziel|destino/i)).toBe(true);
  });

  test("/system/job/runs outcome preset ANDs status= into the wire request", async ({
    page,
  }) => {
    const listUrls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/entities/job_run/list"))
        listUrls.push(decodeURIComponent(req.url()));
    });

    await page.goto("/system/job/runs", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });

    // Icon-only group per the toolbar contract — options carry tooltips.
    const preset = page
      .locator("[data-slot='button-group']")
      .filter({ has: page.locator("button svg.lucide-ghost") })
      .first();
    await expect(preset).toBeVisible({ timeout: 15000 });
    const failedBtn = preset.locator("button[aria-pressed]", {
      has: page.locator("svg.lucide-x"),
    }).first();
    const allBtn = preset.locator("button[aria-pressed]", {
      has: page.locator("svg.lucide-list-clock"),
    }).first();

    const mark = listUrls.length;
    await expect(async () => {
      await failedBtn.click();
      await expect(failedBtn).toHaveAttribute("aria-pressed", "true", { timeout: 2000 });
    }).toPass({ timeout: 15000 });
    await expect(async () => {
      expect(
        listUrls
          .slice(mark)
          .some((u) => u.includes("filters[0][field]=status") && u.includes("filters[0][value]=failed")),
      ).toBe(true);
    }).toPass({ timeout: 10000 });

    // `all` applies no status scope — like schedule_kind's escape option.
    const allMark = listUrls.length;
    await expect(async () => {
      await allBtn.click();
      await expect(allBtn).toHaveAttribute("aria-pressed", "true", { timeout: 2000 });
    }).toPass({ timeout: 15000 });
    await expect(async () => {
      expect(listUrls.slice(allMark).some((u) => !u.includes("field]=status"))).toBe(true);
    }).toPass({ timeout: 10000 });
  });

  test("/system/job/runs error_code badge opens the run-detail remote sheet", async ({
    page,
  }) => {
    // Fixture: at least one failed run with an error_code on this dev DB.
    const failed = await page
      .request
      .get("/svc/job/api/v1/entities/job_run/list?filters[0][field]=status&filters[0][op]=%3D&filters[0][value]=failed&page_size=5")
      .then((r) => r.json())
      .then((b) => (b.rows ?? []) as { error_code?: string | null }[]);
    test.skip(
      !failed.some((r) => r.error_code),
      "no failed run with error_code on this dataset",
    );

    await page.goto("/system/job/runs", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });

    // Scope to failed runs via the outcome preset — every row then carries
    // an error_code badge (the cell wraps it in a button → runDetail).
    const preset = page
      .locator("[data-slot='button-group']")
      .filter({ has: page.locator("button svg.lucide-ghost") })
      .first();
    const failedBtn = preset.locator("button[aria-pressed]", {
      has: page.locator("svg.lucide-x"),
    }).first();
    await expect(async () => {
      await failedBtn.click();
      await expect(failedBtn).toHaveAttribute("aria-pressed", "true", { timeout: 2000 });
    }).toPass({ timeout: 15000 });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 15000 });

    // Locate the error_code column by header, then click its cell button.
    const headers = await page.locator("table thead th").allTextContents();
    const errIdx = headers.findIndex((h) => /error|errore|erreur|fehler|erro/i.test(h));
    expect(errIdx, "error_code column header present").toBeGreaterThanOrEqual(0);
    const cell = page.locator("table tbody tr").first().locator("td").nth(errIdx);
    await cell.locator("button").first().click();

    // The module's remote sheet mounts with the run's own content.
    await expect(page.getByTestId("remote-sheet-mount")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("remote-sheet-content")).toBeVisible({ timeout: 15000 });
  });

  test("/system/job/runs visibleKeys v2 — legacy array migrates, intent persists", async ({
    page,
  }) => {
    const VK = "pb:jobs:runs:visibleKeys";
    // Seed a legacy v1 resolved array — a narrow column set from an older
    // meta. Render must match it verbatim (no new columns leaked in).
    await page.addInitScript(([key]) => {
      sessionStorage.setItem(key, JSON.stringify(["uuid", "job_name", "status"]));
    }, [VK]);
    await page.goto("/system/job/runs", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30000 });

    const headers = await page.locator("table thead th").allTextContents();
    const has = (re: RegExp) => headers.some((h) => re.test(h));
    // The stored set renders verbatim — status visible, run_as/trigger NOT.
    expect(has(/status|stato|état|estado/i)).toBe(true);
    expect(has(/trigger|attivatore|auslöser|déclencheur|disparador|acionador/i)).toBe(false);

    // First persist rewrites the payload into the v2 intent shape —
    // never a bare array again.
    await expect(async () => {
      const raw = await page.evaluate((k) => sessionStorage.getItem(k), VK);
      const parsed = JSON.parse(raw ?? "null") as { v?: number; shown?: unknown; hidden?: unknown } | null;
      expect(parsed?.v).toBe(2);
      expect(Array.isArray(parsed?.shown)).toBe(true);
      expect(Array.isArray(parsed?.hidden)).toBe(true);
      // The hidden list captures the served columns absent from the set.
      expect((parsed?.hidden as string[]).length).toBeGreaterThan(0);
    }).toPass({ timeout: 10000 });
  });

  test("job_run has NO audit endpoint — the run row IS the audit trail", async ({
    page,
  }) => {
    await page.goto("/system/job/runs", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });

    // Contract: entities-route.ts declares job_run `auditable: false` —
    // run rows are written by services and are themselves the audit
    // trail, so `GET /:uuid/audit` is intentionally not registered.
    // The historical regression (`relation "job.job_runs_audit" does not
    // exist` → 500) can no longer surface here; assert a clean 404.
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
    expect(result.status).toBe(404);
    expect(result.body).not.toContain("does not exist");
  });

  test("job_trigger audit endpoint returns uuid-keyed entries — the version-history contract", async ({
    page,
  }) => {
    await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });

    // Contract: entities-route.ts declares job_trigger `auditable: true` —
    // the version-history panel fetches GET /:uuid/audit and keys entries
    // by audit-row `uuid` (never the retired numeric `id`). Regression
    // locked here: a wedged service made this fetch hang "stale pending";
    // a completing 200 with uuid-keyed rows is the positive contract.
    // Audit rows exist only on triggers that were written after insert —
    // scan the list for the first trigger carrying history.
    const result = await page.evaluate(async () => {
      const list = await fetch(
        "/svc/job/api/v1/entities/job_trigger/list?page=1&page_size=25",
      )
        .then((r) => r.json())
        .catch(() => null);
      const rows = (list?.rows ?? []) as { uuid?: string }[];
      for (const row of rows) {
        if (!row?.uuid) continue;
        const res = await fetch(
          `/svc/job/api/v1/entities/job_trigger/${row.uuid}/audit?page=1&limit=20`,
        );
        if (res.status !== 200) return { status: res.status, body: await res.text() };
        const body = await res.text();
        if ((JSON.parse(body).data ?? []).length > 0)
          return { status: res.status, body };
      }
      return { status: -1, body: "no job_trigger row with audit history" };
    });
    expect(result.status).toBe(200);
    const payload = JSON.parse(result.body) as {
      data: { uuid: string; action: string; changed_at: string }[];
      pagination: { hasMore: boolean };
    };
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data.length).toBeGreaterThan(0);
    for (const entry of payload.data) {
      expect(entry.uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(typeof entry.action).toBe("string");
      expect(entry.changed_at).toBeTruthy();
    }
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
    for (const route of ["/system/job/job-schedules", "/system/job/triggers", "/system/settings/profile"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator(SYSTEM_ERROR_PAGE)).toHaveCount(0);
    }
    expect(errors.filter((e) => e.includes("effect_orphan"))).toEqual([]);
  });

  test("sidebar: exactly ONE nav item active on /system/job/triggers", async ({
    page,
  }) => {
    await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    // Wait for module nav to resolve (scoped to the sidebar — the
    // breadcrumb's module link shares the same href).
    await expect(
      page.locator(`${SIDEBAR_LINKS}[href='/system/job/triggers']`).first(),
    ).toBeVisible({ timeout: 15000 });

    // Longest-match wins: /system/job/triggers is active, /system/job is NOT (it is a
    // prefix of the current route, not the route itself).
    await expect(
      page.locator(`${SIDEBAR_LINKS}[href='/system/job/triggers']`),
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

  test("breadcrumb on /system/job/triggers is System / {job module} — never Settings", async ({
    page,
  }) => {
    await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    // Wait for module nav to load (breadcrumb items come from it).
    await expect(
      page.locator("a[href='/system/job/triggers']").first(),
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
    await expect(page.locator("a[href='/system/job/triggers']").first()).toBeVisible();

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
    // Handler's goto CTA: nav[0].href (/system/job/triggers) is the
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

    await page.waitForURL("**/system/job/triggers", { timeout: 10000 });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
  });

  test("remote asset failure degrades to an in-content error panel — shell stays", async ({
    page,
  }) => {
    // Simulate the crm service's module-assets endpoint being unreachable:
    // the chunk fetch aborts before import() is even attempted. (The job
    // module owns no remote PAGE — /system/crm/pipeline is a live
    // component_url route exercising the same remote-mount machinery.)
    await page.route("**/api/v1/module-assets/**", (route) =>
      route.abort("connectionrefused"),
    );

    await page.goto("/system/crm/pipeline", { waitUntil: "domcontentloaded" });

    // In-content error panel — classified 'network' (fetch threw).
    const errorPanel = page.locator(REMOTE_ERROR);
    await expect(errorPanel).toBeVisible({ timeout: 30000 });
    await expect(errorPanel).toHaveAttribute("data-error-kind", "network");

    // The app shell survives: sidebar nav is still rendered, and the
    // failure NEVER escalated to the system full-page error.
    await expect(page.locator(SYSTEM_ERROR_PAGE)).toHaveCount(0);
    await expect(page.locator("a[href='/system/crm/pipeline']").first()).toBeVisible({
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

  test("armed_by lazy ref: trigger-owned row → job_trigger entity.record", async ({
    page,
  }) => {
    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });

    // Every schedule is trigger-owned (trigger_uuid NOT NULL) — armed_by
    // is a static ref to `job_trigger` keyed by the row's own
    // `trigger_uuid` and drills to the canonical entity.record sheet.
    const triggerRow = page.locator("tr", { hasText: "e2e-callable-dispatch" }).first();
    const triggerCell = triggerRow.getByTestId("ref-cell-armed_by-text");
    await expect(triggerCell).toBeVisible({ timeout: 15000 });
    await triggerCell.click();
    const recordSheet = page.getByTestId("entity-record-sheet");
    await expect(recordSheet).toBeVisible({ timeout: 15000 });
    // The trigger record loaded through the ref key — the row's own
    // `trigger_uuid` IS the sheet's record uid.
    await expect(recordSheet).toContainText("01a1cbe9-3464-77b8-a85b-9b236aa66f4e", {
      timeout: 15000,
    });
    // Collapse contract: the shared trigger form pins payload_map at
    // col:2/row:1 — below the sheet's @xl breakpoint the row pin must be
    // neutralized so fields flow in declaration order. Assert VISUAL
    // order (bounding-box top): DOM order alone never caught the bug.
    const tops = await recordSheet.evaluate((sheet) =>
      Array.from(sheet.querySelectorAll('[id^="record-sheet-field-"]')).map((el) => ({
        key: el.id.replace("record-sheet-field-", ""),
        top: el.getBoundingClientRect().top,
      })),
    );
    const visualOrder = tops
      .slice()
      .sort((a, b) => a.top - b.top)
      .map((f) => f.key);
    expect(visualOrder).toEqual(tops.map((f) => f.key));
    expect(visualOrder.indexOf("name")).toBeLessThan(visualOrder.indexOf("payload_map"));
    await expect(page.getByTestId("service-record-panel")).toHaveCount(0);
  });

  test("created_by audit actor lazy ref: system:* → service name + service.record", async ({
    page,
  }) => {
    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });

    // `created_by` is an audited column — hidden by default, togglable.
    // The DAL resolves `system:<code>` writers through service_registry:
    // the cell carries the service NAME and a lazy ref (ref_entity=
    // service_registry, ref_key=code) — the same canonical cell anatomy
    // every audited entity now gets for free.
    await page.getByRole("button", { name: "Columns" }).first().click();
    const toggle = page.getByTestId("columns-toggle-created_by");
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await toggle.click();
    await page.keyboard.press("Escape");

    const cell = page.getByTestId("ref-cell-created_by-text").first();
    await expect(cell).toBeVisible({ timeout: 15000 });
    await expect(cell).toContainText(/Process Manager|AI Assistants Manager/);
    await cell.click();

    // Service actor → the service.record panel (registry RPC record) —
    // never an entity sheet.
    const panel = page.getByTestId("service-record-panel");
    await expect(panel).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("service-record-info")).toBeVisible();
    await expect(page.getByTestId("entity-record-sheet")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0, { timeout: 10000 });
  });

  test("created_by service actor renders in the active UI language", async ({ page }) => {
    // `system:<code>` actors resolve through service_registry — the cell
    // must show the census label_key translated in the ACTIVE language,
    // not the English registry wire name. Pin it-IT like every i18n spec.
    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    const langNow = await page.evaluate(() => sessionStorage.getItem("pb.lang"));
    if (langNow !== "it-IT") {
      await page.evaluate(() => sessionStorage.setItem("pb.lang", "it-IT"));
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    }

    await page.getByRole("button", { name: /Columns|Colonne/ }).first().click();
    const toggle = page.getByTestId("columns-toggle-created_by");
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await toggle.click();
    await page.keyboard.press("Escape");

    const cell = page.getByTestId("ref-cell-created_by-text").first();
    await expect(cell).toBeVisible({ timeout: 15000 });
    // `system:job`/`system:ai` writers — localized module display name,
    // never the English registry `name` nor the raw `system:<code>` token.
    await expect(cell).toContainText(/Gestore dei Processi|Gestore degli Assistenti AI/);
    await expect(cell).not.toContainText(/Process Manager|AI Assistants Manager|system:/);
  });

  test("system:api actor — the BE's own registry row resolves to API Gateway", async ({ page }) => {
    // The BE writes `system:api` (e.g. api-partition-maintenance). Its
    // self-enrolled service_registry row (code='api', label_key
    // system.api.title) must resolve name + drill like any service.
    await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    const langNow = await page.evaluate(() => sessionStorage.getItem("pb.lang"));
    if (langNow !== "it-IT") {
      await page.evaluate(() => sessionStorage.setItem("pb.lang", "it-IT"));
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    }

    await page.getByRole("button", { name: /Columns|Colonne/ }).first().click();
    const toggle = page.getByTestId("columns-toggle-created_by");
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await toggle.click();
    await page.keyboard.press("Escape");

    // The api-owned system trigger — its created_by is `system:api`.
    const row = page.locator("tr", { hasText: "api-partition-maintenance" }).first();
    await expect(row).toBeVisible({ timeout: 15000 });
    const cell = row.getByTestId("ref-cell-created_by-text");
    await expect(cell).toBeVisible({ timeout: 15000 });
    await expect(cell).toContainText("API Gateway");
    await expect(cell).not.toContainText("system:api");

    // Drill opens the service.record panel for code='api' — resolvable.
    await cell.click();
    const panel = page.getByTestId("service-record-panel");
    await expect(panel).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("service-record-info")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0, { timeout: 10000 });
  });

  test("search on trigger ELT never serializes non-searchable jsonb columns", async ({ page }) => {
    // Regression: `filter`/`payload_map` (jsonb, type:"text" in meta) used
    // to reach `search_in` — the wire allowlist (physical textlike only)
    // rejected them with a 400 VALIDATION error on every keystroke.
    // `withColumnConstraints` now resolves the served `searchable` flag
    // against the physical pg type, so the FE scope can never outrun the
    // backend vocabulary again.
    const badResponses: string[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/entities/job_trigger/list") && r.status() >= 400)
        badResponses.push(`${r.status()} ${r.url()}`);
    });
    await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });

    const searchInput = page.getByTestId("entity-search").locator("input");
    await expect(searchInput).toBeVisible({ timeout: 15000 });
    await searchInput.fill("api");
    // Debounced fetch — wait for the request to have happened, not a timer.
    await page.waitForResponse(
      (r) => r.url().includes("/entities/job_trigger/list") && r.url().includes("search=api"),
      { timeout: 15000 },
    );
    await expect(page.locator("table")).toBeVisible({ timeout: 15000 });
    expect(badResponses, `400/5xx on list: ${badResponses.join(" | ")}`).toHaveLength(0);
  });

  test("trigger ELT column order — Statistiche precedes Ultima esecuzione", async ({ page }) => {
    // `run_stats` (order 80) must sit before `last_run` (82) in the served
    // column order — the sparkline summary precedes the timestamps.
    await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    const langNow = await page.evaluate(() => sessionStorage.getItem("pb.lang"));
    if (langNow !== "it-IT") {
      await page.evaluate(() => sessionStorage.setItem("pb.lang", "it-IT"));
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    }

    const headerKeys = await page.locator("thead th").evaluateAll((ths) =>
      ths.map((th) => th.textContent?.trim() ?? ""),
    );
    const statsIdx = headerKeys.findIndex((h) => /Statistiche|Statistics/i.test(h));
    const lastIdx = headerKeys.findIndex((h) => /Ultima esecuzione|Last (run|execution)/i.test(h));
    expect(statsIdx, `headers: ${headerKeys.join(" | ")}`).toBeGreaterThanOrEqual(0);
    expect(lastIdx, `headers: ${headerKeys.join(" | ")}`).toBeGreaterThanOrEqual(0);
    expect(statsIdx).toBeLessThan(lastIdx);

    // `system_key` is an internal reconcile anchor — `hidden: true`
    // suppresses it from the served meta entirely: no table column AND
    // no column-picker toggle.
    await page.getByTestId("elt-column-selector").click();
    await expect(page.getByTestId("columns-toggle-system_key")).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("job_name/armed_by share the owning trigger's identity — even past its deletion", async ({
    page,
  }) => {
    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });

    // `service_code` is physically retired — the subject carries the
    // namespace (`jobs.schedule.<owner>.*`). No header, no picker entry.
    await expect(page.locator("th", { hasText: /^service$/i })).toHaveCount(0);
    await page.getByRole("button", { name: "Columns" }).first().click();
    await expect(page.getByTestId("columns-toggle-service_code")).toHaveCount(0);
    await expect(page.getByTestId("columns-toggle-trigger_uuid")).toBeVisible({ timeout: 15000 });
    await page.keyboard.press("Escape");

    // `target_subject` (Destination Event) is default-visible — the event
    // the schedule fires is a first-class fact of what it does.
    await expect(page.getByRole("columnheader", { name: "Destination Event" })).toBeVisible();

    // Orphaned mirror (soft-deleted e2e-gate trigger): Armed By keeps the
    // deleted trigger's name — the armer IS that trigger, its deletion
    // does not rewrite provenance. Job Name and Armed By converge on the
    // same identity (plain text vs drillable ref).
    const orphanRow = page.locator("tr", { hasText: "e2e-gate-1793665359607" }).first();
    await expect(orphanRow).toBeVisible({ timeout: 15000 });
    const orphanArmed = orphanRow.getByTestId("ref-cell-armed_by-text");
    await expect(orphanArmed).toContainText("e2e-gate-1793665359607");
    await orphanArmed.click();
    await expect(page.getByTestId("entity-record-sheet")).toBeVisible({ timeout: 15000 });
    await page.keyboard.press("Escape");

    // Live trigger row: Job Name and Armed By intentionally share the
    // trigger's display — identity (plain text) vs drillable ref.
    const liveRow = page.locator("tr", { hasText: "e2e-callable-dispatch" }).first();
    await expect(liveRow).toBeVisible({ timeout: 15000 });
  });
});
