import { extJsonStringify, extJsonParse } from "@primebrick/core/ext-json";
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

// Shared Edge session + one ephemeral actor: parallel workers race the same
// login surface. The nav contract is sequential user evidence, never a
// multi-session concurrency test.
test.describe.configure({ mode: "serial" });

/* CRM nav auto-derivation — the facade wire contract (2026-11-27):
 * the SAME entity declarations that serve the routes derive the module's
 * navigation inside createMicroservice. This spec pins the user-visible
 * truth of that wire:
 *
 *   standard entities   → sidebar leaf + host entity_list archetype
 *   @Dict vocabularies  → leaf under the settings sibling, dict archetype
 *   @Relation bridges   → NEVER a leaf (customer_link keeps API only)
 *   read/audit-only     → list reachable, no create route surface
 *   customer            → exactly one leaf (author-owned, never doubled)
 *
 * Label keys are entity-canonical, never placement-dependent: a vocabulary
 * carries `crm.<table>.nav` wherever it sits, so the seeds that already
 * exist for every entity resolve with zero duplication. A leaf rendering
 * a raw key IS the red this spec exists for.
 */

test.describe("crm nav auto-derivation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("derived standard leaves render in the sidebar — bridge never does", async ({ page }) => {
    await page.goto("/crm/customers", { waitUntil: "domcontentloaded" });
    const sidebar = page.locator("nav, aside").first();
    for (const href of [
      "/crm/customer_accounts",
      "/crm/customer_contacts",
      "/crm/customer_consents",
      "/crm/local_addresses",
    ]) {
      await expect(
        page.locator(`a[href="${href}"]`).first(),
        `sidebar carries the derived leaf ${href}`,
      ).toBeVisible({ timeout: 5_000 });
    }
    expect(
      await page.locator('a[href="/crm/customer_links"]').count(),
      "customer_link is a @Relation bridge — never a sidebar leaf",
    ).toBe(0);
    // exactly one customers leaf — the derivation must not double the authored one
    expect(await page.locator('a[href="/crm/customers"]').count()).toBe(1);
    void sidebar;
  });

  test("a derived standard entity renders the host list archetype", async ({ page }) => {
    await page.goto("/crm/customer_accounts", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator("table").first(),
      "customer_accounts renders the entity_list archetype table",
    ).toBeVisible({ timeout: 5_000 });
  });

  test("a derived dict vocabulary renders under the settings sibling", async ({ page }) => {
    await page.goto("/crm/settings/customer_types", { waitUntil: "domcontentloaded" });
    // the dict archetype is an inline-editing row anatomy (listitem rows
    // with combobox editors + reorder/delete row buttons), never a <table>
    await expect(
      page.locator("main li").first(),
      "customer_types renders the dict archetype inline rows",
    ).toBeVisible({ timeout: 5_000 });
  });

  test("read/audit-only customer_consents exposes no create surface", async ({ page }) => {
    await page.goto("/crm/customer_consents", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator("table").first(),
      "customer_consents renders its list",
    ).toBeVisible({ timeout: 5_000 });
    // the create route is never derived — navigating there must not yield a form
    await page.goto("/crm/customer_consents/create", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_000);
    expect(
      await page.locator("form").count(),
      "no create form exists for a read/audit-only entity",
    ).toBe(0);
  });
});

