import { test, expect, type Page, type Response } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/**
 * Module-ownership hardening suite — the observable contract of the
 * module/nav architecture, verified bidirectionally.
 *
 * What this guards (the bugs that motivated it):
 *
 *  1. SWITCHER ↔ MODULE CONSISTENCY — selecting a module in the switcher
 *     must land on a route that resolves back to THAT module
 *     (longest-prefix ownership). The original bug: selecting Job showed
 *     "Job Handler" while the route belonged to settings.
 *  2. NAV == DECLARED NAV — the sidebar must render exactly the links the
 *     module declares in service_registry.endpoints.nav (or MODULE_NAV for
 *     the reserved shell): nothing missing, nothing borrowed.
 *  3. I18N COVERAGE — no raw dictionary keys (e.g. `job.jobs.nav`) may leak
 *     into rendered text; every enabled module must serve a non-empty dict.
 *  4. ICONS — every declared module/nav icon must resolve to a real
 *     component (missing names surface as the visible '?' marker and a
 *     console warning — neither may appear).
 *  5. NETWORK + CONSOLE HYGIENE — no unexpected 4xx/5xx and no console
 *     errors while navigating module-owned routes.
 *
 * Environment-driven: the set of modules under test is whatever the live
 * /api/v1/modules endpoint returns — a service that is not running simply
 * does not appear, and its absence is itself verified.
 *
 * Requires the live stack: FE :5173, BE :3001, plus whichever services
 * are running (job :3006, crm :3007, …).
 */

type ModuleInfo = {
  id: string;
  name: string;
  enabled: boolean;
  icon?: string;
  route_prefixes?: string[];
  is_reserved?: boolean;
};

type NavLink = { id: string; label_key: string; href: string; icon?: string; children?: NavLink[] };

const RAW_KEY = /\b(?:app|system|custom|job|crm|emailsender|webhook|ai)\.[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+\b/i;

const pathOf = (page: Page) => new URL(page.url()).pathname;
const SWITCHER_TRIGGER = "[data-testid='module-switcher-trigger']";
const MENU_ITEM = "[data-slot='dropdown-menu-item']";

/** Modules that own FE pages — headless services (no nav decl) are excluded. */
const pageModules = (modules: ModuleInfo[]) =>
  modules.filter((m) => (m.route_prefixes?.length ?? 0) > 0);

/** Longest-prefix ownership — the same rule the shell applies. */
function expectedOwner(modules: ModuleInfo[], pathname: string): string | null {
  let best: { id: string; len: number } | null = null;
  for (const m of modules) {
    for (const p of m.route_prefixes ?? []) {
      const match = p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p + "/");
      if (match && (best === null || p.length > best.len)) best = { id: m.id, len: p.length };
    }
  }
  return best?.id ?? null;
}

async function fetchModules(page: Page): Promise<ModuleInfo[]> {
  const res = await page.request.get("/api/v1/modules");
  expect(res.ok(), "GET /api/v1/modules must succeed").toBeTruthy();
  const body = await res.json();
  const mods: ModuleInfo[] = body.modules ?? body;
  return mods.filter((m) => m.enabled !== false);
}

async function fetchModuleNav(page: Page, code: string): Promise<NavLink[]> {
  const res = await page.request.get(`/api/v1/modules/${code}/meta`);
  expect(res.ok(), `GET /api/v1/modules/${code}/meta must succeed`).toBeTruthy();
  const body = await res.json();
  return body.nav ?? [];
}

function flattenHrefs(links: NavLink[]): string[] {
  return links.flatMap((l) => [l.href, ...flattenHrefs(l.children ?? [])]);
}

function attachHygiene(page: Page) {
  const httpFailures: string[] = [];
  const consoleErrors: string[] = [];
  const iconWarnings: string[] = [];

  page.on("response", (r: Response) => {
    const status = r.status();
    if (status < 400) return;
    const url = r.url();
    // 401/403 on auth probes and 404s on optional assets are handled by the
    // app itself (login flow, enforcer); anything else is a hygiene failure.
    if (status === 401 || status === 403) return;
    httpFailures.push(`${status} ${r.request().method()} ${url}`);
  });
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error") consoleErrors.push(text);
    if (text.includes('Icon "') && text.includes("not found")) iconWarnings.push(text);
  });

  return { httpFailures, consoleErrors, iconWarnings };
}

