import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/**
 * entity-list-table interaction spot-checks — the table pipeline was the
 * largest surface re-typed in the `no-explicit-any` cleanup (prop contracts
 * across TableHeader/HeaderRow/TableRow/TableBody/CardView/TableView plus
 * the previewPanel/sticky/rowRangeSelection composables). These specs prove
 * the interactions the types now describe still behave end-to-end.
 *
 * Product contract under test (not implementation):
 *   - sortable header click → a fresh /list request carries sort_key+sort_dir
 *   - select-all checkbox → every rendered row flips data-state="selected"
 *   - row dblclick → the preview panel opens AND exactly one row carries
 *     data-focused-row-index — the focusedRowIndex wiring was a latent bug
 *     an `as any` cast hid (TableBody never passed it to TableRow), so this
 *     attribute could never render before the cleanup fixed it
 *
 * Surface: /system/job/job-schedules — host-rendered standard list
 * archetype, guaranteed populated (the job module registers schedules at
 * boot; jobs-pages' sparkline spec depends on the same fact).
 */

const SCHEDULES = "/system/job/job-schedules";
const LIST_URL = "/job_schedule/list";

test.describe("entity-list-table interactions", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("sortable header click re-fetches with sort_key/sort_dir", async ({ page }) => {
    const listUrls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes(LIST_URL)) listUrls.push(req.url());
    });
    await page.goto(SCHEDULES, { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30000 });
    listUrls.length = 0;

    // Only sortable columns get the cursor-pointer header class.
    const sortableHead = page.locator("table thead th.cursor-pointer").first();
    await sortableHead.click();

    // A click on a sortable column triggers a re-fetch carrying both params.
    await expect
      .poll(() => listUrls.some((u) => u.includes("sort_key=") && u.includes("sort_dir=")))
      .toBe(true);
  });

  test("select-all checkbox marks every rendered row selected", async ({ page }) => {
    await page.goto(SCHEDULES, { waitUntil: "domcontentloaded" });
    // Wait for data-row-index rows specifically — bare `tbody tr` resolves on
    // skeleton rows that render before meta/selection state lands.
    const rows = page.locator("table tbody tr[data-row-index]");
    await expect(rows.first()).toBeVisible({ timeout: 30000 });
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // bits-ui Checkbox renders a button[role=checkbox]; the head cell holds
    // the page-scope select-all.
    await page.locator("table thead [role='checkbox']").first().click();

    for (const row of await rows.all()) {
      await expect(row).toHaveAttribute("data-state", "selected");
    }
  });

  test("row dblclick opens the preview panel and focuses exactly that row", async ({ page }) => {
    await page.goto(SCHEDULES, { waitUntil: "domcontentloaded" });
    const firstRow = page.locator("table tbody tr[data-row-index]").first();
    await expect(firstRow).toBeVisible({ timeout: 30000 });
    const idx = await firstRow.getAttribute("data-row-index");

    await firstRow.dblclick();

    // The preview region splits — and exactly ONE row gets the focus marker.
    // Both come from the same previewPanel.state.focusedRowIndex wiring.
    await expect(page.locator("tr[data-focused-row-index]")).toHaveCount(1);
    await expect(page.locator("tr[data-focused-row-index]")).toHaveAttribute(
      "data-focused-row-index",
      idx ?? "",
    );
  });

  /**
   * Keyboard-focus row frame — the product contract, not the implementation:
   *   1. First load shows NO focused row — the cursor is born on the first
   *      ArrowUp/ArrowDown, not at render (focusedRowIndex starts null).
   *   2. ArrowDown paints ONE `elt-row-focus-frame` that geometrically covers
   *      EXACTLY the focused row — rect equality is the proof. Whatever paints
   *      the frame (border, overlay, sibling layer) is implementation; if it
   *      anchors to the wrong containing block and bleeds over the viewport,
   *      this assertion fails.
   *   3. The frame is decorative: gradient ring (transparent border +
   *      gradient background-image), rounded corners, pointer-events none —
   *      it must never intercept row interaction.
   *   4. Zero layout shift — every row height identical before focus, after
   *      focus, and after the frame moves (the old border-2 toggle shifted
   *      rows +4px — the "flick").
   *   5. ArrowDown/ArrowUp move the cursor between adjacent rows; the frame
   *      follows and keeps covering the focused row exactly.
   */
  test("arrow keys paint a gradient rounded focus frame on exactly the focused row", async ({ page }) => {
    const expectFrameCoversRow = async (index: string) => {
      const focusedRow = page.locator(`tr[data-focused-row-index="${index}"]`);
      await expect(focusedRow).toHaveCount(1);
      const frame = page.getByTestId("elt-row-focus-frame");
      await expect(frame).toHaveCount(1);
      const [rowRect, frameRect, contRect] = await Promise.all([
        focusedRow.evaluate((el) => el.getBoundingClientRect().toJSON()),
        frame.evaluate((el) => el.getBoundingClientRect().toJSON()),
        frame.evaluate((el) => el.parentElement!.getBoundingClientRect().toJSON()),
      ]);
      // The frame hugs the row's VISIBLE segment: row ∩ scroll container —
      // its right rounded edge always lands on the sticky actions column,
      // not on the row's off-screen end.
      const expected = {
        x: Math.max(rowRect.x, contRect.x),
        y: rowRect.y,
        width:
          Math.min(rowRect.x + rowRect.width, contRect.x + contRect.width) -
          Math.max(rowRect.x, contRect.x),
        height: rowRect.height,
      };
      for (const k of ["x", "y", "width", "height"] as const) {
        // ±1px — sub-pixel table layout can fraction a half-pixel off.
        expect(Math.abs(frameRect[k] - expected[k]), `frame.${k} ≈ visibleRow.${k}`).toBeLessThanOrEqual(1);
      }
      return frame;
    };

    await page.goto(SCHEDULES, { waitUntil: "domcontentloaded" });
    const rows = page.locator("table tbody tr[data-row-index]");
    await expect(rows.first()).toBeVisible({ timeout: 30000 });

    // ── 1. No focus, no frame on first load.
    await expect(page.locator("tr[data-focused-row-index]")).toHaveCount(0);
    await expect(page.getByTestId("elt-row-focus-frame")).toHaveCount(0);

    const heightsBefore = await rows.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height * 100) / 100),
    );

    // ── 2. ArrowDown → cursor born on row 0, frame covers it exactly.
    await page.locator("body").click(); // keys go to the page, not an input
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("tr[data-focused-row-index]")).toHaveAttribute(
      "data-focused-row-index",
      "0",
    );
    const frame = await expectFrameCoversRow("0");

    // ── 3. Decorative contract on computed style.
    const style = await frame.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        backgroundImage: cs.backgroundImage,
        borderRadius: cs.borderRadius,
        borderColor: cs.borderTopColor,
        pointerEvents: cs.pointerEvents,
        maskImage: cs.maskImage || (cs as unknown as Record<string, string>).webkitMaskImage,
        maskComposite: cs.maskComposite || (cs as unknown as Record<string, string>).webkitMaskComposite,
      };
    });
    expect(style.backgroundImage).toContain("linear-gradient");
    expect(parseFloat(style.borderRadius)).toBeGreaterThan(0);
    expect(style.borderColor).toMatch(/rgba?\(0, 0, 0, 0\)|transparent/);
    expect(style.pointerEvents).toBe("none");
    // RING, not band — the mask-composite xor keeps only the border ring and
    // leaves the interior transparent; without it the gradient paints a solid
    // band that hides the whole row (verified visually — a solid frame is a
    // hard regression, never acceptable).
    expect(style.maskImage).not.toBe("none");
    expect(style.maskComposite).toMatch(/exclude|xor/);

    // Click-through INSIDE the frame's visible area: the element under the
    // point must be part of the focused row itself, never the frame — the
    // overlay is decorative paint, it cannot shield the row. The row is wider
    // than the scroll container (horizontal scroll), so sample the center of
    // row ∩ container ∩ viewport — the center of what the user actually sees.
    const hit = await frame.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cr = el.parentElement!.getBoundingClientRect(); // table scroll container
      const left = Math.max(r.x, cr.x) + 8;
      const right = Math.min(r.x + r.width, cr.x + cr.width, window.innerWidth) - 8;
      const hit = document.elementFromPoint((left + right) / 2, r.y + r.height / 2);
      const row = el.ownerDocument.querySelector("tr[data-focused-row-index]");
      return {
        insideRow: hit ? !!row?.contains(hit) : false,
        isFrame: hit === el,
        tag: hit?.tagName ?? "null",
        cls: typeof hit?.className === "string" ? hit.className.slice(0, 80) : "",
      };
    });
    expect(hit.insideRow, `elementFromPoint visible-center → ${hit.tag}.${hit.cls}`).toBe(true);
    expect(hit.isFrame).toBe(false);

    // ── 4. No row moved a pixel when the frame appeared.
    const heightsAfterFocus = await rows.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height * 100) / 100),
    );
    expect(heightsAfterFocus).toEqual(heightsBefore);

    // ── 5. Cursor moves — the frame follows and stays exact.
    await page.keyboard.press("ArrowDown");
    await expectFrameCoversRow("1");
    await page.keyboard.press("ArrowUp");
    await expectFrameCoversRow("0");
    const heightsAfterMove = await rows.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height * 100) / 100),
    );
    expect(heightsAfterMove).toEqual(heightsBefore);
    await expect(page.getByTestId("elt-row-focus-frame")).toHaveCount(1);

    // ── 6. Horizontal scroll — the frame tracks the VIEWPORT, not the row's
    //    off-screen extent: its right edge stays glued to the scroll
    //    container's right edge (where the sticky actions column lives).
    const container = page.locator("[data-slot='table-container']").first();
    const canScroll = await container.evaluate((el) => el.scrollWidth > el.clientWidth + 4);
    if (canScroll) {
      await container.evaluate((el) => {
        el.scrollLeft = 240;
        el.dispatchEvent(new Event("scroll", { bubbles: false }));
      });
      const frame2 = page.getByTestId("elt-row-focus-frame");
      await expect
        .poll(async () => {
          const f = await frame2.evaluate((el) => el.getBoundingClientRect().toJSON());
          const c = await frame2.evaluate((el) => el.parentElement!.getBoundingClientRect().toJSON());
          return Math.abs(f.x + f.width - (c.x + c.width));
        })
        .toBeLessThanOrEqual(1);
      // And still covering the focused row vertically.
      const [rowRect, f2] = await Promise.all([
        page
          .locator("tr[data-focused-row-index]")
          .evaluate((el) => el.getBoundingClientRect().toJSON()),
        frame2.evaluate((el) => el.getBoundingClientRect().toJSON()),
      ]);
      expect(Math.abs(f2.y - rowRect.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(f2.height - rowRect.height)).toBeLessThanOrEqual(1);
    }
  });

  /**
   * Footer keyboard legend — must document the REAL bindings, nothing else.
   * ↑↓ move the row cursor, Space selects, Enter opens the row menu, ←→ scroll
   * horizontally (they navigate preview records only while the panel is
   * open), esc closes; Pag.↑/Pag.↓ and Home/End page. Chips are
   * language-neutral text → assert them directly; a legend advertising a
   * binding that does not exist is a contract bug.
   */
  test("footer keyboard legend advertises the real bindings", async ({ page }) => {
    // The legend lives in a popover: a compact centered trigger toggles the
    // panel listing every hint. Works at any footer width — the trigger is
    // small enough to fit between the left range zone and the pager.
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto(SCHEDULES, { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr[data-row-index]").first()).toBeVisible({ timeout: 30000 });
    const trigger = page.getByTestId("elt-kbd-legend");
    await expect(trigger).toBeVisible();
    // The trigger itself is icon + translated label, no raw key.
    const triggerText = await trigger.innerText();
    expect(triggerText.trim().length).toBeGreaterThan(0);
    expect(triggerText).not.toContain("system.entities.list");

    await trigger.hover();
    const panel = page.getByTestId("elt-kbd-legend-panel");
    await expect(panel).toBeVisible({ timeout: 5000 });
    const text = await panel.innerText();
    for (const chip of ["↑", "↓", "←", "→", "Enter", "Esc", "Pag.", "Home", "End", "↖", "↘"]) {
      expect(text, `legend shows ${chip}`).toContain(chip);
    }
    // Pag. chips come in a pair (up + down).
    expect((text.match(/Pag\./g) ?? []).length, "Pag. ↑ and Pag. ↓").toBe(2);
    // The four arrows render as ONE hint group under "Move selector" —
    // nothing but whitespace and glyphs may sit between ↓ and →.
    const iDown = text.indexOf("↓");
    const iRight = text.indexOf("→");
    expect(
      text.slice(iDown + 1, iRight).replace(/[\s←]/g, ""),
      "arrows merged — no label between ↓ and →",
    ).toBe("");
    expect(text.indexOf("→"), "arrow group before Space").toBeLessThan(text.indexOf("Space"));
    // A missing translation renders the raw i18n key — none may leak.
    expect(text).not.toContain("keys.");
    expect(text).not.toContain("system.entities.list");

    // Close by moving the pointer away, then the width contract: the
    // compact trigger is visible at 1280 where the old inline legend was
    // collision-hidden, while the Toolbar guard still hides it when even
    // the trigger cannot fit.
    await page.locator("h1").first().hover();
    await expect(panel).toBeHidden({ timeout: 5000 });
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(trigger).toBeVisible({ timeout: 5000 });
    await trigger.hover();
    await expect(panel).toBeVisible({ timeout: 5000 });
    await page.locator("h1").first().hover();
    await page.setViewportSize({ width: 1100, height: 800 });
    await expect(trigger).toBeHidden({ timeout: 5000 });
  });

  /**
   * Pager keys — PgDn/PgUp act like the single-arrow footer buttons,
   * Home/End like the double-arrow ones. The pagination status line is the
   * observable contract; the smallest page size is selected first so the
   * list is guaranteed multi-page on real data.
   */
  test("pager keys navigate pages like the footer buttons", async ({ page }) => {
    // job_runs is the densest ELT list — hundreds of rows, always multi-page.
    await page.goto("/system/job/runs", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr[data-row-index]").first()).toBeVisible({ timeout: 30000 });

    const status = page.getByTestId("elt-pagination-status");
    const readPager = async () => {
      const digits = (await status.innerText()).match(/\d+/g)?.map(Number) ?? [];
      return { page: digits[0] ?? 0, total: digits[1] ?? 0 };
    };
    const expectPage = (n: number) =>
      expect.poll(async () => (await readPager()).page, { timeout: 5000 }).toBe(n);

    const { total } = await readPager();
    expect(total, "runs list must span multiple pages for pager keys").toBeGreaterThan(1);

    await page.keyboard.press("End");
    await expectPage(total);
    await page.keyboard.press("Home");
    await expectPage(1);
    await page.keyboard.press("PageDown");
    await expectPage(2);
    await page.keyboard.press("PageUp");
    await expectPage(1);
  });

  /**
   * Insert = the toolbar NEW CTA — the same handler, whatever it does
   * (sheet, goto, popup). The triggers list is the NEW-TAB archetype:
   * pressing Ins must open /system/job/triggers/create in a new tab.
   * The legend mirrors the CTA by showing the Ins hint only when a
   * create action exists.
   */
  test("Insert key fires the toolbar NEW CTA", async ({ page, context }) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr[data-row-index]").first()).toBeVisible({ timeout: 30000 });

    const legend = page.getByTestId("elt-kbd-legend");
    await expect(legend).toBeVisible();
    await legend.hover();
    const legendPanel = page.getByTestId("elt-kbd-legend-panel");
    await expect(legendPanel).toBeVisible({ timeout: 5000 });
    expect(await legendPanel.innerText()).toContain("Ins");
    await page.keyboard.press("Escape");

    const popup = context.waitForEvent("page", { timeout: 5000 });
    await page.keyboard.press("Insert");
    const tab = await popup;
    await expect(tab).toHaveURL(/\/system\/job\/triggers\/create/, { timeout: 5000 });
    await tab.close();
  });
});
