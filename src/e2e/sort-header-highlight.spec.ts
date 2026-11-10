/**
 * sort-header-highlight — the sorted ELT column header advertises itself:
 * label span gets `text-primary font-semibold`, the directional arrow
 * renders at full stroke (no opacity dim), and clearing the sort restores
 * the neutral `lucide-arrow-up-down` muted indicator.
 *
 * Second block: the `entity.filters` sheet tabs resolve their i18n keys —
 * `standard_filters`/`advanced_filters` (snake_case seeds) must render the
 * translated label, never the raw key; and the auto-derived `uuid` field
 * label reads "UUID" (patched from the misleading "ID").
 */

import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

test.describe("sorted column header highlight", () => {
  test("primary + semibold on the sorted column, muted arrow on the rest", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/crm/customers");

    const heads = page.locator("th.cursor-pointer");
    await heads.first().waitFor({ state: "visible" });
    // The page's default sort may already highlight one column — pick a
    // header that is NOT currently sorted so the asc→desc→none cycle is
    // exercised deterministically from the unsorted state.
    let target: ReturnType<typeof heads.nth> | null = null;
    let label = page.locator("span.__never__");
    for (let i = 0; i < (await heads.count()); i++) {
      const h = heads.nth(i);
      const span = h.locator("span.inline-flex").first();
      const cls = (await span.getAttribute("class")) ?? "";
      if (!cls.includes("text-primary")) {
        target = h;
        label = span;
        break;
      }
    }
    expect(target, "expected at least one unsorted sortable column").not.toBeNull();

    // asc — label goes primary/semibold, arrow-up at full stroke
    await target!.click();
    await expect(label).toHaveClass(/text-primary/);
    await expect(label).toHaveClass(/font-semibold/);
    await expect(label.locator("svg.lucide-arrow-up")).toBeVisible();
    await expect(label.locator("svg.lucide-arrow-up")).not.toHaveClass(/opacity-60/);

    // desc — still highlighted, arrow-down
    await target!.click();
    await expect(label).toHaveClass(/text-primary/);
    await expect(label.locator("svg.lucide-arrow-down")).toBeVisible();

    // cleared — neutral indicator back, highlight gone
    await target!.click();
    await expect(label).not.toHaveClass(/text-primary/);
    await expect(label).not.toHaveClass(/font-semibold/);
    await expect(label.locator("svg.lucide-arrow-up-down")).toHaveClass(/opacity-60/);
  });
});

test.describe("filters sheet i18n", () => {
  test("mode tabs render translated labels, uuid field reads UUID", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/crm/settings/customer_types");
    await page.getByTestId("dict-filters").click();

    const standard = page.getByTestId("filters-mode-standard");
    const advanced = page.getByTestId("filters-mode-advanced");
    await expect(standard).toBeVisible();
    // Raw-key regressions surface as the camelCase key itself — assert the
    // label is neither variant of the key and looks like real copy.
    await expect(standard).not.toHaveText(/standardFilters|standard_filters/);
    await expect(advanced).not.toHaveText(/advancedFilters|advanced_filters/);
    await expect(standard).toHaveText(/filters|filtri/i);
    await expect(advanced).toHaveText(/filters|filtri/i);

    // uuid is an auto-derived filterable field — its label is the
    // system.common.fields.uuid value, now "UUID" (was the ambiguous "ID").
    await expect(page.locator("text=UUID").first()).toBeVisible();
  });
});

test.describe("version history field labels", () => {
  test("dict row history resolves entity-owning-ns labels, not system.*", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/crm/settings/customer_types");

    // Open the first row's version history via its v-badge.
    const badge = page.locator('button', { hasText: /^v\d+$/ }).first();
    await badge.waitFor({ state: "visible" });
    await badge.click();

    // customer_type is crm-owned — field labels resolve via
    // `crm.entities.customer_type.fields.*`. The entities_ns default
    // ("system") previously produced raw `system.entities.customer_type.*`
    // keys in the delta view.
    const sheet = page.getByRole("dialog").first();
    await expect(sheet).toBeVisible();
    await expect(sheet.locator("text=/system\\.entities\\.customer_type\\./")).toHaveCount(0);
  });
});
