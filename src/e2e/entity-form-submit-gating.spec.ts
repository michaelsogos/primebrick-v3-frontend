/**
 * entity-form-submit-gating — the dynamic form's Save button contract.
 *
 * /system/job/triggers/create renders the EntityFormPage archetype. The
 * footer submit must follow `useFormGuard.canSave`:
 *   - untouched form        → disabled (not tainted)
 *   - tainted but invalid   → disabled (required fields / cross-field rules)
 *   - tainted and valid     → enabled
 *
 * Exercises the full chain: field validation, job_trigger_shape, the
 * payload_map_conformance cross-field validator (crm.emit_fake_event
 * requires `event` in its payload contract — it must be mapped before
 * Save unlocks), and finally a real POST + delete for residue-free data.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

const TS = Date.now();
const RULE_NAME = `e2e-gate-${TS}`;
const JOB_BASE = "/svc/job/api/v1/entities";

test.describe.configure({ mode: "serial" });

test.describe("entity-form submit gating", () => {
  let createdUuid = "";
  let createdVersion = 0;

  test("Save unlocks only when the form is tainted AND valid", async ({ page, context }) => {
    // The popup cold-mounts the remote form chunk — under parallel load the
    // 30s element wait alone can outlast the default 30s test budget.
    test.setTimeout(120_000);
    await loginAsTestAdmin(page);
    await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    const [popup] = await Promise.all([
      context.waitForEvent("page", { timeout: 15000 }),
      page.getByTestId("entity-create-cta").click(),
    ]);
    await popup.waitForLoadState("domcontentloaded");
    await expect(popup.getByTestId("entity-form-page")).toBeVisible({ timeout: 30000 });
    const submit = popup.getByTestId("entity-form-submit");

    // 1. Untouched → disabled (no taint yet, regardless of validity).
    await expect(submit).toBeDisabled();

    // 2. Only `name` filled → tainted but invalid (no event/schedule, no
    //    target_subject) → still disabled.
    await popup.getByTestId("entity-form-field-name").locator("input").fill(RULE_NAME);
    await expect(submit).toBeDisabled();

    // 3. event_subject — free entry in the census combo.
    const eventField = popup.getByTestId("entity-form-field-event_subject");
    await eventField.locator('[role="combobox"]').click();
    const commandInput = popup.locator('[data-slot="command-input"]:visible').last();
    await commandInput.fill("e2e.event.fired");
    await commandInput.press("Enter");
    await popup.keyboard.press("Escape");
    // target_subject still empty → disabled.
    await expect(submit).toBeDisabled();

    // 4. target_subject — closed census combo (allow_create: false).
    const targetField = popup.getByTestId("entity-form-field-target_subject");
    await targetField.locator('[role="combobox"]').click();
    await popup
      .locator('[role="option"]:visible')
      .filter({ hasText: "crm.emit_fake_event" })
      .first()
      .click();
    await popup.keyboard.press("Escape");
    // Callable requires `event` in its payload contract and the map is
    // still empty → payload_map_conformance error → disabled.
    await expect(submit).toBeDisabled();

    // 5. Map `event` → const → the enum value combo offers the declared
    //    vocabulary; pick the canonical subject. The row's kind combo is
    //    narrow — click its left edge so the pointer lands on the trigger,
    //    not on the trailing (disabled) clear button that swallows center
    //    clicks.
    const row = popup.getByTestId("payload-map-row-event");
    await row.locator('[role="combobox"]').first().click({ position: { x: 8, y: 18 } });
    await popup
      .locator('[role="option"]:visible')
      .filter({ hasText: /fixed value|valore fisso|constant|costante/i })
      .first()
      .click();
    await row.locator('[role="combobox"]').nth(1).click({ position: { x: 8, y: 18 } });
    await popup
      .locator('[role="option"]:visible')
      .filter({ hasText: "crm.customer_changed" })
      .first()
      .click();
    await popup.keyboard.press("Escape");

    // 6. Every required input satisfied → tainted AND valid → enabled.
    await expect(submit).toBeEnabled();

    const postCapture = popup.waitForResponse(
      (r) => r.url().includes("/entities/job_trigger") && r.request().method() === "POST",
      { timeout: 15000 },
    );
    await submit.click();
    const postRes = await postCapture;
    if (postRes.status() !== 201) {
      console.log("POST BODY:", postRes.request().postData()?.slice(0, 2000));
      console.log("POST RES:", (await postRes.text()).slice(0, 2000));
    }
    expect(postRes.status()).toBe(201);
    await popup.waitForEvent("close", { timeout: 15000 });
    expect(popup.isClosed()).toBeTruthy();

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
  });
});
