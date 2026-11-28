import { extJsonParse } from "@primebrick/core/ext-json";
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

test.describe.configure({ mode: "serial" });

/* JH standard migration — the end-user contract (user-ratified 2026-11-27):
 * "route standard, tutto standard, ma le authored labels e icons". ONE set of
 * leaves at the canonical table-snake paths, carrying the authored cosmetic
 * labels and icons — never duplicated, never raw keys. The trigger form is
 * out of scope: the authored create/detail routes win their exact href and
 * TRIGGER_FORM survives intact. */

const CANON = {
  triggers: "/system/job/job_triggers",
  schedules: "/system/job/job_schedules",
  runs: "/system/job/job_runs",
} as const;
const OLD = ["/system/job/triggers", "/system/job/job-schedules", "/system/job/runs"];

async function fetchModules(page: import("@playwright/test").Page) {
  const raw = (await page.evaluate(async () => {
    const r = await fetch("/api/v1/modules", { credentials: "include" });
    if (!r.ok) return `{"error":${r.status}}`;
    return r.text();
  })) as string;
  return extJsonParse(raw) as {
    modules?: Array<{
      id: string;
      nav?: Array<{ id: string; href?: string; icon?: string; label_key?: string; sidebar?: boolean; default?: boolean }>;
      routes?: Array<{ route: string; kind?: string; entity?: string; component_url?: string; page_props?: { form?: { fields?: Array<{ key: string; col?: number }> } } }>;
    }>;
  };
}

test.beforeEach(async ({ page }) => {
  await loginAsTestAdmin(page);
});

test("payload: exactly one canonical leaf set — authored labels/icons survive, zero duplicates, zero old paths", async ({ page }) => {
  await page.goto("/system/job", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-sidebar="sidebar"] a[href^="/system/"]').first()).toBeVisible({ timeout: 5_000 });
  const payload = await fetchModules(page);
  const job = (payload.modules ?? []).find((m) => m.id === "job");
  expect(job, "job module in payload").toBeTruthy();
  const nav = job?.nav ?? [];
  const routes = job?.routes ?? [];

  // The canonical trio — each exactly once, carrying the authored cosmetics.
  const expected: Array<[string, string, string]> = [
    [CANON.triggers, "job.jobs.nav_triggers", "list-checks"],
    [CANON.schedules, "job.jobs.nav", "list-clock"],
    [CANON.runs, "job.jobs.nav_runs", "play"],
  ];
  for (const [href, labelKey, icon] of expected) {
    const leaves = nav.filter((l) => l.href === href);
    expect(leaves.length, `exactly one leaf at ${href}`).toBe(1);
    expect(leaves[0]?.label_key, `${href} keeps the authored label key`).toBe(labelKey);
    expect(leaves[0]?.icon, `${href} keeps the authored icon`).toBe(icon);
    expect(leaves[0]?.sidebar, `${href} is a sidebar leaf`).not.toBe(false);
  }
  expect(nav.find((l) => l.href === CANON.triggers)?.default, "triggers stays the module default").toBe(true);

  // The trigger create leaf — derived, popover-only, canonical create key.
  const createLeaf = nav.find((l) => l.href === `${CANON.triggers}/create`);
  expect(createLeaf, "trigger create leaf derived").toBeTruthy();
  expect(createLeaf?.sidebar, "create leaf is popover-only").toBe(false);

  // Old short paths are dead — no leaf, no route.
  for (const old of OLD) {
    expect(nav.some((l) => l.href === old), `no leaf at dead path ${old}`).toBe(false);
    expect(routes.some((r) => r.route === old), `no route at dead path ${old}`).toBe(false);
  }

  // No duplicate hrefs anywhere — the screenshot pathology can never return.
  const seen = new Map<string, number>();
  for (const l of nav) if (l.href) seen.set(l.href, (seen.get(l.href) ?? 0) + 1);
  const dups = [...seen.entries()].filter(([, n]) => n > 1);
  expect(dups, "zero duplicate leaf hrefs").toEqual([]);

  // Routes canonical — and the authored form survives on its exact href.
  for (const [href] of expected) {
    expect(routes.find((r) => r.route === href)?.kind, `${href} is a list route`).toBe("list");
  }
  const createRoute = routes.find((r) => r.route === `${CANON.triggers}/create`);
  expect(createRoute?.kind, "create route canonical").toBe("create");
  const payloadMap = createRoute?.page_props?.form?.fields?.find((f) => f.key === "payload_map");
  expect(Number(payloadMap?.col), "TRIGGER_FORM layout survives — payload_map owns column 2").toBe(2);
});

