import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/**
 * ref-cell-sheet — the DECIDED `type:"ref"` "link" anatomy (POC: audit
 * `*_by` actor columns → `user_profile`, inherited by every entity via
 * `@Ref` on the Auditable/Deletable mixins).
 *
 * Contract under test (product, not implementation):
 *   - the cell is medium-weight TEXT (underline on hover only) — NOT a badge
 *   - TEXT click opens the `entity.record` sheet — the record rendered
 *     through the SHARED form builder (EntityFormField + dispatcher):
 *     every control is the canonical form widget, readonly/disabled —
 *     `type:"color"` proves it via the ColorSelector, not a text input
 *   - a trailing ExternalLink CTA is revealed on row/card hover — computed
 *     opacity asserted, not just DOM presence — and opens the target's
 *     census-resolved `/list` pre-filtered in a NEW TAB
 *   - unresolved actors display the raw stored value (uuid / "system") and
 *     the sheet shows the honest not-found state
 *   - null refs have NO affordances
 *   - table and card views share the renderer
 *   - sheet chrome: uid is a BADGE on top, `column.audited` fields sit in
 *     a bottom audit section (divider + TableCell value formatting — no
 *     form widgets by construction), `version` is a footer badge that
 *     opens `entity.versionHistory` STACKED (record slides left, history
 *     right; closing history slides the record back)
 *   - every test fails on any pageerror or 5xx entity API response
 *
 * Surface: /crm/customers — real entity list. Row/actor resolution is
 * chosen empirically from the intercepted list response (DOM text alone
 * can't tell resolved names from raw fallbacks).
 */
const CUSTOMERS = "/crm/customers";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ListRow = {
  created_by: string | null;
  created_by_name: string | null;
  deleted_by: string | null;
  [k: string]: unknown;
};

let listRows: ListRow[] = [];
let guardErrors: string[] = [];