test.describe("module ownership — observable contract", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("every page-owning module: switcher select → owning route → declared nav", async ({
    page,
  }) => {
    const modules = await fetchModules(page);
    const pageModules_ = pageModules(modules);
    expect(
      pageModules_.length,
      "at least one page-owning module must be enabled"
    ).toBeGreaterThan(0);

    for (const m of pageModules_) {
      // Open the switcher and pick THIS module by name.
      await page.locator(SWITCHER_TRIGGER).first().click();
      await page.locator(MENU_ITEM, { hasText: m.name }).first().click();

      // Wait for the client-side navigation to a prefix-owned route.
      await page.waitForFunction(
        (prefixes) => {
          const p = location.pathname;
          return prefixes.some((x: string) => p === x || p.startsWith(x + "/"));
        },
        m.route_prefixes ?? [],
        { timeout: 15000 }
      );

      // Contract 1: the landed route must resolve to the module that was
      // selected — never swallowed by a broader foreign prefix.
      const owner = expectedOwner(modules, pathOf(page));
      expect(
        owner,
        `route ${page.url()} must resolve to '${m.id}' (got '${owner}')`
      ).toBe(m.id);

      // Contract 2: switcher must display the module that was selected —
      // no stale label, no fake fallback.
      const trigger = page.locator(SWITCHER_TRIGGER).first();
      await expect(trigger).toContainText(m.name, { timeout: 10000 });

      // Contract 3: the sidebar must render exactly the module's declared
      // nav hrefs — nothing missing, nothing exceeding.
      const declared = (await fetchModuleNav(page, m.id)).filter((l) => l.href);
      const expectedHrefs = new Set(flattenHrefs(declared));
      await expect
        .poll(async () => {
          const hrefs = await page
            .locator("[data-sidebar='content'] a[href]")
            .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
          return hrefs.filter((h) => h && expectedHrefs.has(h)).sort().join("|");
        }, `sidebar must render all ${m.id} nav links`)
        .toBe([...expectedHrefs].sort().join("|"));

      // No foreign links either: every rendered link href must be declared
      // by THIS module or point outside the module nav entirely (shared
      // chrome links are not declared by any module).
      const renderedHrefs = await page
        .locator("[data-sidebar='content'] a[href]")
        .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
      for (const href of renderedHrefs) {
        if (!href) continue;
        const linkOwner = expectedOwner(modules, href);
        // A link pointing at a route owned by a DIFFERENT module may only
        // exist if this module actually declared it in its nav.
        if (linkOwner && linkOwner !== m.id) {
          expect(
            expectedHrefs.has(href),
            `${m.id} sidebar must not render foreign link ${href} (owned by ${linkOwner})`
          ).toBeTruthy();
        }
      }
    }
  });

  test("i18n coverage: no raw dict keys leak on module pages", async ({ page }) => {
    const modules = pageModules(await fetchModules(page));

    for (const m of modules) {
      const home = m.route_prefixes![0];
      await page.goto(home, { waitUntil: "domcontentloaded" });
      // Give the async dict merge a beat.
      await page.waitForTimeout(1500);

      const leaks = await page.evaluate((pattern) => {
        const re = new RegExp(pattern, "g");
        const hits = new Set<string>();
        document.querySelectorAll("body *").forEach((el) => {
          const t = el.childNodes.length === 1 ? el.textContent?.trim() : "";
          if (t && re.test(t)) hits.add(t.slice(0, 120));
        });
        return [...hits];
      }, RAW_KEY.source);
      expect(leaks, `raw translation keys rendered on ${home}`).toEqual([]);
    }

    // Parity: every enabled module must serve a non-empty dict in the
    // current UI language.
    for (const m of modules) {
      const res = await page.request.get(
        `/api/v1/system/translations/${m.id}/en-GB`
      );
      expect(res.ok(), `dict endpoint for '${m.id}' must succeed`).toBeTruthy();
      const dict = await res.json();
      const size = Object.keys(dict?.dict ?? dict ?? {}).length;
      expect(size, `module '${m.id}' dictionary must not be empty`).toBeGreaterThan(0);
    }
  });

  test("icons: every declared module/nav icon resolves", async ({ page }) => {
    const { iconWarnings } = attachHygiene(page);
    await page.goto("/system", { waitUntil: "domcontentloaded" });

    const modules = await fetchModules(page);

    // Switcher dropdown: every module icon must render an <svg>, never the
    // '?' error marker.
    await page.locator(SWITCHER_TRIGGER).first().click();
    await page.locator(MENU_ITEM).first().waitFor({ state: "visible", timeout: 10000 });
    const markers = await page
      .locator("[data-slot='dropdown-menu-content'] [aria-label^='Icon not found']")
      .count();
    expect(markers, "missing-icon markers in module switcher").toBe(0);
    const svgs = await page.locator(`${MENU_ITEM} svg`).count();
    expect(svgs, "module icons must render as svg").toBeGreaterThanOrEqual(modules.length);
    await page.keyboard.press("Escape");

    // For each page-owning module, open its home and check nav-link icons.
    for (const m of pageModules(modules)) {
      const home = m.route_prefixes![0];
      await page.goto(home, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      const missing = await page
        .locator("[data-sidebar='content'] [aria-label^='Icon not found']")
        .count();
      expect(missing, `missing icon markers on ${m.id} nav`).toBe(0);
    }

    expect(iconWarnings, "console must not log missing-icon warnings").toEqual([]);
  });

  test("network + console hygiene across module routes", async ({ page }) => {
    const { httpFailures, consoleErrors } = attachHygiene(page);
    const modules = pageModules(await fetchModules(page));

    for (const m of modules) {
      const home = m.route_prefixes![0];
      await page.goto(home, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
    }

    const benign = /favicon|manifest|service-worker|__data\.json|fonts\.|\.map$/i;
    const realFailures = httpFailures.filter((f) => !benign.test(f));
    expect(realFailures, "unexpected HTTP failures during module navigation").toEqual([]);
    expect(
      // 'Redirect' is SvelteKit's own console emission for an intentional
      // load()-level redirect() during CSR (e.g. /system → its declared
      // home) — navigation succeeded; the entry is framework noise, not a
      // page error.
      consoleErrors.filter((e) => !/favicon|DevTools|Permissions-Policy|^Redirect$/i.test(e)),
      "unexpected console errors during module navigation"
    ).toEqual([]);
  });
});
