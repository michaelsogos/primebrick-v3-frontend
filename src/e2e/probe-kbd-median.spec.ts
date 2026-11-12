import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

test("probe — kbd legend median layout", async ({ page }) => {
  await loginAsTestAdmin(page);
  await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("elt-kbd-legend").hover();
  const panel = page.getByTestId("elt-kbd-legend-panel");
  await expect(panel).toBeVisible({ timeout: 8_000 });

  const rows = await panel.evaluate((el) => {
    return Array.from(el.querySelectorAll('[data-slot="keyboard-hints"] > span')).map((row) => {
      const cells = row.children;
      const label = cells[0]?.getBoundingClientRect();
      const chips = cells[1]?.getBoundingClientRect();
      return {
        labelText: cells[0]?.textContent?.trim(),
        labelRight: label ? Math.round(label.right) : 0,
        chipsLeft: chips ? Math.round(chips.left) : 0,
      };
    });
  });
  console.log("[probe] median rows:", JSON.stringify(rows, null, 1));
  await panel.screenshot({ path: "probe-kbd-median.png" });
});
