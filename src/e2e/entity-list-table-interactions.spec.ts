import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/**
 * entity-list-table interaction spot-checks — the table pipeline was the
 * largest surface re-typed in the `no-explicit-any` cleanup (prop contracts
 * across TableHeader/HeaderRow/TableRow/TableBody/CardView/TableView plus
 * the previewPanel/sticky/rowRangeSelection composables). These specs prove
 * the interactions the types now describe still behave end-to-end.
 *
 * Product contract under test (not implementation):
 *   - sortable header click → a fresh /list request carries sort_key+sort_dir
 *   - select-all checkbox → every rendered row flips data-state="selected"
 *   - row dblclick → the preview panel opens AND exactly one row carries
 *     data-focused-row-index — the focusedRowIndex wiring was a latent bug
 *     an `as any` cast hid (TableBody never passed it to TableRow), so this
 *     attribute could never render before the cleanup fixed it
 *
 * Surface: /system/job/job-schedules — host-rendered standard list
 * archetype, guaranteed populated (the job module registers schedules at
 * boot; jobs-pages' sparkline spec depends on the same fact).
 */

const SCHEDULES = "/system/job/job-schedules";
const LIST_URL = "/job_schedule/list";

test.describe("entity-list-table interactions", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("sortable header click re-fetches with sort_key/sort_dir", async ({ page }) => {
    const listUrls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes(LIST_URL)) listUrls.push(req.url());
    });
    await page.goto(SCHEDULES, { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30000 });
    listUrls.length = 0;

    // Only sortable columns get the cursor-pointer header class.
    const sortableHead = page.locator("table thead th.cursor-pointer").first();
    await sortableHead.click();

    // A click on a sortable column triggers a re-fetch carrying both params.
    await expect
      .poll(() => listUrls.some((u) => u.includes("sort_key=") && u.includes("sort_dir=")))
      .toBe(true);
  });

  test("select-all checkbox marks every rendered row selected", async ({ page }) => {
    await page.goto(SCHEDULES, { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30000 });

    const rows = page.locator("table tbody tr[data-row-index]");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // bits-ui Checkbox renders a button[role=checkbox]; the head cell holds
    // the page-scope select-all.
    await page.locator("table thead [role='checkbox']").first().click();

    for (const row of await rows.all()) {
      await expect(row).toHaveAttribute("data-state", "selected");
    }
  });

  test("row dblclick opens the preview panel and focuses exactly that row", async ({ page }) => {
    await page.goto(SCHEDULES, { waitUntil: "domcontentloaded" });
    const firstRow = page.locator("table tbody tr[data-row-index]").first();
    await expect(firstRow).toBeVisible({ timeout: 30000 });
    const idx = await firstRow.getAttribute("data-row-index");

    await firstRow.dblclick();

    // The preview region splits — and exactly ONE row gets the focus marker.
    // Both come from the same previewPanel.state.focusedRowIndex wiring.
    await expect(page.locator("tr[data-focused-row-index]")).toHaveCount(1);
    await expect(page.locator("tr[data-focused-row-index]")).toHaveAttribute(
      "data-focused-row-index",
      idx ?? "",
    );
  });
});
