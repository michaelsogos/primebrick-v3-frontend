import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/* Identity-column contract — job_schedule is the regression entity:
 *
 *  - `armed_by` is the display_field (calculated: trigger name → armer
 *    profile → service code) — the pinned identity column: rendered
 *    FIRST, checked AND disabled in the picker (sanitizeVisibleKeys
 *    re-injects the pin; the toggle can never unhide it).
 *  - `uuid` is sticky-but-hideable — user-controlled, hidden by default,
 *    present as an ENABLED toggle (the counter-case to the pin).
 *  - `schedule_subject` is a NORMAL column now (order:15, no pin): it
 *    renders the zap/amber NATS-subject badge and is user-toggleable.
 *  - `schedule_spec` carries its OWN label after the seed collision
 *    fix — "Cadence", not a second "Source Queue".
 */

test.describe("identity column contract — job_schedule", () => {
  test("display_field pinned first, uuid sticky-toggleable, subject chrome", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30000 });

    // The pinned identity column is the FIRST header cell after the
    // selection column — sticky semantics = rendered before every
    // normal column, and its value is the resolved armer.
    const firstHeader = page.locator("table thead th").nth(1);
    await expect(firstHeader).toContainText("Armed By", { timeout: 10000 });
    const firstCell = page.locator("table tbody tr").first().locator("td").nth(1);
    await expect(firstCell).not.toBeEmpty();

    // schedule_subject renders the NATS-subject badge — zap icon +
    // translated census label inside a badge, not bare text.
    const subjectCells = page.locator("table tbody td", { has: page.locator("svg.lucide-zap") });
    await expect(subjectCells.first()).toBeVisible({ timeout: 10000 });

    // Picker: the pin is checked AND disabled — never toggleable.
    await page.getByRole("button", { name: "Columns" }).click();
    const pinToggle = page.getByTestId("columns-toggle-armed_by");
    await expect(pinToggle).toBeVisible({ timeout: 15000 });
    await expect(pinToggle).toBeDisabled();
    // The checkbox is aria-hidden (visual-only) — assert its bits-ui
    // data-state instead of the a11y role.
    await expect(pinToggle.locator('[data-state="checked"]')).toHaveCount(1);

    // Counter-case: uuid is sticky-but-hideable — enabled toggle.
    const uuidToggle = page.getByTestId("columns-toggle-uuid");
    await expect(uuidToggle).toBeVisible();
    await expect(uuidToggle).toBeEnabled();

    // schedule_subject is a normal column now — user-toggleable.
    const subjectToggle = page.getByTestId("columns-toggle-schedule_subject");
    await expect(subjectToggle).toBeVisible();
    await expect(subjectToggle).toBeEnabled();

    // The label de-dup: schedule_spec reads "Cadence"; the subject
    // carries its own "Source Queue" label — no collision.
    const specToggle = page.getByTestId("columns-toggle-schedule_spec");
    await expect(specToggle).toBeVisible();
    await expect(specToggle).toContainText("Cadence");
    await expect(subjectToggle).toContainText("Source Queue");
    await page.keyboard.press("Escape");
  });
});
