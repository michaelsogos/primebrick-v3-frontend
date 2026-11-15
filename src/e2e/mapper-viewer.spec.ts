/**
 * mapper-viewer — the read-only prose mirror of the payload_map builder.
 *
 * Covers what the form-side spec cannot reach:
 *   1. a `widget:"payload_map"` cell renders the "View map" link (NOT the
 *      generic JSON braces CTA) + a trailing ExternalLink to the record's
 *      kind:"detail" route;
 *   2. the `entity.mapperViewer` sheet renders one PROSE row per authored
 *      DST entry — same [name | kind | source] grid as the builder, no
 *      inputs; `map`/`list`/fallback nest correctly;
 *   3. declared-but-unmapped target fields collapse in the "Unmapped
 *      fields" accordion below the authored rows.
 *
 * Fixture: a trigger declared via the governed API with an authored
 * payload_map (const/path/inject + map + fallback) — deleted at the end.
 *
 * Conventions: e2e-browser-session.md — 5s expectation budget, no
 * waitForTimeout, dead clicks retried inside polls.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";
import { declareTrigger, deleteTrigger } from "./helpers/job-chain";

test.use({ actionTimeout: 5000 });

const MAP = {
  requestId: { kind: "inject", inject: "uuid" },
  templateCode: { kind: "const", value: "e2e_mapper_probe" },
  to: { kind: "list", items: [{ kind: "const", value: "mapper-viewer@example.com" }] },
  variables: {
    kind: "map",
    entries: { customer_name: { kind: "path", path: "$.customer.display_name" } },
  },
  languageIso: {
    kind: "meta",
    meta: "actor_locale",
    fallback: [{ kind: "const", value: "en-US" }],
  },
};

test.describe("mapper viewer", () => {
  test("cell link → prose sheet rows + unmapped accordion + detail CTA", async ({ page }) => {
    await loginAsTestAdmin(page);
    const { uuid } = await declareTrigger(page.request, {
      name: `e2e-mapper-viewer-${Date.now()}`,
      event_subject: "crm.customer_changed",
      target_subject: "emailsender.send",
      run_as: "author",
      payload_map: MAP,
    });

    try {
      await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
      await expect(page.locator("table")).toBeVisible();
      await expect(page.locator('a[href^="/system/"]').first()).toBeVisible();

      // payload_map is default_visible:false — enable it via the picker.
      await page.getByRole("button", { name: "Columns" }).first().click();
      const toggle = page.getByTestId("columns-toggle-payload_map");
      await expect(toggle).toBeVisible();
      if ((await toggle.locator('[data-state="checked"]').count()) === 0) {
        await toggle.click();
      }
      await page.keyboard.press("Escape");

      // Our row carries the unique name — locate the row by text, the
      // mapper affordance lives inside its payload_map cell. (entity-search
      // targets searchable columns only; `name` may not be one.)
      const row = page.locator("table tbody tr", { hasText: "e2e-mapper-viewer-" });
      await expect(row).toHaveCount(1);
      const cell = row.getByTestId("mapper-cell-payload_map-text");
      await expect(cell).toContainText("View map");

      // Trailing CTA → the record's detail route, _blank.
      const ext = row.getByTestId("mapper-cell-payload_map-ext");
      await expect(ext).toHaveAttribute("href", `/system/job/triggers/${uuid}`);

      await cell.click();

      // Authored rows — prose, not inputs: no combobox/input inside rows.
      const rows = page.getByTestId("mapper-viewer-rows");
      await expect(rows).toBeVisible();
      await expect(page.getByTestId("mapper-viewer-row-templateCode")).toContainText("Fixed value");
      await expect(page.getByTestId("mapper-viewer-row-templateCode")).toContainText(
        "e2e_mapper_probe",
      );
      await expect(page.getByTestId("mapper-viewer-row-requestId")).toContainText(
        "Generated at send",
      );
      await expect(page.getByTestId("mapper-viewer-row-variables")).toContainText(
        "Template variables",
      );
      // `map` entries nest as key → prose lines.
      await expect(rows).toContainText("customer_name");
      await expect(rows).toContainText("$.customer.display_name");
      // Fallback clause renders its prose line.
      await expect(page.getByTestId("mapper-viewer-fallback").first()).toContainText(
        "otherwise, if empty",
      );
      // Read-only contract: ZERO interactive controls inside the viewer.
      await expect(rows.locator('[role="combobox"], input, textarea')).toHaveCount(0);

      // Unmapped target fields sit collapsed BELOW the authored rows.
      const unmapped = page.getByTestId("mapper-viewer-unmapped");
      await expect(unmapped).toBeVisible();
      await unmapped.getByRole("button").first().click();
      await expect(unmapped).toContainText("not mapped");
    } finally {
      await deleteTrigger(page.request, uuid).catch(() => {});
    }
  });
});
