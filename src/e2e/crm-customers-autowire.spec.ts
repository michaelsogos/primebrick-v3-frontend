import { extJsonParse } from "@primebrick/core/ext-json";
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

test.describe.configure({ mode: "serial" });

/* Customers full autowire — the definitive end-user contract (user-ratified
 * 2026-11-27): NOTHING in CRM is non-standard. Derivation is TOTAL and
 * unconditional — every standard entity gets its list leaf, create leaf,
 * list route, create form route. An authored icon/label/order is a COSMETIC
 * override on the leaf only: it never suppresses the autowire, never changes
 * a route, never changes a page kind. */

async function fetchModules(page: import("@playwright/test").Page) {
  const raw = (await page.evaluate(async () => {
    const r = await fetch("/api/v1/modules", { credentials: "include" });
    if (!r.ok) return `{"error":${r.status}}`;
    return r.text();
  })) as string;
  return extJsonParse(raw) as {
    modules?: Array<{
      id: string;
      nav?: Array<{ id: string; href?: string; icon?: string; sidebar?: boolean; default?: boolean; order?: number }>;
      routes?: Array<{ route: string; kind?: string; entity?: string; component_url?: string; page_props?: { form?: { fields?: unknown[] } } }>;
    }>;
  };
}

test.beforeEach(async ({ page }) => {
  await loginAsTestAdmin(page);
});

test("payload: customers is fully derived — create leaf autowired, cosmetic overrides never suppress", async ({ page }) => {
  await page.goto("/crm/customers", { waitUntil: "domcontentloaded" });
  await expect(page.locator('a[href="/crm/customers"]').first()).toBeVisible({ timeout: 5_000 });

  const payload = await fetchModules(page);
  const crm = (payload.modules ?? []).find((m) => m.id === "crm");
  expect(crm, "crm module in payload").toBeTruthy();

  // Exactly ONE customers list leaf — derived, carrying the cosmetic overrides
  // (users-round icon, pinned order, module default) without any suppression.
  const listLeaves = (crm?.nav ?? []).filter((l) => l.href === "/crm/customers");
  expect(listLeaves.length, "exactly one customers list leaf — never duplicated").toBe(1);
  expect(listLeaves[0]?.icon, "the authored users-round icon survives as a cosmetic override").toBe("users-round");

  // The create leaf EXISTS — sidebar:false popover-only, like every other entity.
  const createLeaf = (crm?.nav ?? []).find((l) => l.href === "/crm/customers/create");
  expect(createLeaf, "customers create leaf autowired — the icon override never suppressed it").toBeTruthy();
  expect(createLeaf?.sidebar, "create leaf is popover-only by design").toBe(false);
  expect(createLeaf?.icon, "the create leaf carries the user-round icon — the authored cosmetic override (user-ratified 2026-11-27)").toBe("user-round");

  // Routes: list + create are standard entity surfaces — the create is a
  // host-rendered entity form (page_props.form.fields), NEVER a remote stub.
  const listRoute = crm?.routes?.find((r) => r.route === "/crm/customers");
  expect(listRoute?.kind, "list route is the standard list kind").toBe("list");
  const createRoute = crm?.routes?.find((r) => r.route === "/crm/customers/create");
  expect(createRoute?.kind, "create route is the standard create kind").toBe("create");
  expect(createRoute?.component_url, "the remote stub is dead — the create page is host-rendered").toBeUndefined();
  expect(
    (createRoute?.page_props?.form?.fields?.length ?? 0) > 0,
    "the create route carries the derived form fields — the standard entity_form archetype",
  ).toBe(true);
});

test("browser: popover shows the customers create leaf before its list — the classic pairing", async ({ page }) => {
  await page.goto("/crm/customers", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => sessionStorage.setItem("pb.lang", "it-IT"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('a[href="/crm/customers"]').first()).toBeVisible({ timeout: 5_000 });

  await page.getByTestId("app-launcher-trigger").click();
  const panel = page.getByTestId("app-launcher-panel");
  await expect(panel).toBeVisible({ timeout: 5_000 });
  const appRows = panel.locator('[data-launcher-col="0"] [data-launcher-row]');
  await appRows.last().click();
  const moduleRows = panel.locator('[data-launcher-col="1"] [data-launcher-row]');
  await expect(moduleRows.first()).toBeVisible({ timeout: 5_000 });
  await moduleRows.first().hover();
  const rows = panel.locator('[data-launcher-col="2"] [data-launcher-row]');
  await expect(rows.first()).toBeVisible({ timeout: 5_000 });
  await page.locator("#app-launcher-show-all-switch").click();

  const labels: string[] = [];
  for (const r of await rows.all()) labels.push(((await r.textContent()) ?? "").trim());
  console.log("popover rows:", labels);

  const createIdx = labels.indexOf("Nuovo Cliente");
  expect(createIdx, "the popover lists Nuovo Cliente — the create leaf finally exists").toBeGreaterThanOrEqual(0);
  expect(labels[createIdx + 1], "the create leaf immediately precedes its list").toBe("Lista Clienti");
});

test("browser: /crm/customers/create renders the standard entity form — never a coming-soon stub", async ({ page }) => {
  await page.goto("/crm/customers/create", { waitUntil: "domcontentloaded" });
  // The standard form archetype renders input fields — the stub is dead.
  await expect(
    page.locator("form input, [data-testid*='field'] input, input[name]").first(),
    "the classic entity form renders input fields",
  ).toBeVisible({ timeout: 5_000 });
  const bodyText = (await page.locator("body").textContent()) ?? "";
  expect(bodyText.includes("coming soon") || bodyText.includes("Coming soon"), "no coming-soon stub anymore").toBe(false);
});
