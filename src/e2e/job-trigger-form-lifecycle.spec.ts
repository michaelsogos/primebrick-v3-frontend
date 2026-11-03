/**
 * job-rule-form-lifecycle — the EntityFormPage archetype end-to-end.
 *
 * /system/job/triggers/create is declared kind:"create" + entity + page_props.form
 * (NO component_url): the resolver picks the archetype, the host renders the
 * form from served meta.columns + placement.
 *
 * PRODUCT CONTRACT under test (not implementation intent):
 *   - the list's create CTA opens the form in a NEW TAB (navStrategy popup)
 *   - the child page carries the full form anatomy: breadcrumb, tooltip
 *     hints, clear CTA on text inputs, spaced footer actions
 *   - on submit the child broadcasts 'refresh' and CLOSES itself
 *   - the parent list refreshes WITHOUT a reload (BroadcastChannel)
 *   - only the created row is deleted afterwards (DELETE …/:uuid?version=…)
 *
 * The created rule targets `jobs.due.user.e2e.test` — a lane segment that can
 * never collide with a real service action; the row is deleted even on
 * failure (residue-free contract, same as entity-crud-lifecycle).
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

const TS = Date.now();
const RULE_NAME = `e2e-rule-${TS}`;
const JOB_BASE = "/svc/job/api/v1/entities";

// Serial: the delete test consumes `createdUuid` produced by the create
// test — module state only survives within a single worker.
test.describe.configure({ mode: "serial" });

test.describe("job_trigger entity-form archetype lifecycle", () => {
  let createdUuid = "";
  let createdVersion = 0;

  test("create a job_trigger in a child tab → it closes → parent list refreshes", async ({
    page,
    context,
  }) => {
    // Contract: NO dialog may appear during the lifecycle — a confirm()
    // after save means untaint-on-save regressed (the guard must stay, but
    // it must NOT fire on the success path). Collected and asserted below.
    const strayDialogs: string[] = [];
    context.on("page", (p) =>
      p.on("dialog", (d) => {
        strayDialogs.push(`${d.type()}: ${d.message().slice(0, 200)}`);
        void d.accept();
      }),
    );
    await loginAsTestAdmin(page);

    // 1. The create CTA opens the archetype in a NEW TAB (popup contract).
    await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    const [popup] = await Promise.all([
      context.waitForEvent("page", { timeout: 15000 }),
      page.getByTestId("entity-create-cta").click(),
    ]);
    await popup.waitForLoadState("domcontentloaded");
    await expect(popup.getByTestId("entity-form-page")).toBeVisible({ timeout: 30000 });

    // 2. Form anatomy (contract, not implementation):
    //    - module breadcrumb present
    //    - field tooltips (MetaColumn.tooltip → aria-label="Help" trigger)
    //    - clear CTA on the text input once it has a value
    await expect(popup.locator("nav").first()).toBeVisible();
    const nameField = popup.getByTestId("entity-form-field-name");
    const nameInput = nameField.locator("input");
    await nameInput.fill(RULE_NAME);
    await expect(nameField.locator('button[aria-label="Clear"]')).toBeVisible();
    await expect(
      popup.getByTestId("entity-form-field-event_subject").locator('button[aria-label="Help"]'),
    ).toBeVisible();
    await expect(
      popup.getByTestId("entity-form-field-target_subject").locator('button[aria-label="Help"]'),
    ).toBeVisible();

    // event_subject — census-fed ComboSelect, closed to declared emits.
    const eventField = popup.getByTestId("entity-form-field-event_subject");
    await eventField.locator('[role="combobox"]').click();
    const commandInput = popup.locator('[data-slot="command-input"]:visible').last();
    await commandInput.fill("crm.customer_changed");
    await commandInput.press("Enter");
    await popup.keyboard.press("Escape");

    // schedule_spec — ScheduleSpecInput text control (default @every 5m).
    await popup
      .getByTestId("entity-form-field-schedule_spec")
      .locator("input")
      .first()
      .fill("@every 1h");

    // target_subject — closed census combo (allow_create: false): only
    // callables declared via real makeNatsRequestRoute/payload_schema
    // contracts are selectable.
    await popup
      .getByTestId("entity-form-field-target_subject")
      .locator('[role="combobox"]')
      .click();
    await popup
      .locator('[role="option"]:visible')
      .filter({ hasText: "crm.emit_fake_event" })
      .first()
      .click();
    await popup.keyboard.press("Escape");

    // payload_map — the callable contract requires `event` (enum): map it
    // to a fixed value before Save unlocks. The row's kind combo is narrow —
    // click its left edge (center hits the disabled clear button).
    const eventRow = popup.getByTestId("payload-map-row-event");
    await eventRow.locator('[role="combobox"]').first().click({ position: { x: 8, y: 18 } });
    await popup
      .locator('[role="option"]:visible')
      .filter({ hasText: /fixed value|valore fisso|constant|costante/i })
      .first()
      .click();
    await eventRow.locator('[role="combobox"]').nth(1).click({ position: { x: 8, y: 18 } });
    await popup
      .locator('[role="option"]:visible')
      .filter({ hasText: "crm.customer_changed" })
      .first()
      .click();
    await popup.keyboard.press("Escape");

    // execution_context — badge ComboSelect, default.
    // enabled — SwitchField, default true. Both left at defaults.
    await expect(popup.getByTestId("entity-form-submit")).toBeEnabled();

    // 3. Submit → the child broadcasts 'refresh' and CLOSES itself.
    const postCapture = popup.waitForResponse(
      (r) => r.url().includes("/entities/job_trigger") && r.request().method() === "POST",
      { timeout: 15000 },
    );
    await popup.getByTestId("entity-form-submit").click();
    const postRes = await postCapture;
    expect(postRes.status()).toBe(201);
    await popup.waitForEvent("close", { timeout: 15000 });
    expect(popup.isClosed()).toBeTruthy();

    // 4. The parent list refreshes via BroadcastChannel — no reload needed.
    await expect(page.locator("table")).toContainText(RULE_NAME, { timeout: 15000 });

    // 5. No tainted-confirm dialog fired at any point in the lifecycle.
    expect(strayDialogs, "unexpected dialog(s) — untaint-on-save regression?").toEqual([]);

    // Resolve uuid+version over the wire for the delete — list endpoint,
    // filtered by the unique name we just wrote.
    const api = page.request;
    const listRes = await api.get(
      `${JOB_BASE}/job_trigger/list?filters[0][field]=name&filters[0][op]==&filters[0][value]=${encodeURIComponent(RULE_NAME)}`,
    );
    expect(listRes.ok()).toBeTruthy();
    const rows = ((await listRes.json()).rows ?? []) as Array<{ uuid: string; version: number }>;
    expect(rows.length).toBe(1);
    createdUuid = rows[0].uuid;
    createdVersion = rows[0].version;
  });

  test("delete only the created row — residue-free", async ({ page }) => {
    await loginAsTestAdmin(page);
    test.skip(!createdUuid, "no row was created by the previous test");
    const res = await page.request.delete(
      `${JOB_BASE}/job_trigger/${createdUuid}?version=${createdVersion}`,
    );
    expect(res.ok()).toBeTruthy();

    // The row must be gone from the default list (soft-deleted → excluded).
    const check = await page.request.get(
      `${JOB_BASE}/job_trigger/list?filters[0][field]=name&filters[0][op]==&filters[0][value]=${encodeURIComponent(RULE_NAME)}`,
    );
    const rows = ((await check.json()).rows ?? []) as unknown[];
    expect(rows.length).toBe(0);
  });
});

test.describe("schedule_spec assist — choicebox mode cards", () => {
  test("radio cards: select cron → apply writes the canonical string; arrows move+select", async ({
    page,
    context,
  }) => {
    await loginAsTestAdmin(page);
    await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    const [popup] = await Promise.all([
      context.waitForEvent("page", { timeout: 15000 }),
      page.getByTestId("entity-create-cta").click(),
    ]);
    await popup.waitForLoadState("domcontentloaded");
    await expect(popup.getByTestId("entity-form-page")).toBeVisible({ timeout: 30000 });

    // Open the assist popover — the mode picker is a radiogroup of cards.
    const schedField = popup.getByTestId("entity-form-field-schedule_spec");
    await schedField.locator('[data-testid$="-assist"]').click();
    const modes = popup.locator('[role="radiogroup"]:visible');
    await expect(modes).toBeVisible();

    const intervalCard = popup.locator('[data-testid$="-mode-interval"]');
    const onceCard = popup.locator('[data-testid$="-mode-once"]');
    const cronCard = popup.locator('[data-testid$="-mode-cron"]');
    await expect(intervalCard).toHaveAttribute("role", "radio");
    await expect(intervalCard).toHaveAttribute("aria-checked", "true");
    await expect(cronCard).toHaveAttribute("aria-checked", "false");

    // Arrow keys move focus AND selection (radio-group contract).
    await intervalCard.focus();
    await popup.keyboard.press("ArrowDown");
    await expect(onceCard).toHaveAttribute("aria-checked", "true");
    await popup.keyboard.press("ArrowDown");
    await expect(cronCard).toHaveAttribute("aria-checked", "true");

    // Cron mode shows the segmented CronInput — 5 editable columns (the
    // legend IS the layout), field-aware keystroke mask, live description.
    const minuteInput = popup.locator('[data-testid$="-cron-expr-field-minute"]');
    const hourInput = popup.locator('[data-testid$="-cron-expr-field-hour"]');
    const domInput = popup.locator('[data-testid$="-cron-expr-field-day_of_month"]');
    const monthInput = popup.locator('[data-testid$="-cron-expr-field-month"]');
    const dowInput = popup.locator('[data-testid$="-cron-expr-field-weekday"]');
    const applyCta = popup.locator('[data-testid$="-apply"]');
    await expect(minuteInput).toBeVisible();
    await expect(dowInput).toBeVisible();
    // Empty means `*` — a fresh editor is already `* * * * *` and enabled.
    await expect(applyCta).toBeEnabled();

    // Field-aware mask: letters are physically rejected in numeric fields.
    await minuteInput.pressSequentially("DFDF");
    await expect(minuteInput).toHaveValue("");

    // Digits-only vocabulary — names/quartz rejected in EVERY field.
    await monthInput.pressSequentially("JXAN");
    await expect(monthInput).toHaveValue("");
    await domInput.pressSequentially("?LW");
    await expect(domInput).toHaveValue("");

    // The digit mask rejects out-of-range numbers at keystroke: 99 → 9,
    // and a 4-digit run is impossible (599 → 59).
    await hourInput.fill("99");
    await expect(hourInput).toHaveValue("9");

    // Leading zeros are allowed then collapsed on the fly: 00 → 0.
    await domInput.fill("00");
    await expect(domInput).toHaveValue("0");
    await domInput.fill("");

    // UOM abbreviations under the cells + footer keybind legend.
    await expect(popup.locator('[data-testid$="-cron-expr-uom-minute"]')).toHaveText("MIN");
    await expect(popup.locator('[data-testid$="-cron-expr-uom-weekday"]')).toHaveText("DOW");
    await expect(popup.locator("kbd", { hasText: "esc" })).toBeVisible();

    // OTP auto-advance: a full 2-digit run jumps to the next cell by itself.
    await minuteInput.fill("5999");
    await expect(minuteInput).toHaveValue("59");
    await expect(hourInput).toBeFocused();

    // Continuation char in an empty cell bounces back to the nearest
    // non-empty previous field (hour has '9', dom is empty).
    await domInput.press("-");
    await expect(hourInput).toHaveValue("9-");
    await expect(hourInput).toBeFocused();

    // Enter advances to the next cell (like Space).
    await hourInput.press("Enter");
    await expect(domInput).toBeFocused();

    // `/` starts a step on the implied wildcard — /5 → */5, /1 → *.
    await dowInput.fill("/5");
    await expect(dowInput).toHaveValue("*/5");
    await dowInput.fill("/1");
    await expect(dowInput).toHaveValue("*");
    await dowInput.fill("");

    // The legend is off by default — the toggle (second trailing CTA)
    // reveals it, contextual to the ACTIVE cell (dow → 0-7).
    const legendToggle = popup.locator('[data-testid$="-cron-expr-legend-toggle"]');
    await expect(popup.locator('[data-testid$="-cron-expr-legend"]')).toBeHidden();
    await legendToggle.click();
    await expect(popup.locator('[data-testid$="-cron-expr-legend"]')).toBeVisible();
    await expect(popup.locator('[data-testid$="-cron-expr-legend"]')).toContainText("0-7");

    // Example chips inside the legend fill the active cell (dow range ex: 1-5).
    await popup.locator('[data-testid$="-cron-expr-example-1-5"]').click();
    await expect(dowInput).toHaveValue("1-5");
    await dowInput.fill("");
    await legendToggle.click();
    await expect(popup.locator('[data-testid$="-cron-expr-legend"]')).toBeHidden();

    // Space commits and moves focus to the next field.
    await minuteInput.press(" ");
    await expect(hourInput).toBeFocused();

    // A dangling-range draft (`9-`) is invalid — Apply stays gated.
    await expect(applyCta).toBeDisabled();

    // A syntactically invalid token (dangling range) is marked and blocked.
    await hourInput.fill("5-");
    await expect(hourInput).toHaveAttribute("aria-invalid", "true");
    await expect(applyCta).toBeDisabled();

    // Paste fan-out: a full expression pasted into one field fills them all.
    await dowInput.evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", "*/15 9 * 1 1-5");
      el.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    });
    await expect(hourInput).toHaveValue("9");
    await expect(domInput).toHaveValue("*");
    await expect(monthInput).toHaveValue("1");
    await expect(dowInput).toHaveValue("1-5");

    // A complete valid expression produces the live localized description
    // and unlocks Apply.
    await expect(popup.getByText(/every 15 minutes|ogni 15 minuti|chaque 15|jede 15|cada 15|alle 15/i)).toBeVisible();
    await expect(applyCta).toBeEnabled();

    // Apply writes the canonical string into the SAME text field (single
    // source of truth).
    await applyCta.click();
    await expect(schedField.locator("input").first()).toHaveValue("*/15 9 * 1 1-5");

    // The interpreter strip confirms the applied spec.
    await expect(popup.locator('[data-testid$="-interpreter"]')).toBeVisible();

    await popup.close();
  });

  test("once mode: date wheel picker — sliding tab pill translates on tab switch", async ({
    page,
    context,
  }) => {
    await loginAsTestAdmin(page);
    await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    const [popup] = await Promise.all([
      context.waitForEvent("page", { timeout: 15000 }),
      page.getByTestId("entity-create-cta").click(),
    ]);
    await popup.waitForLoadState("domcontentloaded");
    await expect(popup.getByTestId("entity-form-page")).toBeVisible({ timeout: 30000 });

    const schedField = popup.getByTestId("entity-form-field-schedule_spec");
    await schedField.locator('[data-testid$="-assist"]').click();
    await popup.locator('[data-testid$="-mode-once"]').click();

    // Open the canonical DateWheelPicker — single pill element owns the
    // active-tab highlight and translates on switch.
    await popup.locator('[data-testid$="-at-local"]').click();
    const pill = popup.locator('[data-slot="tabs-pill"]:visible');
    await expect(pill).toBeVisible();

    // The footer (keybind legend + CTAs) must fit the popover width AND keep
    // real air between the legend and the buttons.
    const footer = popup.locator('[data-slot="tabs-pill"]:visible').locator(
      'xpath=ancestor::*[contains(@class,"overflow-hidden")][1]'
    ).locator('div.border-t').last();
    const footerFit = await footer.evaluate((el) => {
      const [legend, ctas] = el.children as unknown as HTMLElement[];
      return {
        fits: el.scrollWidth <= el.clientWidth,
        air: ctas.getBoundingClientRect().left - legend.getBoundingClientRect().right,
      };
    });
    expect(footerFit.fits).toBeTruthy();
    expect(footerFit.air).toBeGreaterThanOrEqual(16);

    const before = await pill.getAttribute("style");
    await popup.getByRole("tab", { name: /time|ora/i }).click();
    await expect(pill).not.toHaveAttribute("style", before ?? "", { timeout: 5000 });

    // Keyboard contract: the FIRST arrow from anywhere (e.g. focus still on
    // the DATA/TIME tab) must focus AND roll the first wheel — not navigate
    // among tabs. ↑↓ step the focused wheel, ←→ move between columns (or
    // jump back to wheels), Enter submits, Esc closes.
    const hourWheel = popup
      .locator('[data-slot="wheel-picker"] [data-slot="wheel-picker-group"]')
      .first();
    const firstSel = await hourWheel.evaluate(
      (el) => el.querySelector('[aria-selected="true"]')?.getAttribute("data-value")
    );
    await popup.keyboard.press("ArrowDown");
    await expect(hourWheel).toBeFocused();
    await expect
      .poll(async () =>
        hourWheel.evaluate(
          (el) => el.querySelector('[aria-selected="true"]')?.getAttribute("data-value")
        )
      )
      .not.toBe(firstSel);

    await hourWheel.focus();
    const hourBefore = await hourWheel.evaluate(
      (el) => el.querySelector('[aria-selected="true"]')?.getAttribute("data-value")
    );
    // At range boundaries only the inward direction can move the wheel —
    // pick it dynamically so the test is time-of-day independent.
    await popup.keyboard.press(hourBefore === "23" ? "ArrowUp" : "ArrowDown");
    await expect
      .poll(async () =>
        hourWheel.evaluate(
          (el) => el.querySelector('[aria-selected="true"]')?.getAttribute("data-value")
        )
      )
      .not.toBe(hourBefore);

    // Rapid ↑↓ must keep the wheel grid-aligned — the selected row always
    // lands dead-center inside the selection band (never half-out).
    for (let i = 0; i < 5; i++) await popup.keyboard.press("ArrowDown", { delay: 40 });
    await expect
      .poll(async () => {
        const off = await hourWheel.evaluate((el) => {
          const t = (el.querySelector(".transform-style-3d") as HTMLElement).style.transform;
          const y = Number(t.match(/translate3d\([^,]+,\s*([-\d.]+)px/)?.[1] ?? "NaN");
          return Math.abs(Math.round(y / 32) * 32 - y);
        });
        return off;
      }, { timeout: 3000 })
      .toBe(0);

    // ←/→ inside wheels move between columns; outside they jump back to wheels.
    await popup.keyboard.press("ArrowRight");
    const groups = popup.locator('[data-slot="wheel-picker-group"]');
    await expect(groups.nth(1)).toBeFocused();
    const doneBtn = popup.getByRole("button", { name: /done|fatto/i });
    await doneBtn.focus();
    await popup.keyboard.press("ArrowLeft");
    await expect(groups.first()).toBeFocused();

    // Enter on a wheel submits the dropdown (Done CTA); footer shows the legend.
    await popup.keyboard.press("Enter");
    await expect(popup.locator('[data-slot="wheel-picker"]')).toBeHidden();

    await popup.close();
  });
});
