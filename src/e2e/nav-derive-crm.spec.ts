import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

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
 * Assertions ride hrefs/archetype markers, never label text — the label
 * seeds are a separate ledger task and raw keys must not red this spec.
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

test.describe("icon defaults — the kind materialization end-user truth", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("emission materializes kind defaults — authored icons win", async ({ page }) => {
    await page.goto("/crm/customers", { waitUntil: "domcontentloaded" });
    // the SAME payload the sidebar consumes — icon materialization is
    // emission-side, so the payload IS the contract the user sees rendered
    const payload = await page.evaluate(async () => {
      const r = await fetch("/api/v1/modules", { credentials: "include" });
      if (!r.ok) return { error: r.status };
      return r.json();
    });
    expect(payload.error, "modules payload reachable").toBeUndefined();
    const crm = payload.modules.find((m) => m.id === "crm");
    const crmSettings = payload.modules.find((m) => m.id === "crm-settings");
    expect(crm, "crm module in payload").toBeTruthy();
    expect(crmSettings, "crm-settings sibling module in payload").toBeTruthy();

    const leaf = (mod, id) => (mod?.nav ?? []).find((l) => l.id === id);

    // authored icons ALWAYS win — the customers/pipeline overrides survive
    expect(leaf(crm, "customers")?.icon).toBe("users-round");
    expect(leaf(crm, "pipeline")?.icon).toBe("git-branch");

    // dict kind default — the migrated vocabularies carry the authored
    // table-dictionary glyph through materialization, never table-2
    expect(leaf(crmSettings, "customer_types")?.icon).toBe("table-dictionary");
    expect(leaf(crmSettings, "customer_link_types")?.icon).toBe("table-dictionary");

    // builtin authored override — sequences keeps its custom glyph
    expect(leaf(crmSettings, "sequences")?.icon).toBe("sequence-numeric-right");

    // list kind default — the unmigrated derive as list → table-2 today;
    // this pins CURRENT truth so the migration diff is visible when it lands
    expect(leaf(crm, "customer_accounts")?.icon).toBe("table-2");
  });

  test("the sidebar renders the materialized glyph, not the list default, on a dict leaf", async ({ page }) => {
    await page.goto("/crm/settings/customer_types", { waitUntil: "domcontentloaded" });
    const dictLeaf = page.locator('a[href="/crm/settings/customer_types"]').first();
    await expect(dictLeaf).toBeVisible({ timeout: 5_000 });
    // the leaf renders an svg glyph…
    await expect(dictLeaf.locator("svg").first()).toBeVisible();
    // …and it is NOT the lucide list glyph — table-dictionary is a custom
    // authored glyph (no lucide class); lucide-table-2 here would mean the
    // list default leaked onto a dict leaf
    const classes = await dictLeaf.locator("svg").first().getAttribute("class");
    expect(classes ?? "", "dict leaf must not render the list glyph").not.toContain("lucide-table-2");
  });
});
