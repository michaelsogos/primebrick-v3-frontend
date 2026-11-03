/**
 * payload-map-widget — the editor's visual/behavioral contract.
 *
 * Covers what unit tests cannot reach:
 *   1. path picker is a CLOSED combo (schema-declared `$.path` options,
 *      `allow_create` absent → no free entry — same census rule as
 *      `options_source` fields);
 *   2. every destination field and every event-path option carries its
 *      schema-type icon (`_icon`/`_icon_dashed` convention);
 *   3. an invalid const emits ONE hint — the engine dedupes the
 *      pattern+format keywords zod projects for `.email()`;
 *   4. field rows are top-aligned so a hint expands its own cell only;
 *   5. the compatibility partition: `languageIso` (format:"lang") admits
 *      only `$.customer.preferred_locale`; the eye-dashed CTA inside the
 *      dropdown search row reveals the rest disabled+searchable.
 *
 * Surface: /system/job/triggers/create with `emailsender.send` as the
 * target (its `to` prop is `array<string email>` — the dedup fixture)
 * and `crm.customer_changed` as the event (rich nested payload schema —
 * the icon fixture). Nothing is submitted.
 *
 * Conventions: e2e-browser-session.md — 5s expectation budget everywhere
 * (`actionTimeout`), no waitForTimeout, dead clicks retried inside polls.
 */
import { test, expect, type Locator, type Page, type BrowserContext } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";
import { upsertEmailTemplateFixture, deleteEmailTemplateFixture } from "./helpers/db";

test.describe.configure({ mode: "serial" });
test.use({ actionTimeout: 5000 });

/** Hydration gate + CTA → child page. The CTA click races hydration on a
 *  cold popup — retry inside the poll budget until the child mounts. */
