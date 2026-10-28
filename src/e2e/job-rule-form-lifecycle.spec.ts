/**
 * job-rule-form-lifecycle — the EntityFormPage archetype end-to-end.
 *
 * /system/job/rules/create is declared kind:"create" + entity + page_props.form
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

test.describe("job_rule entity-form archetype lifecycle", () => {
  let createdUuid = "";
  let createdVersion = 0;

  test("create a job_rule in a child tab → it closes → parent list refreshes", async ({
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
    await page.goto("/system/job/rules", { waitUntil: "domcontentloaded" });
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

    // event_subject — census-fed ComboSelect (detailed options: description +
    // raw subject) with free entry for undeclared subjects.
    const eventField = popup.getByTestId("entity-form-field-event_subject");
    await eventField.locator('[role="combobox"]').click();
    const commandInput = popup.locator('[data-slot="command-input"]:visible').last();
    await commandInput.fill("e2e.event.fired");
    await commandInput.press("Enter");
    await popup.keyboard.press("Escape");

    // schedule_spec — ScheduleSpecInput text control (default @every 5m).
    await popup
      .getByTestId("entity-form-field-schedule_spec")
      .locator("input")
      .first()
      .fill("@every 1h");

    // target_subject — must match jobs.due.<lane>.* with lane=user.
    await popup
      .getByTestId("entity-form-field-target_subject")
      .locator("input")
      .fill("jobs.due.user.e2e.test");

    // source_subject — readonly selector (fire-time source is disabled
    // pending the workflow engine): the combobox renders but is
    // non-interactive (aria-disabled, tabindex -1, popover cannot open).
    const sourceField = popup.getByTestId("entity-form-field-source_subject");
    const sourceCombo = sourceField.locator('[role="combobox"]');
    await expect(sourceCombo).toHaveAttribute("aria-disabled", "true");
    await sourceCombo.click({ force: true });
    await expect(popup.locator('[data-slot="command-input"]:visible')).toHaveCount(0);

    // execution_context — badge ComboSelect, default "user".
    // enabled — Switch, default true. Both left at defaults.

    // 3. Submit → the child broadcasts 'refresh' and CLOSES itself.
    const postCapture = popup.waitForResponse(
      (r) => r.url().includes("/entities/job_rule") && r.request().method() === "POST",
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
      `${JOB_BASE}/job_rule/list?filters[0][field]=name&filters[0][op]==&filters[0][value]=${encodeURIComponent(RULE_NAME)}`,
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
      `${JOB_BASE}/job_rule/${createdUuid}?version=${createdVersion}`,
    );
    expect(res.ok()).toBeTruthy();

    // The row must be gone from the default list (soft-deleted → excluded).
    const check = await page.request.get(
      `${JOB_BASE}/job_rule/list?filters[0][field]=name&filters[0][op]==&filters[0][value]=${encodeURIComponent(RULE_NAME)}`,
    );
    const rows = ((await check.json()).rows ?? []) as unknown[];
    expect(rows.length).toBe(0);
  });
});
