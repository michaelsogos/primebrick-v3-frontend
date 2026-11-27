/**
 * schedule-spec-input assist popover — the UOM-adorned interval builder.
 *
 * CONTRACT under test (product behavior, not implementation):
 *   - the interval builder is ONE numeric input: the unit of measure lives
 *     inside it as an adornment CTA, not as a separate sacrificed combo
 *   - a static option set ≤5 renders the internal dropdown anchored to the
 *     adornment (no sheet); the m/h/d set renders exactly its 3 options
 *   - picking a unit is keep-number: `5 m` → pick `h` → `5 h`
 *   - apply composes the wire spec (`@every <n><unit>`) into the free-text
 *     field; re-opening the popover seeds the SAME n/unit back (round-trip)
 *   - no unit `s` exists — the recurring floor is one minute
 *
 * Host surface: the job_trigger create form (the widget's only production
 * consumer). The form is never submitted — the widget contract is what's
 * under test.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

test.describe("schedule-spec-input UOM interval builder", () => {
  test("merged qty+uom input: dropdown pick keeps the number, apply composes the spec", async ({
    page,
    context,
  }) => {
    await loginAsTestAdmin(page);

    await page.goto("/system/job/job_triggers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    const [popup] = await Promise.all([
      context.waitForEvent("page", { timeout: 15000 }),
      page.getByTestId("entity-create-cta").click(),
    ]);
    await popup.waitForLoadState("domcontentloaded");
    await expect(popup.getByTestId("entity-form-surface")).toBeVisible({ timeout: 30000 });

    // Open the assist popover on the schedule_spec field.
    const specField = popup.getByTestId("entity-form-field-schedule_spec");
    await specField.getByTestId("schedule-spec-input-assist").click();
    await expect(popup.getByTestId("schedule-spec-input-modes")).toBeVisible();

    // Interval mode: ONE numeric input, unit as internal adornment CTA —
    // no separate combo exists anymore.
    const everyInput = popup.getByTestId("schedule-spec-input-every-n");
    const uomCta = popup.getByTestId("schedule-spec-input-every-n-uom-cta");
    await expect(everyInput).toBeVisible();
    await expect(uomCta).toBeVisible();
    await expect(specField.getByTestId("schedule-spec-input-every-unit")).toHaveCount(0);

    // The dropdown renders the closed m/h/d set — exactly 3 options, no `s`.
    await uomCta.click();
    const dropdown = popup.getByTestId("schedule-spec-input-every-n-uom-dropdown");
    await expect(dropdown).toBeVisible();
    await expect(dropdown.locator("button")).toHaveCount(3);
    await expect(popup.getByTestId("schedule-spec-input-every-n-uom-option-s")).toHaveCount(0);

    // Keep-number pick: 1 h → choose days → the CTA shows `d`, qty stays 1.
    await popup.getByTestId("schedule-spec-input-every-n-uom-option-d").click();
    await expect(dropdown).toBeHidden();
    await expect(uomCta).toContainText("d");

    // Apply composes the wire spec into the free-text field.
    await everyInput.fill("2");
    await popup.getByTestId("schedule-spec-input-apply").click();
    await expect(specField.getByTestId("schedule-spec-input-field")).toHaveValue("@every 2d");

    // Round-trip: re-opening seeds n=2 + unit=d from the composed spec.
    await specField.getByTestId("schedule-spec-input-assist").click();
    await expect(everyInput).toHaveValue("2");
    await expect(uomCta).toContainText("d");
  });
});
