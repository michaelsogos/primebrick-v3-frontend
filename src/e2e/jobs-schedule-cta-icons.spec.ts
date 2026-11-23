import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

import { extJsonParse } from '@primebrick/core/ext-json';
/**
 * /system/job/job-schedules — `:filled` icon qualifier on lifecycle CTAs.
 *
 * The entity_op `cta.icon` carries DynamicIcon's `:filled` name
 * qualifier (`icon:"pause:filled"`/`"play:filled"` on the pause/resume
 * row ops and the pause_all/resume_all bulk ops). The FE strips the
 * qualifier, loads the bare lucide glyph, and renders
 * `fill="currentColor"` with the 2px stroke kept.
 *
 * Asserted end-to-end at two layers:
 *  1. wire — the served meta carries the qualified names verbatim
 *     (a regression to plain "pause"/"play" fails here, not on pixels);
 *  2. DOM — the bulk toolbar renders the synthesized CTAs with the
 *     filled svgs, while `disarm_all` ("power") keeps `fill="none"` as
 *     the negative control: an unqualified name must never fill.
 */

interface CtaRow {
  action_name: string;
  icon?: string;
  color?: string;
}

test.describe("job_schedule lifecycle CTAs — :filled icons", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("meta carries qualified names; bulk toolbar renders filled svgs", async ({
    page,
  }) => {
    await page.goto("/system/job/job-schedules", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("table")).toBeVisible({ timeout: 5_000 });

    // Wire contract — synthesized row/bulk custom actions in served meta.
    const meta = await page.evaluate(async () => {
      const res = await fetch("/svc/job/api/v1/entities/job_schedule/meta");
      const body = await res.text().then((t) => extJsonParse<{ table?: { row_custom_actions?: unknown; bulk_custom_actions?: unknown } }>(t));
      return {
        row: (body.table?.row_custom_actions ?? []) as CtaRow[],
        bulk: (body.table?.bulk_custom_actions ?? []) as CtaRow[],
      };
    });
    expect(meta.row).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action_name: "stop", icon: "square:filled", color: "warning" }),
        expect.objectContaining({ action_name: "pause", icon: "pause:filled", color: "warning" }),
        expect.objectContaining({ action_name: "resume", icon: "play:filled", color: "success" }),
        expect.objectContaining({ action_name: "enable", color: "success" }),
        expect.objectContaining({ action_name: "disable", color: "destructive" }),
      ]),
    );
    // Lifecycle order is declaration order — the soft-delete op must be last
    // (menu order: stop → pause → resume → enable → disable, state-gated).
    const lifecycle = meta.row
      .map((a) => a.action_name)
      .filter((n) => ["stop", "pause", "resume", "enable", "disable"].includes(n));
    expect(lifecycle).toEqual(["stop", "pause", "resume", "enable", "disable"]);
    expect(meta.bulk).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action_name: "pause_all", icon: "pause:filled" }),
        expect.objectContaining({ action_name: "resume_all", icon: "play:filled" }),
        expect.objectContaining({ action_name: "disarm_all", icon: "power" }),
      ]),
    );

    // DOM contract — selecting a row auto-switches the L2 bar to bulk
    // mode (useToolbarMode derives the mode from selection vs filter
    // timestamps; a manual toggle click gets reverted on this page since
    // the Recurring schedule-type filter is applied by default).
    await page.getByRole("checkbox", { name: "select row" }).first().click();
    const toolbar = page.getByTestId("bulk-actions-toolbar");
    await expect(toolbar.locator("svg.lucide-pause")).toBeVisible();
    await expect(toolbar.locator("svg.lucide-pause")).toHaveAttribute("fill", "currentColor");
    await expect(toolbar.locator("svg.lucide-play")).toBeVisible();
    await expect(toolbar.locator("svg.lucide-play")).toHaveAttribute("fill", "currentColor");
    // Negative control — power is unqualified, must stay stroke-only.
    await expect(toolbar.locator("svg.lucide-power")).toHaveAttribute("fill", "none");
    // Icons render at full opacity on every variant — colored or default
    // (the uncolored-CTA `opacity-70` softening was dropped: it read as
    // "washed out" next to opaque severity icons, esp. with :filled glyphs).
    for (const cls of ["lucide-pause", "lucide-play", "lucide-power"]) {
      await expect(toolbar.locator(`svg.${cls}`)).not.toHaveClass(/opacity-70/);
    }
  });

  test("row kebab renders lifecycle ops with :filled svgs", async ({ page }) => {
    await page.goto("/system/job/job-schedules", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("table")).toBeVisible({ timeout: 5_000 });

    // Row kebab — the actions cell is the row's last cell; state decides
    // which lifecycle ops are visible_on-gated in (stop/pause on armed,
    // resume on paused, enable/disable elsewhere).
    const kebab = page.locator("table tbody tr").first().locator("td").last().getByRole("button").first();
    await kebab.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    for (const cls of ["lucide-square", "lucide-pause", "lucide-play"]) {
      const icon = menu.locator(`svg.${cls}`).first();
      if (await icon.count()) {
        await expect(icon).toHaveAttribute("fill", "currentColor");
      }
    }
    // Negative control — enable/disable ("power") must stay stroke-only.
    const power = menu.locator("svg.lucide-power").first();
    if (await power.count()) {
      await expect(power).toHaveAttribute("fill", "none");
    }
  });
});
