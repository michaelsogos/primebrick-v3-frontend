/**
 * deletion-filter-persist — the soft-delete view-group selection must
 * survive a page reload, exactly like view-mode does.
 *
 * Two surfaces, two distinct former bugs:
 * - ELT: useDeletionFilter already persisted to sessionStorage, but the
 *   `!hasSoftDelete` reset $effect fired while meta columns were still
 *   empty and clobbered the stored mode back to 'non_deleted'.
 * - Dict page: `list.deletionFilterMode` lived only in useEntityList
 *   memory — never persisted at all.
 *
 * Both now restore the stored mode before the first loadRows ships.
 */

import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

test.describe("deletion filter persistence", () => {
  test("ELT: deleted-mode selection survives reload", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/crm/customers");

    const deleted = page.getByTestId("entity-deletion-filter-deleted");
    const live = page.getByTestId("entity-deletion-filter-non_deleted");
    await deleted.waitFor({ state: "visible" });

    await deleted.click();
    await expect(deleted).toHaveAttribute("aria-pressed", "true");
    await expect(live).toHaveAttribute("aria-pressed", "false");

    await page.reload();
    await deleted.waitFor({ state: "visible" });
    // Restored mode ships with the first loadRows — the toggle must still
    // show 'deleted' pressed, not bounce back to non_deleted.
    await expect(deleted).toHaveAttribute("aria-pressed", "true");
    await expect(live).toHaveAttribute("aria-pressed", "false");

    // restore the default for other tests
    await live.click();
    await expect(live).toHaveAttribute("aria-pressed", "true");
  });

  test("dict page: deleted-mode selection survives reload", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/crm/settings/customer_types");

    const deleted = page.getByTestId("dict-deletion-filter-deleted");
    const live = page.getByTestId("dict-deletion-filter-non_deleted");
    await deleted.waitFor({ state: "visible" });

    await deleted.click();
    await expect(deleted).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await deleted.waitFor({ state: "visible" });
    await expect(deleted).toHaveAttribute("aria-pressed", "true");
    await expect(live).toHaveAttribute("aria-pressed", "false");

    await live.click();
    await expect(live).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("row selection persistence", () => {
  test("ELT: checked rows survive reload", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/crm/customers");

    const boxes = page.locator('[role="checkbox"][aria-label="select row"]');
    await boxes.first().waitFor({ state: "visible" });
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await expect(page.locator('[data-state="checked"]')).toHaveCount(2);

    await page.reload();
    await boxes.first().waitFor({ state: "visible" });
    // Restored selection applies before rows render — both checks return.
    await expect(page.locator('[data-state="checked"]')).toHaveCount(2);

    // restore the default for other tests
    await page.locator('[data-state="checked"]').first().click();
    await page.locator('[data-state="checked"]').first().click();
    await expect(page.locator('[data-state="checked"]')).toHaveCount(0);
  });

  test("dict page: checked rows survive reload", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/crm/settings/customer_types");

    const rows = page.locator('[data-testid^="selectable-row-"]');
    await rows.first().waitFor({ state: "visible" });
    const first = rows.nth(0).getByRole("checkbox");
    const second = rows.nth(1).getByRole("checkbox");
    await first.check();
    await second.check();
    await expect(page.locator('[data-state="checked"]')).toHaveCount(2);

    await page.reload();
    await rows.first().waitFor({ state: "visible" });
    await expect(page.locator('[data-state="checked"]')).toHaveCount(2);

    await page.locator('[data-state="checked"]').first().click();
    await page.locator('[data-state="checked"]').first().click();
    await expect(page.locator('[data-state="checked"]')).toHaveCount(0);
  });
});
