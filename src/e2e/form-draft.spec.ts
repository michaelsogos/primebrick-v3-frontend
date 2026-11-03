/**
 * form-draft — the unsaved-edit survival contract every entity form
 * inherits (useFormDraft is wired inside EntityFormPage, zero opt-in).
 *
 * Covers what unit tests cannot reach:
 *   1. typing persists a draft (localStorage, scoped key);
 *   2. browser refresh replays the draft — value back, field tainted,
 *      Save enabled (the restore marks honestly);
 *   3. the Reset button returns CREATE to first-load defaults AND
 *      deletes the draft slot;
 *   4. undoing the edit self-deletes the slot (no ghost drafts).
 *
 * Surface: /system/job/triggers/create — `name` is a plain text input,
 * the cheapest real field. Conventions: e2e-browser-session.md — 5s
 * expectation budget everywhere, no waitForTimeout, dead clicks retried
 * inside polls.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

test.describe.configure({ mode: "serial" });
test.use({ actionTimeout: 5000 });

async function openTriggersCreate(page: Page, context: BrowserContext): Promise<Page> {
  await loginAsTestAdmin(page);
  await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
  await expect(page.locator("table")).toBeVisible();
  await expect(page.locator('a[href^="/system/"]').first()).toBeVisible();
  let popup!: Page;
  await expect(async () => {
    const [p] = await Promise.all([
      context.waitForEvent("page", { timeout: 900 }),
      page.getByTestId("entity-create-cta").click(),
    ]);
    popup = p;
  }).toPass({ timeout: 5000 });
  await popup.waitForLoadState("domcontentloaded", { timeout: 5000 });
  await expect(popup.getByTestId("entity-form-page")).toBeVisible();
  return popup;
}

const draftKeys = (popup: Page) =>
  popup.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("pb:draft:")));

const JOB_BASE = "/svc/job/api/v1/entities";

/**
 * UPDATE mode — the draft is a delta on a LIVE row:
 *   1. editing taints + persists (base_version stamped);
 *   2. a foreign write lands via API (filter changed, version bumped);
 *   3. refresh → the page loads the FRESH row, the draft replays only
 *      its tainted key, and the stale base escalates it to the SAME
 *      conflict surface collab merges use (destructive ring + chip);
 *   4. Reset → the handler REFETCHES the record (no shadow copy) —
 *      name is back to the server value AND `filter` proves the row
 *      is the fresh one, not the in-memory snapshot.
 */
