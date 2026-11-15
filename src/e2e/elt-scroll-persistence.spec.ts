import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/**
 * elt scroll persistence — `useScrollPreservation` stores the horizontal
 * scroll position as a FRACTION of the scrollable range in sessionStorage
 * (`<storageKey>:scrollLeft`) and re-applies it across row reloads AND full
 * page reloads (B17). The pin below covers the reload path: scroll right,
 * reload, assert the table restores a comparable offset.
 *
 * Surface: /system/settings/users — canonical EntityTablePage list with
 * enough default-visible columns to overflow a narrow viewport.
 *
 * Implementation constraint the test must respect: scroll writes stay
 * suppressed through a ~1.5s post-mount "settle window" (they would
 * otherwise persist the restore's own clamped writes). The test waits the
 * gate out before scrolling.
 */

const USERS = "/system/settings/users";
const SCROLL_HOST = "[data-slot=table-container]";

test.describe("elt scroll persistence", () => {
  test("horizontal scroll position survives a full page reload", async ({ page }) => {
    await loginAsTestAdmin(page);
    // Narrow viewport guarantees a real horizontal range on a many-column list.
    await page.setViewportSize({ width: 760, height: 800 });
    await page.goto(USERS, { waitUntil: "domcontentloaded" });
    const host = page.locator(SCROLL_HOST).first();
    await expect(page.locator("table tbody tr[data-row-index]").first()).toBeVisible({ timeout: 30000 });

    // The persistence writer stays suppressed through the post-mount restore
    // window — scroll only after the settled gate lifts.
    await page.waitForTimeout(1800);

    const range = await host.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(range).toBeGreaterThan(50);

    await host.evaluate((el) => {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) * 0.9;
    });

    // rAF-throttled write → sessionStorage `*:scrollLeft` fraction > 0.
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.keys(window.sessionStorage)
            .filter((k) => k.endsWith(":scrollLeft"))
            .some((k) => Number(window.sessionStorage.getItem(k)) > 0),
        ),
      )
      .toBe(true);

    const target = await host.evaluate((el) => el.scrollLeft);
    expect(target).toBeGreaterThan(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr[data-row-index]").first()).toBeVisible({ timeout: 30000 });

    // The restore re-applies the stored FRACTION as content width grows —
    // px drift is expected, a restored offset near the target is the contract.
    await expect
      .poll(() => host.evaluate((el) => el.scrollLeft), { timeout: 10000 })
      .toBeGreaterThan(target * 0.5);
  });
});
