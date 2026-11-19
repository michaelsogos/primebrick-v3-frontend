import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/* Identity-column contract — job_schedule is the regression entity:
 *
 *  - `name` is the display_field (physical: the declared job identity,
 *    stamped at arm time from the owning trigger's name) — the pinned
 *    identity column: rendered FIRST, checked AND disabled in
 *    the picker.
 *  - `uuid` is sticky-but-hideable — user-controlled, hidden by default,
 *    present as an ENABLED toggle (the counter-case to the pin).
 *  - `created_by` is the WHO surface — label-overridden to "Armed By"
 *    (audit column relabel), a normal toggleable column rendering the
 *    resolved actor stamp.
 *  - `schedule_subject` is a NORMAL column (order:15): the zap/amber
 *    NATS-subject badge, user-toggleable.
 *  - `schedule_spec` carries its OWN label — "Cadence", not a second
 *    "Source Queue".
 */

test.describe("identity column contract — job_schedule", () => {
  test("display_field pinned first, uuid sticky-toggleable, subject chrome", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30000 });

    // The pinned identity column is the FIRST header cell after the
    // selection column — sticky semantics = rendered before every
    // normal column, and its value is the scheduled job's name.
    const firstHeader = page.locator("table thead th").nth(1);
    await expect(firstHeader).toContainText("Job Name", { timeout: 10000 });
    const firstCell = page.locator("table tbody tr").first().locator("td").nth(1);
    await expect(firstCell).not.toBeEmpty();

    // schedule_subject renders the NATS-subject badge — zap icon +
    // translated census label inside a badge, not bare text.
    const subjectCells = page.locator("table tbody td", { has: page.locator("svg.lucide-zap") });
    await expect(subjectCells.first()).toBeVisible({ timeout: 10000 });

    // Picker: the pin is checked AND disabled — never toggleable.
    await page.getByRole("button", { name: "Columns" }).first().click();
    const pinToggle = page.getByTestId("columns-toggle-name");
    await expect(pinToggle).toBeVisible({ timeout: 15000 });
    await expect(pinToggle).toBeDisabled();
    // The checkbox is aria-hidden (visual-only) — assert its bits-ui
    // data-state instead of the a11y role.
    await expect(pinToggle.locator('[data-state="checked"]')).toHaveCount(1);

    // The WHO column: armed_by is a dedicated calculated ref column
    // (fired_at → armed_by → armed_at → disarmed_at band) — visible and
    // user-toggleable (a normal column, not the identity).
    const armedByToggle = page.getByTestId("columns-toggle-armed_by");
    await expect(armedByToggle).toBeVisible();
    await expect(armedByToggle).toContainText("Armed By");
    await expect(armedByToggle).toBeEnabled();

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

  /* run_stats sparkline — the zero-filled grid contract: the server
   * emits every bucket in the span (position = time, current bucket
   * last) and every slot draws at least one rect — a colored segment
   * when the bucket has runs, the baseline tick when empty. The frame
   * therefore exists even for never-ran schedules. */
  test("sparkline renders a fixed 10-slot frame, current bucket last", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30000 });

    const svg = page.locator("table tbody svg[aria-label='sparkline']").first();
    await expect(svg).toBeVisible({ timeout: 15000 });
    // ≥10 rects: every one of the 10 slots draws ≥1 rect (colored or tick).
    await expect.poll(async () => svg.locator("rect").count(), { timeout: 15000 }).toBeGreaterThanOrEqual(10);
  });

  /* Slot tooltips are the canonical bits-ui channel: a transparent
   * trigger overlays each slot (DOM sibling of the svg), hover opens the
   * styled Content through the portal. The content has the canonical
   * anatomy — a full localized date/range header (always carries the
   * 4-digit year) and one vertically stacked row per series (dot +
   * "N Label"), derived locale-proof from the trigger's aria-label. */
  test("sparkline slot hover opens the standard tooltip with bucket data", async ({ page }) => {
    await loginAsTestAdmin(page);
    await page.goto("/system/job/job-schedules", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30000 });

    // The overlay triggers are per-slot buttons siblings of each row's
    // sparkline svg; the aria-label lists every series quantified — zeros
    // included — while an EMPTY bucket's tooltip honestly renders "No runs".
    // Scan rows' slots for the first bucket with a non-zero series.
    const slots = page.locator("table tbody svg[aria-label='sparkline']")
      .locator("xpath=following-sibling::button");
    const labels = await slots.evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label") ?? ""),
    );
    const hit = labels.findIndex((l) => /[1-9]\d* \p{L}/u.test(l));
    test.skip(hit < 0, "no populated sparkline bucket on the page — data precondition unmet");
    const trigger = slots.nth(hit);
    const label = labels[hit];
    await trigger.hover();
    const tooltip = page.locator("[data-tooltip-content]").first();
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    // Header: full date or range — a 4-digit year is present in every
    // bucket_unit variant (day, week range, hour range, month).
    await expect(tooltip).toContainText(/\d{4}/);
    // Series rows: the aria-label flattens "MM-DD: N Label, M Label, …" —
    // each "N Label" entry must render as its own tooltip row.
    const rows = label!.split(":").slice(1).join(":").split(",").map((s) => s.trim()).filter(Boolean);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of rows) await expect(tooltip).toContainText(row);
    // One colored dot per series row.
    await expect.poll(async () => tooltip.locator("svg circle").count()).toBe(rows.length);
  });
});