test.describe("pipeline fake deletion — the end-user truth", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("the payload carries no pipeline leaf, route or /system/crm prefix", async ({ page }) => {
    await page.goto("/crm/customers", { waitUntil: "domcontentloaded" });
    type NavLeaf = { id: string };
    type RouteDecl = { route: string };
    type ModuleSummary = { id: string; nav?: NavLeaf[]; routes?: RouteDecl[]; route_prefixes?: string[] };
    const raw = (await page.evaluate(async () => {
      const r = await fetch("/api/v1/modules", { credentials: "include" });
      if (!r.ok) return `{"error":${r.status}}`;
      return r.text();
    })) as string;
    const payload = extJsonParse(raw) as { error?: number; modules?: ModuleSummary[] };
    expect(payload.error, "modules payload reachable").toBeUndefined();
    const crm = (payload.modules ?? []).find((m) => m.id === "crm");
    expect(crm, "crm module in payload").toBeTruthy();
    expect(
      (crm?.nav ?? []).some((l) => l.id === "pipeline"),
      "the fake pipeline leaf is gone from the crm nav",
    ).toBe(false);
    expect(
      (crm?.routes ?? []).some((r) => r.route === "/system/crm/pipeline"),
      "the fake pipeline route is gone from the crm census",
    ).toBe(false);
    expect(
      crm?.route_prefixes ?? [],
      "crm is back inside the documented single-namespace contract",
    ).not.toContain("/system/crm");
  });

  test("the sidebar carries no pipeline leaf anywhere", async ({ page }) => {
    await page.goto("/crm/customers", { waitUntil: "domcontentloaded" });
    await expect(page.locator('a[href="/crm/customers"]').first()).toBeVisible({ timeout: 5_000 });
    expect(
      await page.locator('a[href$="/pipeline"]').count(),
      "no sidebar leaf points at any pipeline path",
    ).toBe(0);
  });

  test("/system/crm/pipeline renders no pipeline content — dead is dead", async ({ page }) => {
    // The deletion truth: the dead URL is indistinguishable from a route
    // that never existed — no census decl means nothing mounts the fake
    // page. What the shell shows for unknown routes generally (redirect /
    // resolution state) is pre-existing shell behavior outside this slice.
    await page.goto("/system/crm/pipeline", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_000);
    expect(
      await page.locator('[data-testid="remote-page-content"]').count(),
      "no remote page content mounts at the deleted route",
    ).toBe(0);
  });
});

test.describe("icon defaults — the kind materialization end-user truth", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("emission materializes kind defaults — authored icons win", async ({ page }) => {
    await page.goto("/crm/customers", { waitUntil: "domcontentloaded" });
    // the SAME payload the sidebar consumes — icon materialization is
    // emission-side, so the payload IS the contract the user sees rendered
    type NavLeaf = { id: string; icon?: string; label_key?: string };
    type ModuleSummary = { id: string; nav?: NavLeaf[] };
    const raw = (await page.evaluate(async () => {
      const r = await fetch("/api/v1/modules", { credentials: "include" });
      if (!r.ok) return `{"error":${r.status}}`;
      return r.text();
    })) as string;
    const payload = extJsonParse(raw) as { error?: number; modules?: ModuleSummary[] };
    expect(payload.error, "modules payload reachable").toBeUndefined();
    const modules = payload.modules ?? [];
    const crm = modules.find((m) => m.id === "crm");
    const crmSettings = modules.find((m) => m.id === "crm-settings");
    expect(crm, "crm module in payload").toBeTruthy();
    expect(crmSettings, "crm-settings sibling module in payload").toBeTruthy();

    const leaf = (mod: ModuleSummary | undefined, id: string) => (mod?.nav ?? []).find((l) => l.id === id);

    // authored icons ALWAYS win — the customers override survives;
    // the fake pipeline leaf is deleted forever, never coming back
    expect(leaf(crm, "customers")?.icon).toBe("users-round");
    expect(leaf(crm, "pipeline"), "the fake pipeline leaf stays deleted").toBeUndefined();

    // dict kind default — the migrated vocabularies carry the authored
    // table-dictionary glyph through materialization, never table-2
    expect(leaf(crmSettings, "customer_types")?.icon).toBe("table-dictionary");
    expect(leaf(crmSettings, "customer_link_types")?.icon).toBe("table-dictionary");

    // builtin authored override — sequences keeps its custom glyph
    expect(leaf(crmSettings, "sequences")?.icon).toBe("sequence-numeric-right");

    // list kind default — the unmigrated derive as list → table-2 today;
    // this pins CURRENT truth so the migration diff is visible when it lands
    expect(leaf(crm, "customer_accounts")?.icon).toBe("table-2");

    // label keys are entity-canonical — the SAME key shape a standard leaf
    // carries, never placement-dependent. The seeds for `crm.<table>.nav`
    // already exist for every entity, so the wire needs zero duplication.
    expect(leaf(crmSettings, "customer_types")?.label_key).toBe("crm.customer_types.nav");
    expect(leaf(crmSettings, "account_kinds")?.label_key).toBe("crm.account_kinds.nav");
    expect(leaf(crm, "customer_accounts")?.label_key).toBe("crm.customer_accounts.nav");
  });

  test("the sidebar renders the table-dictionary glyph on a dict leaf", async ({ page }) => {
    await page.goto("/crm/settings/customer_types", { waitUntil: "domcontentloaded" });
    const dictLeaf = page.locator('a[href="/crm/settings/customer_types"]').first();
    await expect(dictLeaf).toBeVisible({ timeout: 5_000 });
    // end-user truth, not payload shape: the rendered SVG is the authored
    // table-dictionary glyph. Its x=10.5 column split is unique in
    // CUSTOM_ICONS — a bare "not table-2" assertion would pass even when
    // the glyph is missing or swapped for another non-list icon.
    await expect(dictLeaf.locator("svg").first()).toBeVisible();
    expect(
      await dictLeaf.locator('path[d="M10.5 3v18"]').count(),
      "dict leaf renders the table-dictionary glyph, never the list default",
    ).toBe(1);
    const classes = await dictLeaf.locator("svg").first().getAttribute("class");
    expect(classes ?? "", "dict leaf must not render the list glyph").not.toContain("lucide-table-2");
  });

  test("the breadcrumb carries the same table-dictionary glyph on a dict page", async ({ page }) => {
    await page.goto("/crm/settings/account_kinds", { waitUntil: "domcontentloaded" });
    const breadcrumb = page.locator('nav[data-slot="breadcrumb"]').first();
    await expect(breadcrumb, "breadcrumb mounted on the dict page").toBeVisible({ timeout: 5_000 });
    expect(
      await breadcrumb.locator('path[d="M10.5 3v18"]').count(),
      "breadcrumb resolves the moved leaf through the same nav payload and carries its dict icon",
    ).toBeGreaterThan(0);
  });

  test("every CRM vocabulary leaf lands under settings with the table-dictionary glyph", async ({ page }) => {
    await page.goto("/crm/settings/customer_types", { waitUntil: "domcontentloaded" });
    for (const table of [
      "account_kinds",
      "company_dimensions",
      "consent_types",
      "contact_types",
      "legal_forms",
      "local_address_types",
      "marketing_qualifications",
      "qualifications",
    ]) {
      const leaf = page.locator(`a[href="/crm/settings/${table}"]`).first();
      await expect(leaf, `${table} is a settings dict leaf`).toBeVisible({ timeout: 5_000 });
      await expect(leaf.locator("svg").first(), `${table} renders an icon`).toBeVisible();
      const text = ((await leaf.textContent()) ?? "").trim();
      expect(text.length, `${table} renders a label`).toBeGreaterThan(0);
      expect(text, `${table} renders the translated label, never the raw key`).not.toContain("crm.");
      expect(
        await leaf.locator('path[d="M10.5 3v18"]').count(),
        `${table} renders the table-dictionary glyph, never the list default`,
      ).toBe(1);
      expect(
        await page.locator(`a[href="/crm/${table}"]`).count(),
        `${table} no longer renders as a root standard-list leaf`,
      ).toBe(0);
    }
  });
});

