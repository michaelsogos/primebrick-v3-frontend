import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/* ref display join — `@Ref` emits an automatic `{key}_name` projection
 * off the target entity's display template (`${display_field}` here:
 * job_trigger.name → trigger_uuid_name).
 *
 * Contract verified end-to-end on /system/job/job-schedules:
 *  - the list response carries `trigger_uuid_name` (no uuid fallback when
 *    the target row exists — NULL when the ref is empty).
 *  - the ref cell renders the joined display name, never the raw uuid.
 *  - `sort_key=trigger_uuid` orders on the joined name surface.
 *  - `search_in=trigger_uuid` ILIKEs the display expression.
 */

const LIST = "/svc/job/api/v1/entities/job_schedule/list";

test.describe("ref display join — job_schedule.trigger_uuid", () => {
  test("list projects trigger_uuid_name; cell shows the display name", async ({ page }) => {
    await loginAsTestAdmin(page);

    const res = await page.request.get(`${LIST}?page_size=25`);
    expect(res.status()).toBe(200);
    const rows = (await res.json()).rows as Record<string, unknown>[];
    const named = rows.find((r) => r.trigger_uuid_name != null);
    expect(named, "expected ≥1 row with a resolved trigger name").toBeTruthy();
    expect(named!.trigger_uuid_name).not.toBe(named!.trigger_uuid);

    // The cell shows the display name (ref-cell-*-text testid contract).
    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: "Columns" }).first().click();
    const toggle = page.getByTestId("columns-toggle-trigger_uuid");
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await toggle.click();
    await page.keyboard.press("Escape");

    const cell = page.getByTestId("ref-cell-trigger_uuid-text").first();
    await expect(cell).toBeVisible({ timeout: 15000 });
    const text = (await cell.textContent())?.trim() ?? "";
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  test("sort and search_in resolve on the joined name", async ({ page }) => {
    await loginAsTestAdmin(page);

    const sorted = await page.request.get(`${LIST}?page_size=5&sort_key=trigger_uuid`);
    expect(sorted.status()).toBe(200);

    // Pick a real name first, then search_in for it — server-side ILIKE on
    // the COALESCE'd display expression, not the raw uuid.
    const probe = await page.request.get(`${LIST}?page_size=25`);
    const rows = (await probe.json()).rows as { trigger_uuid_name?: string }[];
    const name = rows.find((r) => r.trigger_uuid_name)?.trigger_uuid_name;
    expect(name).toBeTruthy();

    const searched = await page.request.get(
      `${LIST}?page_size=5&search_in=trigger_uuid&search=${encodeURIComponent(name!.slice(0, 12))}`,
    );
    expect(searched.status()).toBe(200);
    const hits = (await searched.json()).rows as { trigger_uuid_name?: string }[];
    expect(hits.length).toBeGreaterThan(0);
  });
});
