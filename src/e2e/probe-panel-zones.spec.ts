import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

const TRIGGERS = "/system/job/triggers";

test("probe — panel zones: toolbar border + footer anatomy", async ({ page }) => {
  await loginAsTestAdmin(page);
  await page.goto(TRIGGERS, { waitUntil: "domcontentloaded" });
  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Filters", exact: true }).first().click();
  await expect(page.getByTestId("filters-apply")).toBeVisible({ timeout: 15_000 });

  const zones = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="filters-apply"]')?.closest(".flex.h-full.flex-col");
    if (!panel) return null;
    const regions = Array.from(panel.children).map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        cls: el.className.slice(0, 80),
        borderTop: cs.borderTopWidth,
        borderBottom: cs.borderBottomWidth,
        h: Math.round(r.height),
        firstChildTestids: Array.from(el.querySelectorAll("[data-testid]"))
          .slice(0, 4)
          .map((c) => c.getAttribute("data-testid")),
      };
    });
    return regions;
  });
  console.log("[probe] PANEL ZONES (standard tab):");
  console.log(JSON.stringify(zones, null, 1));

  // Standard tab: the field-search SearchInput must live in the toolbar band.
  // Toolbar = the band that contains the mode group (filters-mode-standard).
  const stdTools = await page.evaluate(() => {
    const modeBtn = document.querySelector('[data-testid="filters-mode-standard"]');
    const search = document.querySelector('[data-testid="filters-field-search"]');
    const panel = modeBtn?.closest(".flex.h-full.flex-col");
    if (!panel || !search) return null;
    const scroll = panel.querySelector(".overflow-auto");
    const toolbarEl = Array.from(panel.children).find((c) => c.contains(modeBtn));
    return {
      searchInsideToolbar: toolbarEl ? toolbarEl.contains(search) : null,
      searchInsideScroll: scroll ? scroll.contains(search) : null,
      toolbarBottomBorder: toolbarEl ? getComputedStyle(toolbarEl).borderBottomWidth : null,
    };
  });
  console.log("[probe] STD TOOLS:", JSON.stringify(stdTools));

  // Switch to advanced — where does the AND/OR group sit relative to borders?
  await page.getByTestId("filters-mode-advanced").click();
  await page.waitForTimeout(600);
  const advZones = await page.evaluate(() => {
    const modeBtn = document.querySelector('[data-testid="filters-mode-standard"]');
    const panel = modeBtn?.closest(".flex.h-full.flex-col");
    if (!panel) return null;
    const connector = document.querySelector('[data-testid="filters-connector-and"]');
    const scroll = panel.querySelector(".overflow-auto");
    const toolbarEl = Array.from(panel.children).find((c) => c.contains(modeBtn));
    return {
      connectorInsideScroll: scroll ? scroll.contains(connector) : null,
      connectorInsideToolbar: toolbarEl ? toolbarEl.contains(connector) : null,
      toolbarBottomBorder: toolbarEl ? getComputedStyle(toolbarEl).borderBottomWidth : null,
      connectorTopInBand: connector && toolbarEl
        ? Math.round(connector.getBoundingClientRect().top - toolbarEl.getBoundingClientRect().top)
        : null,
    };
  });
  console.log("[probe] ADVANCED:", JSON.stringify(advZones));

  // Footer anatomy: layout-owned muted strip + SheetPanelFooter + natural-width CTA
  const foot = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="filters-apply"]') as HTMLElement | null;
    if (!btn) return null;
    // walk up: [ml-auto group] → SheetPanelFooter root → layout strip
    const group = btn.parentElement;
    const footer = group?.parentElement;
    const strip = footer?.parentElement;
    if (!group || !footer || !strip) return null;
    const scs = getComputedStyle(strip);
    const fcs = getComputedStyle(footer);
    const gcs = getComputedStyle(group);
    const br = btn.getBoundingClientRect();
    const sr = strip.getBoundingClientRect();
    return {
      stripBorderTop: scs.borderTopWidth,
      stripBg: scs.backgroundColor,
      footerPadding: fcs.padding,
      groupMarginLeft: gcs.marginLeft,
      btnWidth: Math.round(br.width),
      stripWidth: Math.round(sr.width),
      btnRightGap: Math.round(sr.right - br.right),
      btnIsFullWidth: Math.round(br.width) >= Math.round(sr.width) - 30,
      btnHeight: Math.round(br.height),
      btnHasIcon: !!btn.querySelector("svg"),
      btnText: btn.textContent?.trim(),
    };
  });
  console.log("[probe] FOOT:", JSON.stringify(foot, null, 1));

  // (std tool placement was already probed above, before the advanced switch)

  // Screenshots: advanced tab (double-header claim) + panel bottom strip
  const sheet = page.locator("[data-testid='filters-apply']").locator("xpath=ancestor::*[contains(@class,'flex') and contains(@class,'h-full') and contains(@class,'flex-col')][1]");
  await sheet.screenshot({ path: "probe-panel-adv.png" });
  await page.getByTestId("filters-mode-standard").click();
  await page.waitForTimeout(400);
  await sheet.screenshot({ path: "probe-panel-std.png" });
});