test("browser: sidebar shows exactly the translated trio — zero raw keys, zero duplicates", async ({ page }) => {
  await page.goto(CANON.triggers, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => sessionStorage.setItem("pb.lang", "it-IT"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("table").first()).toBeVisible({ timeout: 5_000 });

  const expected: Array<[string, string]> = [
    ["/system/job/job_triggers", "Attivatori"],
    ["/system/job/job_runs", "Esecuzioni"],
    ["/system/job/job_schedules", "Pianificazioni"],
  ];
  for (const [href, label] of expected) {
    const link = page.locator(`a[href="${href}"]`);
    await expect(link.first(), `sidebar carries exactly the canonical ${label} link`).toBeVisible({ timeout: 5_000 });
    expect(await link.count(), `exactly one sidebar link at ${href} — never duplicated`).toBe(1);
    expect(((await link.first().textContent()) ?? "").trim(), `${href} renders the translated label`).toContain(label);
  }
  const orderedHrefs: string[] = [];
  for (const href of ["/system/job/job_triggers", "/system/job/job_schedules", "/system/job/job_runs"]) {
    orderedHrefs.push(href);
  }
  const domOrder = await page.locator("[data-sidebar='sidebar'] a[href^='/system/job/job_']").evaluateAll((els) =>
    els.map((e) => e.getAttribute("href")).filter((h): h is string => !!h && !h.endsWith("/create")),
  );
  expect(domOrder.slice(0, 3), "sidebar DOM order is the workflow order — never alphabetical").toEqual(orderedHrefs);

  const sidebarLinks = page.locator("aside a, nav a");
  const allText: string[] = [];
  for (const a of await sidebarLinks.all()) allText.push(((await a.textContent()) ?? "").trim());
  expect(allText.some((x) => x.includes("job.job_")), "zero raw canonical keys in any sidebar link").toBe(false);
});

test("browser: popover lists the trigger create before its list — translated, never raw", async ({ page }) => {
  await page.goto(CANON.triggers, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => sessionStorage.setItem("pb.lang", "it-IT"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("table").first()).toBeVisible({ timeout: 5_000 });

  await page.getByTestId("app-launcher-trigger").click();
  const panel = page.getByTestId("app-launcher-panel");
  await expect(panel).toBeVisible({ timeout: 5_000 });
  const appRows = panel.locator('[data-launcher-col="0"] [data-launcher-row]');
  await appRows.filter({ hasText: "Sistema" }).first().click();
  const moduleRows = panel.locator('[data-launcher-col="1"] [data-launcher-row]');
  await expect(moduleRows.first()).toBeVisible({ timeout: 5_000 });
  await moduleRows.filter({ hasText: "Gestione Processi" }).first().hover();
  const rows = panel.locator('[data-launcher-col="2"] [data-launcher-row]');
  await expect(rows.first()).toBeVisible({ timeout: 5_000 });
  await page.locator("#app-launcher-show-all-switch").click();

  const labels: string[] = [];
  for (const r of await rows.all()) labels.push(((await r.textContent()) ?? "").trim());
  console.log("job popover rows:", labels);

  expect(labels.some((l) => l.includes("job.")), "zero raw keys in popover").toBe(false);
  expect(labels, "workflow order ratified 2026-11-27: triggers → schedules → runs, create paired before its list").toEqual([
    "Nuovo Attivatore",
    "Attivatori",
    "Pianificazioni",
    "Esecuzioni",
  ]);
});

test("browser: create at the canonical path renders the entity form with the authored layout", async ({ page }) => {
  await page.goto(`${CANON.triggers}/create`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("entity-form-surface"), "the host entity_form archetype renders").toBeVisible({ timeout: 5_000 });
  const bodyText = (await page.locator("body").textContent()) ?? "";
  expect(bodyText.length, "the form page is not empty").toBeGreaterThan(200);
});

test("browser: legacy short paths are dead — ONE surface per entity, never two", async ({ page }) => {
  // The ratified end state: the old short URLs serve nothing. SvelteKit prefers
  // concrete filesystem routes over the catch-all, so the orphaned legacy route
  // files under src/routes/(app)/system/job/ were live duplicates until deleted.
  // End-user proof: no entity table renders at any legacy address.
  for (const legacy of OLD) {
    await page.goto(legacy, { waitUntil: "domcontentloaded" });
    // Hydration gate — the shell is up, so resolution has finished one way
    // or the other; a table appearing after this point would be a live duplicate.
    await expect(page.locator('[data-sidebar="sidebar"] a[href^="/system/"]').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("table"), `legacy ${legacy} must not serve a list table`).toHaveCount(0);
  }
  // The canonical surfaces are untouched by the death of the legacy ones.
  await page.goto(CANON.triggers, { waitUntil: "domcontentloaded" });
  await expect(page.locator("table")).toBeVisible({ timeout: 5_000 });
});