test("detail: stale-base draft becomes a conflict; reset refetches the live row", async ({
  page,
}) => {
  await loginAsTestAdmin(page);
  const name = `e2e-draft-detail-${Date.now()}`;
  const baseEntity = {
    name,
    event_subject: "e2e.draft.fired",
    schedule_spec: "@every 1h",
    target_subject: "emailsender.send",
    execution_context: "user",
    enabled: true,
  };
  const create = await page.request.post(`${JOB_BASE}/job_trigger`, {
    data: { entity: baseEntity },
  });
  expect(create.status()).toBe(201);
  const { uuid } = (await create.json()) as { uuid: string };

  try {
    await page.goto(`/system/job/triggers/${uuid}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-form-page")).toBeVisible();
    const nameField = page.getByTestId("entity-form-field-name");
    const nameInput = nameField.locator("input");
    await expect(nameInput).toHaveValue(name);

    // User edit → tainted + persisted.
    const edited = `${name}-v2`;
    await nameInput.fill(edited);
    await expect
      .poll(async () => (await draftKeys(page)).length, { timeout: 5000 })
      .toBeGreaterThan(0);

    // Foreign write via the API: `schedule_spec` changes, `version`
    // bumps — the stored draft's base_version is now stale.
    const cur = await page.request.get(`${JOB_BASE}/job_trigger/${uuid}`);
    const row = (await cur.json()) as { version: number };
    const put = await page.request.put(`${JOB_BASE}/job_trigger/${uuid}`, {
      data: { entity: { ...baseEntity, schedule_spec: "@every 2h", version: row.version } },
    });
    expect(put.ok()).toBeTruthy();

    // Refresh → fresh row + draft replay: name holds the draft value AND
    // surfaces the stale-base conflict (ring + destructive chip).
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("entity-form-page")).toBeVisible();
    await expect(nameInput).toHaveValue(edited, { timeout: 5000 });
    await expect(nameField).toHaveClass(/ring-destructive/, { timeout: 5000 });
    const chip = page.getByTestId("presence-status-chip");
    await expect(chip).toHaveClass(/text-destructive/, { timeout: 5000 });
    // Untouched field adopted the fresh server value — no stale shadow.
    await expect(
      page.getByTestId("entity-form-field-schedule_spec").locator("input").first(),
    ).toHaveValue("@every 2h");

    // Reset → REFETCHES the live row (GET fired), name back to server
    // truth, conflicts gone, draft slot deleted.
    const refetch = page.waitForResponse(
      (r) => r.url().includes(`/entities/job_trigger/${uuid}`) && r.request().method() === "GET",
      { timeout: 5000 },
    );
    await page.getByTestId("entity-form-reset").click();
    expect((await refetch).status()).toBe(200);
    await expect(nameInput).toHaveValue(name);
    await expect(nameField).not.toHaveClass(/ring-destructive/);
    await expect(page.getByTestId("entity-form-submit")).toBeDisabled();
    await expect.poll(async () => (await draftKeys(page)).length, { timeout: 5000 }).toBe(0);
  } finally {
    const get = await page.request.get(`${JOB_BASE}/job_trigger/${uuid}`);
    if (get.ok()) {
      const row = (await get.json()) as { version: number };
      await page.request.delete(`${JOB_BASE}/job_trigger/${uuid}?version=${row.version}`);
    }
  }
});

test("draft survives refresh; reset returns to defaults and clears the slot", async ({
  page,
  context,
}) => {
  const popup = await openTriggersCreate(page, context);
  const nameInput = popup.getByTestId("entity-form-field-name").locator("input");
  const draftValue = `e2e-draft-${Date.now()}`;

  // Type → the debounced writer persists {data, tainted} under pb:draft:*.
  await nameInput.fill(draftValue);
  await expect
    .poll(async () => (await draftKeys(popup)).length, { timeout: 5000 })
    .toBeGreaterThan(0);

  // Refresh → the restore replays the tainted key onto fresh defaults.
  await popup.reload({ waitUntil: "domcontentloaded" });
  await expect(popup.getByTestId("entity-form-page")).toBeVisible();
  await expect(nameInput).toHaveValue(draftValue);
  // The restored field is honestly tainted — the form reports changes.
  const form = popup.getByTestId("entity-form-page");
  await expect(form).toHaveAttribute("data-has-changes", "true");
  await expect(form).toHaveAttribute("data-tainted", /"name":true/);

  // The restore notice is INFORMATIONAL — `toastImpact:'LOW'` renders the
  // info tone (never a green success for an FYI), the user-facing title
  // carries the toast, and the entity name is a tag badge, not the title.
  const toast = popup.locator("li[data-sonner-toast]", {
    hasText: "Restored from your last session",
  });
  await expect(toast).toBeVisible({ timeout: 5000 });
  await expect(toast).toContainText("Information");
  await expect(toast).toContainText("job_trigger");
  await expect(toast).not.toContainText("Success");

  // Reset → first-load defaults (empty name), slot deleted, Save off.
  await popup.getByTestId("entity-form-reset").click();
  await expect(nameInput).toHaveValue("");
  await expect(popup.getByTestId("entity-form-submit")).toBeDisabled();
  await expect.poll(async () => (await draftKeys(popup)).length, { timeout: 5000 }).toBe(0);

  // Type again, then UNDO it — the pristine form deletes its own slot.
  await nameInput.fill("x");
  await expect
    .poll(async () => (await draftKeys(popup)).length, { timeout: 5000 })
    .toBeGreaterThan(0);
  await nameInput.fill("");
  await expect.poll(async () => (await draftKeys(popup)).length, { timeout: 5000 }).toBe(0);

  await popup.close();
});
