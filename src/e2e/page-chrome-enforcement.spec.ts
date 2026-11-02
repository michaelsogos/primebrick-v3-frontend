import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/**
 * Page-chrome enforcement — the mandatory header cannot be evaded.
 *
 * Construction-time enforcement is `no-restricted-imports` on routes/**
 * (route files cannot import header/breadcrumb machinery). These specs
 * verify the RUNTIME side of the same contract: every (app) surface —
 * regardless of how its page is built (list archetype, form archetype,
 * remote esm chunk, bespoke custom page) — renders exactly one
 * host-owned PageHeader and exactly one <h1>. A page that bypassed the
 * shell would show zero headers; one that rebuilt its own chrome would
 * show two.
 *
 *   - list archetype:      /system/job/rules            (EntityTablePage)
 *   - form archetype:      /system/job/rules/create     (EntityFormPage pilot)
 *   - remote page:         /system/job/job-schedules/create (esm chunk)
 *   - custom pages:        /system/settings/migrations, /system/settings/credentials
 *
 * The reserved presence slot must exist on every header — the
 * collaboration feature (collaboration-visual-merge plan, still draft)
 * renders there and nowhere else.
 *
 * The `chrome:'remote'` decl flag is the ONLY opt-out: if the census
 * declares such a route, it must NOT get the host header (checked
 * contract-driven — the spec passes vacuously when no decl opts out).
 */

const HEADER = "[data-testid='page-header']";
const PRESENCE = "[data-testid='page-header-presence']";

const SURFACES: Array<{ name: string; route: string }> = [
  { name: "list archetype", route: "/system/job/rules" },
  { name: "form archetype", route: "/system/job/rules/create" },
  { name: "remote page", route: "/system/job/job-schedules/create" },
  { name: "custom page (migrations)", route: "/system/settings/migrations" },
  { name: "custom page (credentials)", route: "/system/settings/credentials" },
];

test.describe("page chrome enforcement (mandatory header)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  for (const surface of SURFACES) {
    test(`${surface.name}: exactly one PageHeader + one h1 + presence slot`, async ({ page }) => {
      await page.goto(surface.route, { waitUntil: "domcontentloaded" });

      await expect(page.locator(HEADER)).toHaveCount(1, { timeout: 30000 });
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator(PRESENCE)).toHaveCount(1);
    });
  }

  test("chrome:'remote' decls opt out of the host header (census-driven)", async ({ page }) => {
    // Contract-driven: read the module census for any decl that declares
    // `chrome:'remote'` — the sanctioned opt-out — and assert the host
    // honors it. Vacuous pass today if no decl uses the flag.
    const modsRes = await page.request.get("/api/v1/modules");
    const { modules } = (await modsRes.json()) as {
      modules: Array<{
        id: string;
        nav?: { routes?: Array<{ path?: string; chrome?: string; label_key?: string }> };
      }>;
    };
    const remoteChromeRoutes: string[] = [];
    for (const mod of modules ?? []) {
      for (const r of mod.nav?.routes ?? []) {
        if (r.chrome === "remote" && r.path) remoteChromeRoutes.push(r.path);
      }
    }

    test.skip(remoteChromeRoutes.length === 0, "no decl uses chrome:'remote' today");

    for (const route of remoteChromeRoutes.slice(0, 3)) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator(HEADER)).toHaveCount(0, { timeout: 30000 });
    }
  });
});
