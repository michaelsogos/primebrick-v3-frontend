import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/* ELT list-UX regression locks — the served-meta/wire consolidation:
 *
 *  - ColumnsPanel select-all: tri-state checkbox + rendered-count badge;
 *    select-all shows every rendered column (always-on stay pinned),
 *    deselect restores the DECLARED default visibility (not "hide all").
 *  - Reload strip: the h-0.5 slot below the toolbar keeps its height and
 *    shows the indeterminate bar on EVERY populated-table reload, not
 *    just the empty first load.
 *  - Persisted-state sanitize: stale filterValues/searchInKeys written by
 *    an older build are dropped at bootstrap (post-meta, pre-first-rows)
 *    instead of poisoning every list call into a 400 loop.
 *  - Preset-owned fields (schedule_type) never appear in the filters
 *    panel — the toolbar preset is the single owner of that predicate.
 */

const SK = "pb:jobs:schedules:";

test.describe("ELT columns/filter UX — job_schedule", () => {
  test("columns panel select-all → all rendered; deselect → declared defaults", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30000 });

    await page.getByRole("button", { name: "Columns" }).click();
    const selectAll = page.getByTestId("columns-select-all");
    await expect(selectAll).toBeVisible({ timeout: 15000 });

    const count = page.getByTestId("columns-visible-count");
    const initial = (await count.textContent())!.trim().split("/");
    // Default state is partial — indeterminate.
    expect(Number(initial[0])).toBeLessThan(Number(initial[1]));
    await expect(selectAll).toHaveAttribute("data-state", "indeterminate");

    // Select-all → every rendered column visible (uuid is default-HIDDEN —
    // the discriminator that proves the sweep covers non-default columns).
    await page.getByTestId("columns-select-all-label").click();
    await expect(count).toHaveText(`${initial[1]}/${initial[1]}`);
    await expect(selectAll).toHaveAttribute("data-state", "checked");
    await expect(page.getByTestId("columns-toggle-uuid").locator('[data-state="checked"]')).toHaveCount(1);

    // Deselect → back to declared defaults (job_name stays: always-on pin).
    await page.getByTestId("columns-select-all-label").click();
    await expect(count).toHaveText(`${initial[0]}/${initial[1]}`);
    await expect(selectAll).toHaveAttribute("data-state", "indeterminate");
    const pinToggle = page.getByTestId("columns-toggle-job_name");
    await expect(pinToggle).toBeDisabled();
    await expect(pinToggle.locator('[data-state="checked"]')).toHaveCount(1);
    await page.keyboard.press("Escape");
  });

  test("reload strip shows the indeterminate bar during a populated-table reload", async ({ page }) => {
    await loginAsTestAdmin(page);
    // Slow the list endpoint so the loading window is observable.
    await page.route(/\/entities\/job_schedule\/list/, async (route) => {
      await new Promise((r) => setTimeout(r, 900));
      await route.continue();
    });
    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30000 });

    const strip = page.getByTestId("elt-reload-strip");
    await expect(strip).toBeVisible(); // height retained even when idle

    // Populated-table reload: click the refresh CTA while rows are present.
    await page.getByRole("button", { name: /refresh/i }).click();
    await expect(strip.locator('[data-slot="loading-bar"]')).toBeVisible();
    // …and rows never unmounted (stale-while-revalidate, no empty flash).
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  test("stale persisted filters/search_in are dropped before the first list call", async ({ page }) => {
    await loginAsTestAdmin(page);
    // Poison BOTH legacy-readable media — bogus field (never existed) +
    // schedule_spec (served filterable:false). Under the strict wire both
    // would 400 every call without the bootstrap sanitize.
    await page.addInitScript((sk) => {
      const poison = {
        [`${sk}columnOrder:filterValues`]: JSON.stringify({ bogus_field: "x", schedule_spec: "y" }),
        [`${sk}columnOrder:advancedFilters`]: JSON.stringify([
          { id: "p1", field: "bogus_field", operator: "=", value: 1 },
          { id: "p2", field: "status", operator: "=", value: "ACTIVE" }
        ]),
        [`${sk}searchInKeys`]: JSON.stringify(["version", "bogus_key"])
      };
      for (const [k, v] of Object.entries(poison)) {
        window.sessionStorage.setItem(k, v);
        window.localStorage.setItem(k, v);
      }
    }, SK);

    const listFields: string[] = [];
    const listSearchIn: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (!url.includes("/entities/job_schedule/list")) return;
      const u = new URL(url);
      for (const [k, v] of u.searchParams) {
        if (/^filters\[\d+\]\[field\]$/.test(k)) listFields.push(v);
        if (k === "search_in") listSearchIn.push(v);
      }
    });

    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30000 });
    // No networkidle — the SSE service-availability feed never idles; the
    // bootstrap list call is already captured once rows render.
    await page.waitForTimeout(500);

    expect(listFields).not.toContain("bogus_field");
    expect(listFields).not.toContain("schedule_spec");
    expect(listSearchIn.join(",")).not.toContain("bogus_key");
    expect(listSearchIn.join(",")).not.toContain("version");
    // The survived legit criterion still applied.
    expect(listFields).toContain("status");
  });

  test("filters panel excludes the preset-owned schedule_type field", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30000 });

    await page.getByRole("button", { name: /filters/i }).first().click();
    const sheet = page.locator("[data-slot='sheet-content'], [role='dialog']").last();
    await expect(sheet.getByTestId("filters-apply")).toBeVisible({ timeout: 15000 });
    // `schedule_type` ("Type") is governed by the toolbar schedule_kind
    // preset — never offered as a free filter field.
    await expect(sheet.getByText("Type", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });
});
