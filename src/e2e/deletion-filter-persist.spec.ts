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

test.describe("pagination + search persistence", () => {
  test("ELT: page and page size survive reload", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/crm/customers");

    const next = page.getByTestId("elt-page-next");
    const status = page.getByTestId("elt-pagination-status");
    const sizeBtn = page.getByTestId("elt-page-size");
    await next.waitFor({ state: "visible" });

    // page size 50 first (changing size resets to page 1), then page 2
    await sizeBtn.click();
    await page.getByRole("menuitem", { name: "50", exact: true }).click();
    await expect(sizeBtn).toHaveText("50");
    await next.click();
    const statusText = (await status.textContent()) ?? "";
    expect(statusText).toContain("2");

    await page.reload();
    await status.waitFor({ state: "visible" });
    await expect(page.getByTestId("elt-pagination-status")).toHaveText(statusText);
    await expect(page.getByTestId("elt-page-size")).toHaveText("50");
  });

  test("ELT: committed search survives reload", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/crm/customers");

    const search = page.getByTestId("entity-search").locator("input");
    await search.waitFor({ state: "visible" });
    // Synthetic keyEvent paths don't reliably reach the Svelte oninput on
    // this overlay input (text-transparent + highlight underlay), so drive
    // the native input contract directly and retry until the handler lands
    // it — same chain a real keystroke takes: SearchInput.oninput →
    // onSearchInput → debounce → appliedSearch → /list?search=.
    await search.click();
    await expect
      .poll(async () => {
        await search.evaluate((el: HTMLInputElement) => {
          el.value = "admin-seed";
          el.dispatchEvent(new Event("input", { bubbles: true }));
        });
        return page.evaluate(() => sessionStorage.getItem("pb:customers:list:search"));
      }, { timeout: 10_000 })
      .toBe("admin-seed");
    // appliedSearch is debounced — wait until the store write lands
    await expect
      .poll(async () => page.evaluate(() => sessionStorage.getItem("pb:customers:list:search")), { timeout: 5000 })
      .toBe("admin-seed");

    await page.reload();
    await search.waitFor({ state: "visible" });
    await expect(search).toHaveValue("admin-seed");
  });
});