test.describe("ref cell — link anatomy + entity.record sheet", () => {
  test.beforeEach(async ({ page }) => {
    listRows = [];
    guardErrors = [];
    // Guard rails: render crashes and server errors must fail the test —
    // collected here, asserted in afterEach (throwing inside event
    // handlers does not reliably fail a Playwright test).
    page.on("pageerror", (e) => {
      guardErrors.push(`pageerror: ${e.message}`);
    });
    page.on("response", (res) => {
      const url = res.url();
      if (/\/entities\/customer\/list/.test(url)) {
        void res
          .json()
          .then((j) => {
            if (Array.isArray(j?.rows)) listRows = j.rows as ListRow[];
          })
          .catch(() => {});
      }
      if (/\/api\/v1\/entities\//.test(url) && res.status() >= 500) {
        guardErrors.push(`entity API ${res.status()} on ${url.slice(-80)}`);
      }
    });

    await loginAsTestAdmin(page);
    await page.goto(CUSTOMERS, { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30000 });
    await expect.poll(() => listRows.length, { timeout: 15000 }).toBeGreaterThan(0);

    // Enable all three audit actor columns via the column picker.
    await page.getByRole("button", { name: "Columns" }).click();
    for (const key of ["created_by", "updated_by", "deleted_by"]) {
      const toggle = page.getByTestId(`columns-toggle-${key}`);
      await expect(toggle).toBeVisible({ timeout: 15000 });
      await toggle.click();
    }
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("ref-cell-created_by-text").first()).toBeVisible({
      timeout: 15000,
    });
  });

  test.afterEach(() => {
    expect(guardErrors, "pageerror / entity-API 5xx during the test").toEqual([]);
  });

  /** Index of the first row whose actor resolved to a display name
   *  (`*_name` ≠ raw value → the join matched a live user_profile). */
  const resolvedIndex = () =>
    listRows.findIndex(
      (r) =>
        r.created_by != null &&
        r.created_by_name != null &&
        r.created_by_name !== r.created_by,
    );

  /** Index of the first row whose actor is unresolved (raw value served
   *  back — destroyed uuid or non-uuid actors like "system"). */
  const unresolvedIndex = () =>
    listRows.findIndex(
      (r) =>
        r.created_by != null &&
        (r.created_by_name === r.created_by || r.created_by_name == null),
    );

  test("ref cell is text anatomy — font-medium, not a badge", async ({ page }) => {
    const cell = page.getByTestId("ref-cell-created_by-text").first();
    await expect(cell).toHaveClass(/font-medium/);
    await expect(cell.locator("..")).not.toHaveClass(/badge/);
  });

  test("external-link affordance is hidden at rest, revealed on row hover", async ({
    page,
  }) => {
    const ext = page.getByTestId("ref-cell-created_by-ext").first();
    // Hidden at rest — computed style, not DOM presence.
    await expect(ext).toHaveCSS("opacity", "0");
    await page.locator("table tbody tr").first().hover();
    await expect(ext).toHaveCSS("opacity", "1", { timeout: 3000 });
  });

  test("text click opens the entity.record sheet with the live record — display-only widgets", async ({
    page,
  }) => {
    const i = resolvedIndex();
    test.skip(i < 0, "no row with a resolved actor on this page");
    const name = listRows[i].created_by_name!;
    await page.getByTestId("ref-cell-created_by-text").nth(i).click();

    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 15000 });
    await expect(sheet).toContainText(name, { timeout: 15000 });
    await expect(sheet).not.toContainText("Record not found");
    // FORM-READONLY contract: the record renders as the entity's form
    // widgets — every control present but readonly/disabled (the pencil
    // toggle will later flip them to edit).
    const editable = sheet.locator(
      "input:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled]), select:not([disabled])",
    );
    await expect(editable).toHaveCount(0);
    await expect(sheet.locator("input, textarea").first()).toBeVisible();
  });

  test("sheet chrome — uid badge top, audit section bottom, labels resolved (no raw keys)", async ({
    page,
  }) => {
    const i = resolvedIndex();
    test.skip(i < 0, "no row with a resolved actor on this page");
    await page.getByTestId("ref-cell-created_by-text").nth(i).click();

    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 15000 });
    await expect(sheet).not.toContainText("Record not found", { timeout: 15000 });

    // uid → badge at the very top of the record surface (mono text, the
    // uuid itself), never a form field.
    const badge = page.getByTestId("entity-record-sheet-uid-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute("title", UUID_RE);
    await expect(sheet.locator("input#record-sheet-field-uuid")).toHaveCount(0);

    // No raw i18n keys anywhere — every label resolved through the dict.
    await expect(sheet).not.toContainText(/system\.entities\./);
    await expect(sheet).not.toContainText(/\.fields\./);
    // The newly-declared internal flags render with translated labels.
    await expect(sheet).toContainText("Onboarding Completed");
    await expect(sheet).toContainText("Auth Method Enforcer Dismissed");

    // Audit section: last block, divider above, labels translated,
    // values rendered as TableCell formatting — ZERO form controls by
    // construction (EntityFormField throws on audited columns).
    const audit = sheet.getByTestId("entity-record-sheet-audit-section");
    await expect(audit).toBeVisible();
    await expect(audit).toContainText("Created");
    await expect(
      audit.locator("input, textarea, select, [role='switch'], [role='combobox']"),
    ).toHaveCount(0);
    // It is the LAST section — nothing meaningful follows it.
    await expect(audit.locator("xpath=following-sibling::*[not(self::script)]")).toHaveCount(0);
  });

  test("version badge opens entity.versionHistory stacked — record slides left, close restores it", async ({
    page,
  }) => {
    const i = resolvedIndex();
    test.skip(i < 0, "no row with a resolved actor on this page");
    await page.getByTestId("ref-cell-created_by-text").nth(i).click();

    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 15000 });
    await expect(sheet).not.toContainText("Record not found", { timeout: 15000 });

    const badge = page.getByTestId("entity-record-sheet-version-badge");
    await expect(badge).toBeVisible();
    await badge.click();

    // Two panes: the record sheet slides left, version history takes the
    // right slot.
    const secondary = page.getByTestId("sheet-secondary-pane");
    const primary = page.getByTestId("sheet-primary-pane");
    await expect(secondary).toBeVisible({ timeout: 15000 });
    await expect(primary).toBeVisible();
    await expect(secondary.getByTestId("entity-record-sheet")).toBeVisible();
    await expect(primary.getByTestId("entity-record-sheet")).toHaveCount(0);

    // Closing the right pane restores the record sheet to a single pane —
    // the stack pops, nothing is lost. Escape is the canonical close path
    // (Sheet.Close → dialog onOpenChange(false) → pop).
    await page.keyboard.press("Escape");
    await expect(secondary).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByTestId("entity-record-sheet")).toBeVisible();
  });

  test("sheet uses the shared form builder — avatar_color renders the ColorSelector, not a text input", async ({
    page,
  }) => {
    const i = resolvedIndex();
    test.skip(i < 0, "no row with a resolved actor on this page");
    await page.getByTestId("ref-cell-created_by-text").nth(i).click();

    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 15000 });
    await expect(sheet).not.toContainText("Record not found", { timeout: 15000 });

    // user_profile.avatar_color is type:"color" — the canonical widget
    // is ColorSelector (popover trigger with a color swatch), and the
    // field id comes from our controlProps wiring. A plain text input
    // here would mean the sheet fell back to generic rendering.
    const trigger = sheet.locator("button#record-sheet-field-avatar_color");
    await expect(trigger).toBeVisible({ timeout: 15000 });
    await expect(trigger).toBeDisabled();
    await expect(trigger.locator("div.rounded-full")).toBeVisible();
    // The trigger's swatch paints the record's hex (or the fallback) —
    // inline background-color is the marker of the real color widget.
    await expect(trigger.locator("div.rounded-full")).toHaveAttribute(
      "style",
      /background-color/,
    );
    // And crucially: no text input stole the avatar_color field.
    await expect(sheet.locator("input#record-sheet-field-avatar_color")).toHaveCount(0);
  });

  test("unresolved actor — raw value text, sheet shows honest not-found state", async ({
    page,
  }) => {
    const i = unresolvedIndex();
    test.skip(i < 0, "no row with an unresolved actor on this page");
    await page.getByTestId("ref-cell-created_by-text").nth(i).click();
    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 15000 });
    await expect(sheet).toContainText(/not found/i, { timeout: 15000 });
  });

  test("external-link CTA opens the filtered target list in a new tab — sheet stays closed", async ({
    page,
  }) => {
    const row = page.locator("table tbody tr").first();
    await row.hover();
    const ext = page.getByTestId("ref-cell-created_by-ext").first();
    await expect(ext).toHaveCSS("opacity", "1", { timeout: 3000 });

    const [newTab] = await Promise.all([page.context().waitForEvent("page"), ext.click()]);
    await newTab.waitForLoadState("domcontentloaded");
    // Census-resolved list route carrying the canonical uuid filter term.
    const url = newTab.url();
    expect(url).toContain("filters%5B0%5D%5Bfield%5D=uuid");
    expect(url).toContain("filters%5B0%5D%5Bvalue%5D=");
    expect(url).not.toContain("/crm/customers");
    await expect(page.getByTestId("entity-record-sheet")).toHaveCount(0);
    await newTab.close();
  });

  test("sheet header CTA opens the filtered target list in a new tab", async ({ page }) => {
    const i = resolvedIndex();
    test.skip(i < 0, "no row with a resolved actor on this page");
    await page.getByTestId("ref-cell-created_by-text").nth(i).click();
    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 15000 });
    const cta = page.getByTestId("entity-record-sheet-list-cta");
    await expect(cta).toBeVisible();

    const [newTab] = await Promise.all([page.context().waitForEvent("page"), cta.click()]);
    await newTab.waitForLoadState("domcontentloaded");
    expect(newTab.url()).toContain("filters%5B0%5D%5Bfield%5D=uuid");
    await newTab.close();
  });

  test("pencil CTA is meta.actions-gated — toggles the same widgets into edit mode", async ({
    page,
  }) => {
    const i = resolvedIndex();
    test.skip(i < 0, "no row with a resolved actor on this page");
    await page.getByTestId("ref-cell-created_by-text").nth(i).click();

    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 15000 });
    await expect(sheet).not.toContainText("Record not found", { timeout: 15000 });

    // The pencil exists iff meta.actions allows update.single — the e2e
    // admin holds all permissions, so it MUST be here.
    const pencil = page.getByTestId("entity-record-sheet-edit-toggle");
    await expect(pencil).toBeVisible();
    await expect(pencil).toHaveAttribute("aria-pressed", "false");

    // Readonly baseline: text controls carry the readonly attribute.
    const avatarField = sheet.locator("#record-sheet-field-display_name");
    await expect(avatarField).toBeVisible();
    await expect(avatarField).not.toBeEditable();

    await pencil.click();
    await expect(pencil).toHaveAttribute("aria-pressed", "true");
    // SAME widgets, now editable — nothing swapped, nothing duplicated.
    await expect(avatarField).toBeEditable();
    const save = page.getByTestId("entity-record-sheet-save");
    const cancel = page.getByTestId("entity-record-sheet-cancel");
    await expect(save).toBeVisible();
    await expect(cancel).toBeVisible();

    // Cancel discards the draft and returns to readonly.
    const original = await avatarField.inputValue();
    await avatarField.fill("E2E-DIRTY");
    await cancel.click();
    await expect(avatarField).not.toBeEditable();
    await expect(avatarField).toHaveValue(original);
    await expect(save).toHaveCount(0);
  });

  test("pencil save dispatches PUT to the declared endpoint with entity+version envelope", async ({
    page,
  }) => {
    const i = resolvedIndex();
    test.skip(i < 0, "no row with a resolved actor on this page");
    await page.getByTestId("ref-cell-created_by-text").nth(i).click();

    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 15000 });
    await expect(sheet).not.toContainText("Record not found", { timeout: 15000 });

    const putBodies: { url: string; body: { entity?: Record<string, unknown> } }[] = [];
    page.on("request", (req) => {
      if (req.method() === "PUT") {
        try {
          putBodies.push({ url: req.url(), body: req.postDataJSON() });
        } catch {
          putBodies.push({ url: req.url(), body: {} });
        }
      }
    });

    const pencil = page.getByTestId("entity-record-sheet-edit-toggle");
    await expect(pencil).toBeVisible();
    await pencil.click();

    const field = sheet.locator("#record-sheet-field-display_name");
    const original = await field.inputValue();
    await field.fill("E2E");
    await page.getByTestId("entity-record-sheet-save").click();

    // Canonical write contract: PUT to the update.single endpoint carrying
    // { entity: { ...surface fields, version } } — uid/audit never cross.
    await expect.poll(() => putBodies.length, { timeout: 15000 }).toBe(1);
    const sent = putBodies[0];
    expect(sent.url).toContain("/api/v1/");
    expect(sent.body.entity).toBeTruthy();
    expect(sent.body.entity!.display_name).toBe("E2E");
    expect(sent.body.entity!.version).not.toBeUndefined();
    expect(sent.body.entity!.uuid).toBeUndefined();
    expect(sent.body.entity!.created_by).toBeUndefined();

    // After save the sheet re-GETs and returns to readonly.
    await expect(field).not.toBeEditable({ timeout: 15000 });
    await expect(page.getByTestId("entity-record-sheet-save")).toHaveCount(0);

    // Restore the original value — leave dev data as found.
    await pencil.click();
    await expect(field).toBeEditable();
    await field.fill(original);
    await page.getByTestId("entity-record-sheet-save").click();
    await expect.poll(() => putBodies.length, { timeout: 15000 }).toBe(2);
    await expect(field).not.toBeEditable({ timeout: 15000 });
  });

  test("sheet header icon is the authored entity icon (users), not a placeholder", async ({
    page,
  }) => {
    const i = resolvedIndex();
    test.skip(i < 0, "no row with a resolved actor on this page");
    await page.getByTestId("ref-cell-created_by-text").nth(i).click();

    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 15000 });
    await expect(sheet).not.toContainText("Record not found", { timeout: 15000 });

    // user_profile's list route leaf declares icon "users" — the record
    // sheet shows ONE row, so the canonical singular variant "user" must
    // render (never the generic fallback, never the plural list glyph).
    const host = page.getByRole("dialog");
    await expect(host.locator("[data-icon-name='user']")).toBeVisible();
    await expect(host.locator("[data-icon-name='id-card']")).toHaveCount(0);
  });

  test("null ref (deleted_by) renders no affordances", async ({ page }) => {
    // deleted_records=EXCLUDED default → every deleted_by is null → the
    // ref-cell affordance must not exist for that column at all.
    await expect(page.getByTestId("ref-cell-deleted_by-text")).toHaveCount(0);
    await expect(page.getByTestId("ref-cell-deleted_by-ext")).toHaveCount(0);
  });

  test("card view shares the same ref anatomy + hover reveal", async ({ page }) => {
    await page.getByRole("button", { name: "Cards (grid)" }).click();
    const card = page.locator(".group.rounded-md.border").first();
    await expect(card).toBeVisible({ timeout: 15000 });
    const cell = card.getByTestId("ref-cell-created_by-text").first();
    await expect(cell).toBeVisible();
    await expect(cell).toHaveClass(/font-medium/);
    const ext = card.getByTestId("ref-cell-created_by-ext").first();
    await card.hover();
    await expect(ext).toHaveCSS("opacity", "1", { timeout: 3000 });
  });
});