async function openTriggersCreate(page: Page, context: BrowserContext): Promise<Page> {
  await loginAsTestAdmin(page);
  await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
  await expect(page.locator("table")).toBeVisible();
  // Sidebar nav links mount only after onMount + module-nav fetch — the
  // doc's hydration gate: clicking SSR DOM hits dead handlers.
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

/** Click until the combo reports expanded — a dead click (closing overlay,
 *  hydration race) is retried inside the 5s poll budget, never a sleep.
 *  The left edge avoids the trailing clear button swallowing center clicks. */
async function clickUntilExpanded(combo: Locator): Promise<void> {
  await expect(async () => {
    await combo.click({ position: { x: 8, y: 18 } });
    await expect(combo).toHaveAttribute("aria-expanded", "true", { timeout: 600 });
  }).toPass({ timeout: 5000 });
}

/** Click a closed-vocabulary option by label — the ambient app command
 *  palette can stay open but its options never match these labels. */
async function pickOption(popup: Page, text: RegExp | string): Promise<void> {
  const opt = popup.locator('[role="option"]:visible').filter({ hasText: text }).first();
  await expect(opt).toBeVisible();
  await opt.click();
}

/** Census wiring: crm.customer_changed event + emailsender.send target —
 *  the fixture pair every test in this file shares. */
async function pickEventAndTarget(popup: Page): Promise<void> {
  const eventField = popup.getByTestId("entity-form-field-event_subject");
  await clickUntilExpanded(eventField.locator('[role="combobox"]'));
  await pickOption(popup, "crm.customer_changed");
  await popup.keyboard.press("Escape");

  const targetField = popup.getByTestId("entity-form-field-target_subject");
  await clickUntilExpanded(targetField.locator('[role="combobox"]'));
  await pickOption(popup, "emailsender.send");
  await popup.keyboard.press("Escape");
}

test.describe("payload-map widget", () => {
  test("closed path picker + type icons + single hint + top-aligned rows", async ({ page, context }) => {
    const popup = await openTriggersCreate(page, context);
    const submit = popup.getByTestId("entity-form-submit");
    await popup.getByTestId("entity-form-field-name").locator("input").fill(`e2e-payload-map-${Date.now()}`);
    await pickEventAndTarget(popup);

    // ── type icon on the destination field column ────────────────────
    const toRow = popup.getByTestId("payload-map-row-to");
    await expect(toRow).toBeVisible();
    await expect(toRow.locator("span svg").first()).toBeVisible();

    // ── rows are top-aligned (a hint expands its own cell only) ──────
    await expect(toRow.locator("div.grid").first()).toHaveClass(/items-start/);

    // ── path kind → CLOSED picker with per-option type icons ─────────
    // `templateCode` is a bare string → the domain rule keeps only
    // UNSPECIALIZED sources (bare strings + enums): `format`/`x_semantic`
    // paths are distinct domains — a date-time is not "text".
    const codeRow = popup.getByTestId("payload-map-row-templateCode");
    await expect(codeRow).toBeVisible();
    await clickUntilExpanded(codeRow.locator('[role="combobox"]').first());
    await pickOption(popup, /event property|campo evento|propriet/i);
    await popup.keyboard.press("Escape");

    const pathCombo = codeRow.locator('[role="combobox"]').nth(1);
    await clickUntilExpanded(pathCombo);
    // The path picker's popover is the last visible one (the ambient
    // command palette sits earlier in the DOM). Scope everything there.
    const pathPopover = popup.locator('[data-slot="popover-content"]:visible').last();
    const options = pathPopover.locator('[role="option"]').filter({ hasText: /\$\./ });
    await expect(options.first()).toBeVisible();
    // Bare strings + enum stay — code, name fields, status.
    await expect(options.filter({ hasText: /\$\.customer\.code/ })).toHaveCount(1);
    await expect(options.filter({ hasText: /\$\.customer\.status/ })).toHaveCount(1);
    // Specialized sources are hidden by the domain rule — email, uuid,
    // date-time, lang are NOT "strings" for a bare-string target. Same
    // for object/array paths.
    await expect(options.filter({ hasText: /\$\.customer\.email/ })).toHaveCount(0);
    await expect(options.filter({ hasText: /\$\.customer\.uuid/ })).toHaveCount(0);
    await expect(options.filter({ hasText: /\$\.customer\.preferred_locale/ })).toHaveCount(0);
    await expect(options.filter({ hasText: /\$\.change\.changed_at/ })).toHaveCount(0);
    await expect(options.filter({ hasText: /\$\.change\.changed_fields/ })).toHaveCount(0);
    // Every option carries a type icon (svg inside the option row).
    expect(await options.count()).toBeGreaterThan(0);
    await expect(options.first().locator("svg").first()).toBeVisible();

    // The eye-dashed toggle reveals the hidden partition — disabled but
    // still carrying honest type icons (the same partition contract as
    // the lang test below, asserted here for icons specifically):
    //   changed_at  → date-time → calendar-clock
    //   changed_by  → uuid + x_semantic:"actor.uuid" → user-cog (actor)
    //   email/uuid  → mail / fingerprint
    const eyeToggle = pathPopover.locator('button[aria-pressed]');
    await expect(eyeToggle).toBeVisible();
    await eyeToggle.click();
    const revealed = pathPopover.locator('[role="option"]').filter({ hasText: /\$\./ });
    await expect(
      revealed.filter({ hasText: /\$\.change\.changed_at/ }).locator("svg.lucide-calendar-clock"),
    ).toBeVisible();
    await expect(
      revealed.filter({ hasText: /\$\.change\.changed_by/ }).locator("svg.lucide-user-cog"),
    ).toBeVisible();
    await expect(
      revealed.filter({ hasText: /\$\.customer\.email/ }).locator("svg.lucide-mail"),
    ).toBeVisible();
    await expect(
      revealed.filter({ hasText: /\$\.customer\.uuid/ }).locator("svg.lucide-fingerprint-pattern"),
    ).toBeVisible();
    // All revealed specialized paths are disabled — never selectable.
    await expect(
      revealed.filter({ hasText: /\$\.change\.changed_at/ }),
    ).toHaveAttribute("data-disabled", /.*/);

    // Closed vocabulary: typing a bogus path filters to zero options and
    // offers NO create affordance (`allow_create` absent → free entry
    // disabled — the standard meta rule for declared vocabularies).
    const searchInput = pathPopover.locator('[data-slot="command-input"], input[placeholder]').last();
    await searchInput.fill("$.bogus.field");
    await expect(pathPopover.locator('[role="option"]:visible')).toHaveCount(0);
    await searchInput.press("Enter");
    await popup.keyboard.press("Escape");
    // The bogus path must NOT have materialized an entry — the map stays
    // incomplete → conformance fails → Save stays disabled.
    await expect(submit).toBeDisabled();

    // ── dedup + per-badge invalidity ─────────────────────────────────
    // Switch `to` back to `list` — the multi combo accepts typed values
    // (const items are authored data, not a declared vocabulary). A valid
    // + an invalid email coexist: only the bad badge is destructive.
    await clickUntilExpanded(toRow.locator('[role="combobox"]').first());
    await pickOption(popup, /list of values|elenco|lista/i);
    await popup.keyboard.press("Escape");
    const addConst = async (v: string) => {
      const listComboInput = toRow.locator('input:visible').first();
      if (await listComboInput.isVisible().catch(() => false)) {
        await listComboInput.fill(v);
        await listComboInput.press("Enter");
      } else {
        await clickUntilExpanded(toRow.locator('[role="combobox"]').nth(1));
        const itemInput = popup.locator('[data-slot="command-input"]:visible').last();
        await itemInput.fill(v);
        await itemInput.press("Enter");
        await popup.keyboard.press("Escape");
      }
    };
    await addConst("good@example.com");
    await addConst("not-an-email");
    // Component-supported marking: `isValueInvalid` asks the same
    // jsonSchemaCheck the wire gate runs — the bad badge carries
    // data-invalid + destructive variant, the good one stays secondary.
    const badges = toRow.locator("[data-slot='badge'], .badge, span[class*='badge']");
    await expect(toRow.locator("[data-invalid]")).toHaveCount(1);
    await expect(toRow.locator("[data-invalid]").first()).toContainText("not-an-email");
    // Exactly ONE hint line under the control — the engine dedupes the
    // format+pattern pair zod emits for .email(). The text is the
    // TRANSLATED `app.common.validation.email` value interpolated into
    // `issue.invalid` — never a raw English sentence or a bare key.
    const hints = toRow.getByTestId("payload-map-issue");
    await expect(hints.first()).toBeVisible();
    await expect(hints).toHaveCount(1);
    await expect(hints.first()).toContainText(/valid email|email valida/i);
    await expect(hints.first()).not.toContainText("app.common.validation");
  });

  test("kind picked, nothing filled → combobox invalid + Save gated", async ({ page, context }) => {
    const popup = await openTriggersCreate(page, context);
    const submit = popup.getByTestId("entity-form-submit");
    await popup.getByTestId("entity-form-field-name").locator("input").fill(`e2e-empty-entry-${Date.now()}`);
    await pickEventAndTarget(popup);

    // `to` → "Elenco di valori" writes `{kind:"list", items:[]}`: the
    // resolver reads [] as EMPTY → with no fallback the entry delivers
    // nothing. Conformance flags it `required` — the SAME predicate the
    // form validator runs → combobox destructive + Save disabled.
    const toRow = popup.getByTestId("payload-map-row-to");
    await clickUntilExpanded(toRow.locator('[role="combobox"]').first());
    await pickOption(popup, /list of values|elenco|lista/i);
    await popup.keyboard.press("Escape");

    // The `required` leaf issue gates Save + marks the combobox, but
    // renders NO text — the red control IS the message (the duplicated
    // "add at least one entry" line was noise on top of the same signal).
    await expect(toRow.locator('[role="combobox"][aria-invalid="true"]')).toHaveCount(1);
    await expect(toRow.getByTestId("payload-map-issue")).toHaveCount(0);
    await expect(submit).toBeDisabled();

    // Honest recovery: one valid email fills the list — the leaf issue
    // clears, the ring drops. `templateCode` still unmapped keeps Save
    // disabled; map it via a compatible path → the whole form goes valid.
    const listInput = toRow.locator('input:visible').first();
    if (await listInput.isVisible().catch(() => false)) {
      await listInput.fill("only@example.com");
      await listInput.press("Enter");
    } else {
      await clickUntilExpanded(toRow.locator('[role="combobox"]').nth(1));
      const itemInput = popup.locator('[data-slot="command-input"]:visible').last();
      await itemInput.fill("only@example.com");
      await itemInput.press("Enter");
      await popup.keyboard.press("Escape");
    }
    await expect(toRow.locator('[role="combobox"][aria-invalid="true"]')).toHaveCount(0);
    await expect(toRow.getByTestId("payload-map-issue")).toHaveCount(0);

    const codeRow = popup.getByTestId("payload-map-row-templateCode");
    await clickUntilExpanded(codeRow.locator('[role="combobox"]').first());
    await pickOption(popup, /event property|campo evento|propriet/i);
    await popup.keyboard.press("Escape");
    await clickUntilExpanded(codeRow.locator('[role="combobox"]').nth(1));
    await popup.locator('[data-slot="popover-content"]:visible').last()
      .locator('[role="option"]').filter({ hasText: /\$\.customer\.code/ }).first().click();
    await popup.keyboard.press("Escape");

    // `languageIso` is required too — "Context" auto-selects the first
    // compatible meta kind (actor_locale, lang→lang) via defaultMeta.
    const langRow = popup.getByTestId("payload-map-row-languageIso");
    await clickUntilExpanded(langRow.locator('[role="combobox"]').first());
    await pickOption(popup, /context|contesto/i);
    await popup.keyboard.press("Escape");

    await expect(submit).toBeEnabled();
    await popup.close();
  });

  test("template variables — required keys seed as rows, optional in accordion, Save gated until mapped", async ({
    page,
    context,
  }) => {
    // Deterministic fixture — the `variables` declaration mixes shorthand
    // (required by the template axiom) and longhand-optional keys.
    await upsertEmailTemplateFixture({
      code: "e2e_vars_template",
      subject: "E2E Variables Template",
      variables: {
        customer_name: "string",
        amount: "number",
        note: { type: "string", optional: true },
      },
    });
    try {
      const popup = await openTriggersCreate(page, context);
      const submit = popup.getByTestId("entity-form-submit");
      await popup.getByTestId("entity-form-field-name").locator("input").fill(`e2e-vars-${Date.now()}`);
      await pickEventAndTarget(popup);

      // `templateCode` → "Fixed value" → the fixture template.
      const codeRow = popup.getByTestId("payload-map-row-templateCode");
      await clickUntilExpanded(codeRow.locator('[role="combobox"]').first());
      await pickOption(popup, /fixed value|valore fisso/i);
      await popup.keyboard.press("Escape");
      await clickUntilExpanded(codeRow.locator('[role="combobox"]').nth(1));
      await popup
        .locator('[data-slot="popover-content"]:visible')
        .last()
        .locator('[role="option"]')
        .filter({ hasText: "E2E Variables Template" })
        .click();
      await popup.keyboard.press("Escape");

      // Picking a catalogued template IS the commitment: `variables`
      // PROMOTES itself out of the optional accordion into the required
      // block — the template's required keys make the field mandatory,
      // and they materialize as seated rows immediately.
      const varsRow = popup
        .getByTestId("payload-map-rows")
        .getByTestId("payload-map-row-variables");
      await expect(varsRow).toBeVisible();

      const mapBlock = varsRow.getByTestId("payload-map-mapblock-variables");
      await expect(mapBlock).toBeVisible();
      const nameRow = mapBlock.getByTestId("payload-map-maprow-variables-customer_name");
      const amountRow = mapBlock.getByTestId("payload-map-maprow-variables-amount");
      await expect(nameRow).toBeVisible();
      await expect(amountRow).toBeVisible();
      // Required rows: `*` marker, NO trash (the template needs them),
      // same 3-column anatomy as field rows, one red empty source each —
      // the seeded `{path:""}` is an honest `required` issue.
      for (const row of [nameRow, amountRow]) {
        await expect(row).toHaveClass(/grid/);
        await expect(row.locator(".text-destructive").first()).toContainText("*");
        await expect(row.locator("svg.lucide-trash")).toHaveCount(0);
        await expect(row.locator('[role="combobox"][aria-invalid="true"]')).toHaveCount(1);
      }
      await expect(submit).toBeDisabled();

      // The optional declared key does NOT seed — it waits in its own
      // inner accordion (the required/optional principle mirrored inside
      // the map). And the ghost row keeps the identity cell — a key
      // picker sitting where the committed row shows icon·label·help.
      const optAcc = mapBlock.getByTestId("payload-map-mapopt-variables");
      await expect(optAcc).toBeVisible();
      await optAcc.locator("button").first().click();
      await expect(optAcc).toContainText("note");
      // CLOSED vocabulary — with a resolved declaration every mappable
      // key is already rendered (required → seated rows, optional →
      // accordion): there is NO free-form "add key" input at all.
      await expect(mapBlock.getByTestId("payload-map-mapkey-add-variables")).toHaveCount(0);

      // The field-level kind picker on `variables` offers NO "Fixed
      // value": the map rows cover manual values, a field const would be
      // hand-typed raw JSON.
      await clickUntilExpanded(varsRow.locator('[role="combobox"]').first());
      await expect(
        popup.locator('[role="option"]:visible').filter({ hasText: /fixed value|valore fisso/i }),
      ).toHaveCount(0);
      await popup.keyboard.press("Escape");

      // Fill `customer_name` via a compatible path (bare-string target →
      // only unspecialized `$.` sources admitted — same compat engine as
      // the event-path lanes everywhere else).
      const namePathCombo = nameRow.locator('[role="combobox"]').nth(1);
      await clickUntilExpanded(namePathCombo);
      const namePopover = popup.locator('[data-slot="popover-content"]:visible').last();
      await expect(
        namePopover.locator('[role="option"]').filter({ hasText: /\$\.customer\.email/ }),
      ).toHaveCount(0);
      await namePopover
        .locator('[role="option"]')
        .filter({ hasText: /\$\.customer\.code/ })
        .first()
        .click();
      await popup.keyboard.press("Escape");
      await expect(nameRow.locator('[role="combobox"][aria-invalid="true"]')).toHaveCount(0);
      await expect(submit).toBeDisabled(); // `amount` still unmapped

      // `amount` (number) — no numeric path exists in the event payload;
      // switch the row's source to "Fixed value" and type the literal.
      await clickUntilExpanded(amountRow.locator('[role="combobox"]').first());
      await pickOption(popup, /fixed value|valore fisso/i);
      await popup.keyboard.press("Escape");
      await amountRow.locator("input:visible").last().fill("100");
      await expect(amountRow.locator('[aria-invalid="true"]')).toHaveCount(0);

      // `note` stays uncommitted in its accordion — optional means
      // optional: no entry, no issue, no gate.
      await expect(mapBlock.locator('[aria-invalid="true"]')).toHaveCount(0);

      // Remaining required fields → the whole form unblocks.
      const toRow = popup.getByTestId("payload-map-row-to");
      await clickUntilExpanded(toRow.locator('[role="combobox"]').first());
      await pickOption(popup, /event property|campo evento|propriet/i);
      await popup.keyboard.press("Escape");
      await clickUntilExpanded(toRow.locator('[role="combobox"]').nth(1));
      await popup
        .locator('[data-slot="popover-content"]:visible')
        .last()
        .locator('[role="option"]')
        .filter({ hasText: /\$\.customer\.email/ })
        .first()
        .click();
      await popup.keyboard.press("Escape");
      const langRow = popup.getByTestId("payload-map-row-languageIso");
      await clickUntilExpanded(langRow.locator('[role="combobox"]').first());
      await pickOption(popup, /context|contesto/i);
      await popup.keyboard.press("Escape");
      await expect(submit).toBeEnabled();

      // `meta` on an object target: NOTHING in the context vocabulary is
      // object-shaped → the picker stays EMPTY (no blind first-option
      // auto-pick), `{kind:"meta"}` → unknown_meta → red + gated.
      await clickUntilExpanded(varsRow.locator('[role="combobox"]').first());
      await pickOption(popup, /context|contesto/i);
      await popup.keyboard.press("Escape");
      const metaCombo = varsRow.locator('[role="combobox"]').nth(1);
      await expect(metaCombo).not.toContainText(/creator|creato|actor|attore|locale|lingua/i);
      await expect(metaCombo).toHaveAttribute("aria-invalid", "true");
      await expect(submit).toBeDisabled();
      await popup.close();
    } finally {
      await deleteEmailTemplateFixture("e2e_vars_template");
    }
  });

  test("compatibility partition — languageIso admits only preferred_locale, toggle reveals the rest disabled+searchable", async ({
    page,
    context,
  }) => {
    const popup = await openTriggersCreate(page, context);
    await popup.getByTestId("entity-form-field-name").locator("input").fill(`e2e-payload-compat-${Date.now()}`);
    await pickEventAndTarget(popup);

    // `languageIso` — target {type:"string", format:"lang"}. Only
    // `$.customer.preferred_locale` survives both screens: level-1 keeps
    // string-family paths, level-2 keeps `format:"lang"` sources.
    const langRow = popup.getByTestId("payload-map-row-languageIso");
    await expect(langRow).toBeVisible();
    await clickUntilExpanded(langRow.locator('[role="combobox"]').first());
    await pickOption(popup, /event property|campo evento|propriet/i);
    await popup.keyboard.press("Escape");

    const langPathCombo = langRow.locator('[role="combobox"]').nth(1);
    await clickUntilExpanded(langPathCombo);
    const pathPopover = popup.locator('[data-slot="popover-content"]:visible').last();
    const allOptions = pathPopover.locator('[role="option"]').filter({ hasText: /\$\./ });
    await expect(allOptions).toHaveCount(1);
    await expect(allOptions.first()).toContainText("$.customer.preferred_locale");

    // The partition CTA lives INSIDE the dropdown's search row — an
    // `eye-dashed` glyph (hidden data, not a secret — `eye`/`eye-off`
    // belong to passwords). OFF = muted icon + aria-pressed false.
    const eyeToggle = pathPopover.locator('button[aria-pressed]');
    await expect(eyeToggle).toBeVisible();
    await expect(eyeToggle).toHaveAttribute("aria-pressed", "false");
    await expect(eyeToggle.locator("svg.lucide-eye-dashed")).toBeVisible();

    // Eye ON (same click — state is color + aria-pressed, no glyph swap)
    // → the full vocabulary resurfaces, everything except
    // preferred_locale marked data-disabled (shown, not selectable).
    await eyeToggle.click();
    await expect(eyeToggle).toHaveAttribute("aria-pressed", "true");
    const revealed = pathPopover;
    const revealedOptions = revealed.locator('[role="option"]').filter({ hasText: /\$\./ });
    expect(await revealedOptions.count()).toBeGreaterThan(5);
    await expect(revealed.locator('[role="option"][data-disabled]')).not.toHaveCount(0);
    await expect(
      revealedOptions.filter({ hasText: /\$\.customer\.preferred_locale/ }),
    ).not.toHaveAttribute("data-disabled", /.*/);
    // A disabled option still renders its type icon — the array glyph on
    // `changed_fields`, greyed but informative.
    await expect(
      revealed
        .locator('[role="option"][data-disabled]')
        .filter({ hasText: /\$\.change\.changed_fields/ })
        .locator("svg.lucide-brackets"),
    ).toBeVisible();

    // Disabled options stay searchable — filter on a known incompatible
    // path and assert it surfaces greyed.
    const searchInput = revealed.locator('[data-slot="command-input"], input[placeholder]').last();
    await searchInput.fill("changed_by");
    const hits = revealed.locator('[role="option"]:visible').filter({ hasText: /\$\./ });
    await expect(hits.first()).toBeVisible();
    await expect(hits.first()).toHaveAttribute("data-disabled", /.*/);
    // Clicking a disabled option must not select it — the trigger keeps
    // the empty value (placeholder), never the blocked path.
    await hits.first().click({ force: true });
    await expect(langPathCombo).not.toContainText("changed_by");

    // The compatible option does select — the only legit mapping.
    await searchInput.fill("preferred_locale");
    await pickOption(popup, /\$\.customer\.preferred_locale/);
    await expect(langPathCombo).toContainText("$.customer.preferred_locale");
    await popup.keyboard.press("Escape");

    // Fresh open resets the partition to hidden — OFF is the contract's
    // default, the toggle is a per-session reveal, not a preference.
    await clickUntilExpanded(langPathCombo);
    const reopened = popup.locator('[data-slot="popover-content"]:visible').last();
    await expect(reopened.locator('[role="option"]').filter({ hasText: /\$\./ })).toHaveCount(1);
    await expect(reopened.locator('button[aria-pressed]')).toHaveAttribute("aria-pressed", "false");
    await popup.keyboard.press("Escape");

    // ── scalar→array broadcast on `to` (array<email>) ────────────────
    // `$.customer.email` is a SCALAR email — pathCompatible admits it as
    // a single-element wrap; `changed_fields` (array<string> nude) stays
    // out because bare strings can't prove the email domain.
    const toRow2 = popup.getByTestId("payload-map-row-to");
    await clickUntilExpanded(toRow2.locator('[role="combobox"]').first());
    await pickOption(popup, /event property|campo evento|propriet/i);
    await popup.keyboard.press("Escape");
    const toPathCombo = toRow2.locator('[role="combobox"]').nth(1);
    await clickUntilExpanded(toPathCombo);
    const toPopover = popup.locator('[data-slot="popover-content"]:visible').last();
    const toOptions = toPopover.locator('[role="option"]').filter({ hasText: /\$\./ });
    await expect(toOptions.filter({ hasText: /\$\.customer\.email/ })).toHaveCount(1);
    await expect(toOptions.filter({ hasText: /\$\.change\.changed_fields/ })).toHaveCount(0);
    await pickOption(popup, /\$\.customer\.email/);
    await expect(toPathCombo).toContainText("$.customer.email");
    await popup.keyboard.press("Escape");

    // ── meta kind partition — same compat rule, context vocabulary ────
    // `to` keeps only the email-domain metas: actor_email/creator_email.
    const toMetaCombo = toRow2.locator('[role="combobox"]').first();
    await clickUntilExpanded(toMetaCombo);
    await pickOption(popup, /context|contesto/i);
    await popup.keyboard.press("Escape");
    const metaPicker = toRow2.locator('[role="combobox"]').nth(1);
    await clickUntilExpanded(metaPicker);
    const metaPopover = popup.locator('[data-slot="popover-content"]:visible').last();
    const metaEnabled = metaPopover.locator('[role="option"]:visible:not([data-disabled])');
    await expect(metaEnabled).toHaveCount(2);
    await expect(metaEnabled.filter({ hasText: /actor_email|creator_email|email/i })).toHaveCount(2);
    // Reveal: the remaining kinds (uuid/int/lang domains) surface disabled.
    const metaEye = metaPopover.locator('button[aria-pressed]');
    await expect(metaEye).toBeVisible();
    await metaEye.click();
    await expect(metaPopover.locator('[role="option"][data-disabled]')).not.toHaveCount(0);
    // trigger_id regression (rename drift): the option carries its
    // translated label + `file-key` icon — disabled for this email-array
    // target (uuid domain), but never unlabeled/uniconed.
    const triggerOpt = metaPopover.locator('[role="option"][data-disabled]').filter({ hasText: /trigger/i });
    await expect(triggerOpt.first()).toBeVisible();
    await expect(triggerOpt.first().locator("svg.lucide-file-key")).toBeVisible();
    await popup.keyboard.press("Escape");
  });
});