test.describe("create leaf auto-wire — the leaf follows the route's fate (2026-11-27)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("a standard entity with create permission carries a create leaf flagged sidebar:false — popover-only by design", async ({ page }) => {
    await page.goto("/crm/customer_accounts", { waitUntil: "domcontentloaded" });
    // payload pin: the autowire flags create leaves sidebar:false — the sidebar
    // skips them, the popover lists them (user-ratified placement, derive-entity-nav.ts:156-162)
    type NavLeaf = { id: string; href?: string; sidebar?: boolean };
    type ModuleSummary = { id: string; nav?: NavLeaf[] };
    const raw = (await page.evaluate(async () => {
      const r = await fetch("/api/v1/modules", { credentials: "include" });
      if (!r.ok) return `{"error":${r.status}}`;
      return r.text();
    })) as string;
    const payload = extJsonParse(raw) as { error?: number; modules?: ModuleSummary[] };
    const crm = (payload.modules ?? []).find((m) => m.id === "crm");
    const createLeaf = crm?.nav?.find((l) => l.href === "/crm/customer_accounts/create");
    expect(createLeaf?.sidebar, "create leaf autowired sidebar:false — popover-only placement").toBe(false);
    expect(
      await page.locator(`[data-sidebar="sidebar"] a[href="/crm/customer_accounts/create"]`).count(),
      "the sidebar never renders create leaves — popover-only by design",
    ).toBe(0);
  });

  test("customer_consents — read-only surface — carries NO create leaf, exactly like it carries no create route", async ({ page }) => {
    await page.goto("/crm/customer_consents", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('[data-sidebar="sidebar"] a[href="/crm/customer_consents"]').first(),
      "the list leaf exists",
    ).toBeVisible({ timeout: 5_000 });
    expect(
      await page.locator('[data-sidebar="sidebar"] a[href="/crm/customer_consents/create"]').count(),
      "no create route → no create leaf — the leaf never outlives its surface",
    ).toBe(0);
  });
});
