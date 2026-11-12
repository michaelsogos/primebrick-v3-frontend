/**
 * rfc-error-extras — pins the RFC 7807 `extra` pipeline on the entity-list
 * error path: a 400 problem-details response on /list must surface an
 * errors-panel card whose "View Details" CTA opens the RFC dialog and
 * renders `extra.issues` as a table (JsonTableViewer), with `detail` on
 * the card and `severity` preserved in the raw view.
 *
 * The regression this guards: ApiListError used to drop `detail`/`extra`
 * on the floor, so the advanced viewer never activated for list failures.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

test.describe("rfc error extras (entity list)", () => {
  test("list 400 surfaces extra.issues in the error detail dialog", async ({ page }) => {
    await loginAsTestAdmin(page);

    await page.route("**/api/v1/entities/customer/list**", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "https://primebrick.io/errors/VALIDATION_ERROR",
          title: "Validation Error",
          status: 400,
          detail:
            'sort_key: Invalid option: expected one of "code"|"display_name"; page_size: Too big: expected number to be <=100',
          instance: "/api/v1/entities/customer/list",
          internal_code: "VALIDATION_ERROR",
          severity: "HIGH",
          extra: {
            issues: [
              {
                path: "sort_key",
                code: "invalid_value",
                message: 'Invalid option: expected one of "code"|"display_name"'
              },
              {
                path: "page_size",
                code: "too_big",
                message: "Too big: expected number to be <=100"
              }
            ]
          }
        })
      })
    );

    await page.goto("/crm/customers", { waitUntil: "domcontentloaded" });

    // The pushed card lives in the errors panel behind the topbar toggle —
    // wait for the reactive "1" badge first (proves the error landed AND
    // the topbar is hydrated enough to handle the open click).
    const errorsToggle = page.getByRole("button", { name: "Errors", exact: true });
    await expect(errorsToggle).toContainText("1", { timeout: 15000 });
    await errorsToggle.click();
    const card = page.locator("text=VALIDATION_ERROR").first();
    await expect(card).toBeVisible({ timeout: 5000 });

    // `extra` present → the card offers the detail viewer CTA.
    await page.getByRole("button", { name: "View Details" }).first().click();

    // Aesthetic mode: JsonTableViewer renders extra.issues rows.
    const dialog = page.getByRole("dialog").last();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("invalid_value")).toBeVisible();
    await expect(dialog.getByText("too_big")).toBeVisible();
    await expect(dialog.getByText("page_size", { exact: true })).toBeVisible();
  });
});
