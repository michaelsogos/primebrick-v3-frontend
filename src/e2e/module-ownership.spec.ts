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
  /** Own root level — the primary prefix is /{part_of}/{id} (collapses to /{id} when part_of === id). */
  part_of: string;
  /** Primary prefix plus optional EXTRA app memberships — each extra is /{root}/{id}. */
  route_prefixes?: string[];
  is_reserved?: boolean;
  /** Declared default module of its root level. */
  is_default?: boolean;
  /** i18n key for the module's localized display name (module's own dict). */
  label_key?: string;
};

type NavLink = { id: string; label_key: string; href: string; icon?: string; children?: NavLink[] };

const RAW_KEY = /\b(?:app|system|custom|job|crm|emailsender|webhook|ai)\.[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+\b/i;

const pathOf = (page: Page) => new URL(page.url()).pathname;
const LAUNCHER_TRIGGER = "[data-testid='app-launcher-trigger']";
const LAUNCHER_APPS = "[data-testid='app-launcher-apps']";
const LAUNCHER_MODULES = "[data-testid='app-launcher-modules']";
const LAUNCHER_PAGES = "[data-testid='app-launcher-pages']";
const LAUNCHER_OPTION = "[role='option']";
const LAUNCHER_CTA = "[data-testid='launcher-cta']";

/** Modules that own FE pages — headless services (no nav decl) are excluded. */
const pageModules = (modules: ModuleInfo[]) =>
  modules.filter((m) => (m.route_prefixes?.length ?? 0) > 0);

/** First URL segment — the root level a prefix/href lives under. */
const rootOf = (path: string) => path.split("/").filter(Boolean)[0] ?? "";

/** Distinct root levels a module owns pages under (all its prefixes). */
const moduleRoots = (m: ModuleInfo) =>
  [...new Set((m.route_prefixes ?? []).map(rootOf).filter(Boolean))];

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

async function openLauncher(page: Page) {
  await page.locator(LAUNCHER_TRIGGER).first().click();
  await page.locator(LAUNCHER_APPS).first().waitFor({ state: "visible", timeout: 10000 });
}

/** Select an app column item (row click descends — the CTA navigates). */
async function launcherSelectApp(page: Page, root: string) {
  await page
    .locator(`${LAUNCHER_APPS} ${LAUNCHER_OPTION}[data-app-root="${root}"]`)
    .first()
    .click();
}

/** Click a module row's goto CTA (row itself only previews — the CTA navigates). */
async function launcherClickModule(page: Page, moduleId: string) {
  await page
    .locator(`${LAUNCHER_MODULES} ${LAUNCHER_OPTION}[data-module-id="${moduleId}"]`)
    .first()
    .locator(LAUNCHER_CTA)
    .click();
}

/** Click an app row's goto CTA — runs the declared default-module chain. */
async function launcherClickApp(page: Page, root: string) {
  await page
    .locator(`${LAUNCHER_APPS} ${LAUNCHER_OPTION}[data-app-root="${root}"]`)
    .first()
    .locator(LAUNCHER_CTA)
    .click();
}

/**
 * The module's localized display name — mirrors the FE `resolveModuleLabel`
 * contract: the registry `label_key` resolved in the module's OWN dict,
 * raw `name` as fallback. Dict fetch goes through the same endpoint the
 * shell uses, so the assertion tracks the real data path.
 */
async function expectedModuleLabel(page: Page, m: ModuleInfo): Promise<string> {
  if (!m.label_key) return m.name;
  const res = await page.request.get(
    `/api/v1/system/translations/${m.id}/en-GB`
  );
  if (!res.ok()) return m.name;
  const dict: Record<string, string> = await res.json();
  return dict[m.label_key] ?? m.name;
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

  test("every page-owning module×root: launcher select → owning route → declared nav", async ({
    page,
  }) => {
    const modules = await fetchModules(page);
    const pageModules_ = pageModules(modules);
    expect(
      pageModules_.length,
      "at least one page-owning module must be enabled"
    ).toBeGreaterThan(0);

    // A module may own pages under MULTIPLE roots (extra /{root}/{code}
    // prefixes — e.g. crm under both /crm and /system/crm): each
    // (module, root) pair is its own selectable slice.
    for (const m of pageModules_) {
      for (const root of moduleRoots(m)) {
        await page.goto("/system", { waitUntil: "domcontentloaded" });
        await openLauncher(page);
        // Hover (not click) the app → its modules column previews; then
        // click THIS module by name — click = module home under that app.
        await launcherSelectApp(page, root);
        await launcherClickModule(page, m.id);

        // Wait for the client-side navigation to a prefix-owned route
        // under THIS app root.
        const rootPrefixes = (m.route_prefixes ?? []).filter((p) => rootOf(p) === root);
        await page.waitForFunction(
          (prefixes) => {
            const p = location.pathname;
            return prefixes.some((x: string) => p === x || p.startsWith(x + "/"));
          },
          rootPrefixes,
          { timeout: 15000 }
        );

        // Contract 1: the landed route must resolve to the module that was
        // selected — never swallowed by a broader foreign prefix.
        const owner = expectedOwner(modules, pathOf(page));
        expect(
          owner,
          `route ${page.url()} must resolve to '${m.id}' (got '${owner}')`
        ).toBe(m.id);

        // Contract 2: launcher trigger must display the module's LOCALIZED
        // label (service_registry.label_key, same string as the breadcrumb)
        // — never the raw registry name and never a foreign module's.
        const trigger = page.locator(LAUNCHER_TRIGGER).first();
        await expect(trigger).toContainText(await expectedModuleLabel(page, m), {
          timeout: 10000
        });

        // Contract 3: the sidebar must render exactly the module's nav
        // hrefs under THIS root — nothing missing, nothing exceeding
        // (a multi-root module shows only this app's slice).
        const declared = (await fetchModuleNav(page, m.id))
          .filter((l) => l.href && rootOf(l.href) === root);
        const expectedHrefs = new Set(flattenHrefs(declared));
        await expect
          .poll(async () => {
            const hrefs = await page
              .locator("[data-sidebar='content'] a[href]")
              .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
            return hrefs.filter((h) => h && expectedHrefs.has(h)).sort().join("|");
          }, `sidebar must render all ${m.id} nav links under /${root}`)
          .toBe([...expectedHrefs].sort().join("|"));

        // No foreign links either: every rendered link href must be
        // declared by THIS module or point outside the module nav
        // entirely (shared chrome links are not declared by any module).
        const renderedHrefs = await page
          .locator("[data-sidebar='content'] a[href]")
          .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
        for (const href of renderedHrefs) {
          if (!href) continue;
          const linkOwner = expectedOwner(modules, href);
          // A link pointing at a route owned by a DIFFERENT module may
          // only exist if this module actually declared it in its nav.
          if (linkOwner && linkOwner !== m.id) {
            expect(
              expectedHrefs.has(href),
              `${m.id} sidebar must not render foreign link ${href} (owned by ${linkOwner})`
            ).toBeTruthy();
          }
        }
      }
    }
  });

  test("root level: every module is namespaced under /{root}/{code}", async ({ page }) => {
    const modules = await fetchModules(page);
    expect(modules.length, "at least one module must be enabled").toBeGreaterThan(0);

    for (const m of modules) {
      // The primary prefix is derived: /{part_of}/{code}, collapsing to
      // /{code} when part_of === code. Extras may only add /{root}/{code}
      // — the code stays the URL's second segment under every root.
      const expectedPrimary = m.part_of === m.id ? `/${m.id}` : `/${m.part_of}/${m.id}`;
      const prefixes = m.route_prefixes ?? [];
      // Headless services (ai, emailsender, webhook) declare no nav/prefixes
      // — the primary-prefix contract only applies to page-owning modules.
      if (prefixes.length > 0) {
        expect(
          prefixes.includes(expectedPrimary),
          `module '${m.id}' must declare its primary prefix '${expectedPrimary}'`
        ).toBeTruthy();
      }
      for (const p of prefixes) {
        const segs = p.split("/").filter(Boolean);
        expect(
          segs.length === 1 ? segs[0] === m.id : segs[1] === m.id,
          `module '${m.id}' prefix '${p}' must keep '${m.id}' as its last declared segment`
        ).toBeTruthy();
      }
      // Every nav href lives under SOME declared prefix. Modules without
      // a nav declaration (headless services — offline ai/emailsender/
      // webhook carry no endpoints.nav) legitimately 404 on meta.
      const nav = prefixes.length > 0 ? await fetchModuleNav(page, m.id) : [];
      for (const href of flattenHrefs(nav)) {
        expect(
          prefixes.some((px) => href === px || href.startsWith(px + "/")),
          `module '${m.id}' nav link '${href}' must live under one of ${JSON.stringify(prefixes)}`
        ).toBeTruthy();
      }
    }

    // The app launcher is always visible and lists every root level —
    // including roots that exist only via extra-prefix membership.
    await page.goto("/system", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(LAUNCHER_TRIGGER).first(),
      "app launcher must be visible in the sidebar"
    ).toBeVisible({ timeout: 10000 });
    const roots = new Set(modules.flatMap((m) => moduleRoots(m)));
    await openLauncher(page);
    for (const root of roots) {
      await expect(
        page
          .locator(`${LAUNCHER_APPS} ${LAUNCHER_OPTION}[data-app-root="${root}"]`)
          .first(),
        `root '${root}' must appear in the launcher app column`
      ).toBeVisible();
    }
    await page.keyboard.press("Escape");
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

    // Launcher modules column: every module icon must render an <svg>,
    // never the '?' error marker. The column is app-scoped — previewing
    // 'system' lists the modules owning /system/* pages.
    const systemRootModules = modules.filter((m) => moduleRoots(m).includes("system"));
    await openLauncher(page);
    await launcherSelectApp(page, "system");
    await page.locator(`${LAUNCHER_MODULES} ${LAUNCHER_OPTION}`).first().waitFor({ state: "visible", timeout: 10000 });
    const markers = await page
      .locator(`${LAUNCHER_MODULES} [aria-label^='Icon not found']`)
      .count();
    expect(markers, "missing-icon markers in launcher modules column").toBe(0);
    // DynamicIcon resolves each icon via a lazy import — poll so the count
    // is taken only after the async components actually render.
    await expect
      .poll(async () => page.locator(`${LAUNCHER_MODULES} ${LAUNCHER_OPTION} svg`).count(), {
        timeout: 10000,
      })
      .toBeGreaterThanOrEqual(systemRootModules.length);
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

  test("app click loads the declared default module → its default page", async ({ page }) => {
    const modules = await fetchModules(page);
    // Every enabled root: click = select app → is_default module → its
    // first nav page under that app. Falls back to first member when no
    // module claims is_default.
    const roots = [...new Set(modules.flatMap((m) => moduleRoots(m)))];
    expect(roots.length, "at least one app root must exist").toBeGreaterThan(0);

    for (const root of roots) {
      const members = modules.filter((m) => moduleRoots(m).includes(root));
      const target =
        members.find((m) => m.part_of === root && m.is_default) ?? members[0];
      const rootPrefixes = (target.route_prefixes ?? []).filter((p) => rootOf(p) === root);
      if (rootPrefixes.length === 0) continue; // no pages under this root

      await page.goto("/system", { waitUntil: "domcontentloaded" });
      await openLauncher(page);
      // The app ROW only previews — the CTA runs the default-module chain.
      await launcherClickApp(page, root);

      // The cascade must land under the clicked app's root, on a route
      // owned by the declared default module.
      await page.waitForFunction(
        (prefixes) => {
          const p = location.pathname;
          return prefixes.some((x: string) => p === x || p.startsWith(x + "/"));
        },
        rootPrefixes,
        { timeout: 15000 }
      );
      const owner = expectedOwner(modules, pathOf(page));
      expect(
        owner,
        `clicking app '${root}' must land on its default module '${target.id}' (got '${owner}')`
      ).toBe(target.id);
      await expect(page.locator(LAUNCHER_TRIGGER).first()).toContainText(
        await expectedModuleLabel(page, target)
      );
    }
  });

  test("breadcrumb: {app} / {module} / {page} — dropdown on the page segment", async ({
    page,
  }) => {
    const modules = await fetchModules(page);
    const appDictRes = await page.request.get("/api/v1/system/translations/public/en-GB");
    const appDict: Record<string, string> = appDictRes.ok() ? await appDictRes.json() : {};

    for (const m of pageModules(modules)) {
      const nav = await fetchModuleNav(page, m.id);
      const moduleLabel = await expectedModuleLabel(page, m);
      const dictRes = await page.request.get(`/api/v1/system/translations/${m.id}/en-GB`);
      const dict: Record<string, string> = dictRes.ok() ? await dictRes.json() : {};

      // One probe per root slice — the first declared nav link of each
      // root the module serves (crm → /crm/customers + /system/crm/pipeline).
      for (const root of moduleRoots(m)) {
        const rootNav = nav.filter((l) => l.href && rootOf(l.href) === root);
        const first = rootNav[0];
        if (!first?.href) continue;
        const rootLabel = appDict[`app.nav.roots.${root}`] ?? root;
        const pageLabel = dict[first.label_key] ?? first.label_key;

        await page.goto(first.href, { waitUntil: "domcontentloaded" });
        const bc = page.locator('nav[aria-label="breadcrumb"]');
        await expect(bc, `breadcrumb must render on ${first.href}`).toBeVisible({
          timeout: 15000,
        });

        // The module/page segments render once the module's nav meta
        // resolves (async) — wait for the full 3-item structure before
        // reading the labels, or the snapshot can catch the root-only
        // first paint.
        const items = bc.locator("li[data-slot='breadcrumb-item']");
        await expect(
          items,
          `on ${first.href} breadcrumb must render all 3 segments`,
        ).toHaveCount(3, { timeout: 15000 });

        // Ordered labels — exactly {app} / {module} / {page}.
        const texts = await bc.locator("li").allTextContents();
        expect(
          texts.map((x) => x.trim()).filter((x) => x && x !== "/"),
          `on ${first.href} expected '${rootLabel} / ${moduleLabel} / ${pageLabel}'`
        ).toEqual([rootLabel, moduleLabel, pageLabel]);

        // The module segment is a LINK to the module home in this root —
        // the page segment is the dropdown (a button, current page).
        await expect(items.nth(1).locator("a")).toHaveAttribute("href", first.href);
        await expect(items.nth(2).locator("button")).toBeVisible();

        // Icon identity — same sources as the launcher: app root icon on
        // segment 0, service_registry.icon on the module, nav icon on the
        // page dropdown. Each segment must render an svg.
        for (const n of [0, 1, 2]) {
          await expect(
            items.nth(n).locator("svg").first(),
            `segment ${n} of ${first.href} must render its icon`
          ).toBeVisible();
        }
      }
    }
  });

  test("multi-root module: same module under different apps shows different pages", async ({
    page,
  }) => {
    const modules = await fetchModules(page);
    // The experiment: a module declaring extra /{root}/{code} prefixes
    // owns distinct page slices under each root (crm → /crm + /system/crm).
    const multi = pageModules(modules).filter((m) => moduleRoots(m).length > 1);
    if (multi.length === 0) test.skip(true, "no multi-root module registered — experiment off");

    for (const m of multi) {
      const nav = await fetchModuleNav(page, m.id);
      for (const root of moduleRoots(m)) {
        await page.goto("/system", { waitUntil: "domcontentloaded" });
        await openLauncher(page);
        // The module must appear in EVERY root's module column.
        await launcherSelectApp(page, root);
        await expect(
          page
            .locator(`${LAUNCHER_MODULES} ${LAUNCHER_OPTION}[data-module-id="${m.id}"]`)
            .first(),
          `module '${m.id}' must appear under app '${root}'`
        ).toBeVisible();

        // Its Pages column under this root only lists this root's slice —
        // selecting the module loads the column; a visible page option must
        // exist for every nav link declared under this root.
        await page
          .locator(`${LAUNCHER_MODULES} ${LAUNCHER_OPTION}[data-module-id="${m.id}"]`)
          .first()
          .click();
        const rootNav = nav.filter((l) => l.href && rootOf(l.href) === root);
        await expect
          .poll(
            async () => page.locator(`${LAUNCHER_PAGES} ${LAUNCHER_OPTION}`).count(),
            `${LAUNCHER_PAGES} must preview ${m.id} pages under /${root}`
          )
          .toBeGreaterThanOrEqual(rootNav.length);
        // Navigate to the module home under this root via click.
        await launcherClickModule(page, m.id);
        const rootPrefixes = (m.route_prefixes ?? []).filter((p) => rootOf(p) === root);
        await page.waitForFunction(
          (prefixes) => {
            const p = location.pathname;
            return prefixes.some((x: string) => p === x || p.startsWith(x + "/"));
          },
          rootPrefixes,
          { timeout: 15000 }
        );
        // Sidebar nav under this root = the root-scoped nav slice.
        // moduleNav loads async after selectModule — poll until the
        // rendered links match (same pattern as contract 3 above).
        const expectedHrefs = new Set(
          flattenHrefs(nav.filter((l) => l.href && rootOf(l.href) === root))
        );
        await expect
          .poll(async () => {
            const renderedHrefs = await page
              .locator("[data-sidebar='content'] a[href]")
              .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
            return renderedHrefs.filter((h) => h && expectedHrefs.has(h)).sort().join("|");
          }, `under /${root} the '${m.id}' sidebar must show its root-scoped nav`)
          .toBe([...expectedHrefs].sort().join("|"));
        // And never leak the OTHER root's slice.
        const renderedHrefs = await page
          .locator("[data-sidebar='content'] a[href]")
          .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
        for (const href of flattenHrefs(nav.filter((l) => l.href && rootOf(l.href) !== root))) {
          expect(
            renderedHrefs,
            `under /${root} the '${m.id}' sidebar must NOT show foreign-root page ${href}`
          ).not.toContain(href);
        }
      }
    }
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
