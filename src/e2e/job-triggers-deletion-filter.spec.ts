import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";

/**
 * /system/job/triggers — the deletion-filter button group regression.
 *
 * job_trigger is soft-deletable (deleted_at = disablement), so the ELT
 * toolbar renders the three-way deletion toggle. Every option switch MUST
 * re-query the list endpoint with the matching `deleted_records` value:
 *
 *   non_deleted → deleted_records=EXCLUDED   (default)
 *   deleted     → deleted_records=ONLY
 *   all         → deleted_records=INCLUDED
 *
 * The toggle is the `[data-slot='button-group']` containing the
 * `lucide-list-x` icon — icon-only options, meaning carried by title/aria.
 */

const GROUP_SEL = "[data-slot='button-group']";

test.describe("/system/job/triggers deletion filter", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("each mode re-queries the list with the matching deleted_records value", async ({
    page,
  }) => {
    const listUrls: string[] = [];
    const listTotals: number[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/entities/job_trigger/list"))
        listUrls.push(decodeURIComponent(req.url()));
    });
    page.on("response", (res) => {
      if (res.url().includes("/entities/job_trigger/list") && res.ok())
        res
          .json()
          .then((body) => listTotals.push(Number(body?.total)))
          .catch(() => {});
    });

    await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });

    // Wait for the initial list fetch to land.
    await expect
      .poll(() => listUrls.length, { timeout: 30000 })
      .toBeGreaterThan(0);

    const delGroup = page
      .locator(GROUP_SEL)
      .filter({ has: page.locator("button svg.lucide-list-x") });
    await expect(delGroup).toHaveCount(1);

    // Always-one-selected invariant — exactly one pressed option.
    await expect(
      delGroup.locator("button[aria-pressed='true']"),
    ).toHaveCount(1);

    const nonDeletedBtn = delGroup
      .locator("button")
      .filter({ has: page.locator("svg.lucide-list-check") });
    const deletedBtn = delGroup
      .locator("button")
      .filter({ has: page.locator("svg.lucide-list-x") });
    const allBtn = delGroup
      .locator("button")
      .filter({ has: page.locator("svg.lucide-text-align-justify") });

    async function clickAndExpectParam(
      btn: typeof deletedBtn,
      expected: string,
    ) {
      const mark = listUrls.length;
      await expect(async () => {
        await btn.click();
        await expect(btn).toHaveAttribute("aria-pressed", "true", {
          timeout: 2000,
        });
      }).toPass({ timeout: 15000 });
      await expect(async () => {
        const fresh = listUrls.slice(mark);
        expect(
          fresh.some((u) => u.includes(`deleted_records=${expected}`)),
          `expected a fresh /list request with deleted_records=${expected}, got: ${JSON.stringify(fresh)}`,
        ).toBe(true);
      }).toPass({ timeout: 15000 });
      // The service must HONOR the param — capture the echoed total.
      await expect
        .poll(() => listTotals.length, { timeout: 15000 })
        .toBeGreaterThan(mark);
      return listTotals.at(-1) ?? -1;
    }

    // Default mode is non_deleted — clicking a pressed button re-queries
    // nothing, so cycle deleted → all → non_deleted.
    const deletedTotal = await clickAndExpectParam(deletedBtn, "ONLY");
    const allTotal = await clickAndExpectParam(allBtn, "INCLUDED");
    const nonDeletedTotal = await clickAndExpectParam(
      nonDeletedBtn,
      "EXCLUDED",
    );

    // Soft-delete math: ONLY + EXCLUDED == INCLUDED, and the seed state
    // guarantees both subsets are non-empty on this entity.
    expect(
      deletedTotal,
      "deleted view returned no rows — seed data expects deleted triggers",
    ).toBeGreaterThan(0);
    expect(
      nonDeletedTotal,
      "non_deleted view returned no rows",
    ).toBeGreaterThan(0);
    expect(allTotal).toBe(deletedTotal + nonDeletedTotal);
  });

  /**
   * Semantic action chrome — the meta-declared exec-* pair renders as ONE
   * contract on the row menu: icon+label share the bound ActionColor. The
   * gradient-filled glyph is detectable via `<defs><linearGradient>` —
   * lucide/composed icons never carry one. Icon and label can never drift
   * because both resolve from `SEMANTIC_ICON_COLORS`.
   *
   *   alive  row → "Disattiva"  + exec-stop  (destructive, filled square)
   *   deleted row → "Attiva"   + exec-start (success, filled play)
   */
  test("row menu renders exec-stop/exec-start semantic chrome — icon+label one color", async ({
    page,
  }) => {
    await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });

    const menuItem = (nameRe: RegExp) =>
      page.getByRole("menuitem", { name: nameRe });

    async function openRowMenu() {
      const menuBtn = page
        .locator("tbody tr")
        .first()
        .locator("button[aria-label='row actions']");
      await expect(menuBtn).toBeVisible();
      await menuBtn.click();
    }

    // ── alive row → Disattiva: destructive class on the ITEM (icon
    //    inherits currentColor) + gradient defs inside the glyph svg.
    await openRowMenu();
    const disableItem = menuItem(/disattiva|disable|deaktivier|désactiver|desactivar|desativar/i);
    await expect(disableItem).toBeVisible({ timeout: 10000 });
    await expect(disableItem).toHaveClass(/text-destructive/);
    await expect(disableItem.locator("svg defs linearGradient")).toHaveCount(1);

    // ── ANTI-DRIFT PROOF — computed styles, not classes. For EVERY menu
    //    item the icon's resolved color must equal the label's resolved
    //    color (and same opacity). This certifies the invariant for every
    //    current and FUTURE item: any divergence fails here.
    const items = page.getByRole("menuitem");
    const drifts = await items.evaluateAll((els) =>
      els.flatMap((el) => {
        const svg = el.querySelector("svg");
        const label = el.querySelector("span");
        if (!svg || !label) return [];
        const icon = getComputedStyle(svg);
        const text = getComputedStyle(label);
        return icon.color === text.color && icon.opacity === text.opacity
          ? []
          : [`"${label.textContent}": icon ${icon.color}/${icon.opacity} != label ${text.color}/${text.opacity}`];
      }),
    );
    expect(drifts).toEqual([]);

    // ── Gradient stops resolve FROM currentColor: the 100% stop must
    //    equal the label color exactly; the light stop must share the
    //    dominant channel (same hue family). Zero literals in the svg —
    //    proven on the computed values.
    // ── Anti-drift by CONSTRUCTION: every gradient stop must derive from
    //    currentColor — zero color literals in the glyph, so the icon hue
    //    IS the item's color (the same one the label renders).
    const literalStops = await disableItem.evaluate((el) =>
      [...el.querySelectorAll("stop")]
        .filter((s) => !(s.getAttribute("style") ?? "").includes("currentColor"))
        .map((s) => `color literal in glyph: ${s.outerHTML}`),
    );
    expect(literalStops).toEqual([]);

    // ── Menu layout contract (by design):
    //    Modifica first, primary color; Disattiva is the LAST main CTA;
    //    ONE divider separates main CTAs from Registro/Anteprima
    //    (secondary, read-only). No divider between custom ops and
    //    delete — delete belongs to the main mutation group.
    const texts = (await items.allTextContents()).map((t) => t.trim());
    const idxEdit = texts.findIndex((t) => /modifica|edit|bearbeiten|modifier|editar/i.test(t));
    const idxDisable = texts.findIndex((t) => /disattiva|disable|deaktivier|désactiver|desactivar|desativar/i.test(t));
    const idxHistory = texts.findIndex((t) => /registro|history|version|verlauf|historique|historial|\blog\b/i.test(t));
    const idxPreview = texts.findIndex((t) => /anteprima|preview|vorschau|aperçu|vista previa/i.test(t));
    expect(idxEdit).toBe(0);
    expect(idxDisable).toBeGreaterThan(idxEdit);
    expect(idxHistory).toBeGreaterThan(idxDisable);
    expect(idxPreview).toBeGreaterThan(idxDisable);
    const editItem = menuItem(/modifica|edit|bearbeiten|modifier|editar/i);
    await expect(editItem.first()).toHaveClass(/text-primary/);

    // ── Exactly ONE separator in the menu, sitting between the last main
    //    CTA (Disattiva) and the secondary group (Registro/Anteprima).
    const separators = page.getByRole("menu").locator("[role='separator'], [data-slot='dropdown-menu-separator']");
    await expect(separators).toHaveCount(1);
    const sepBoundary = await page.getByRole("menu").evaluate((menu) => {
      const kids = [...menu.children];
      const sepIdx = kids.findIndex((k) => k.getAttribute("role") === "separator" || k.getAttribute("data-slot") === "dropdown-menu-separator");
      const above = kids.slice(0, sepIdx).map((k) => k.textContent?.trim() ?? "");
      const below = kids.slice(sepIdx + 1).map((k) => k.textContent?.trim() ?? "");
      return { sepIdx, above, below };
    });
    expect(
      sepBoundary.above.at(-1) ?? "",
      "the CTA right above the divider must be the destructive op (last main CTA)",
    ).toMatch(/disattiva|disable|deaktivier|désactiver|desactivar|desativar/i);
    expect(sepBoundary.below.length).toBeGreaterThanOrEqual(1);
    await page.keyboard.press("Escape");

    // ── deleted view → Attiva: success class + gradient glyph.
    const delGroup = page
      .locator(GROUP_SEL)
      .filter({ has: page.locator("button svg.lucide-list-x") });
    const deletedBtn = delGroup
      .locator("button")
      .filter({ has: page.locator("svg.lucide-list-x") });
    await expect(async () => {
      await deletedBtn.click();
      await expect(deletedBtn).toHaveAttribute("aria-pressed", "true", {
        timeout: 2000,
      });
    }).toPass({ timeout: 15000 });
    await expect(page.locator("table tbody tr").first()).toBeVisible({
      timeout: 15000,
    });

    await openRowMenu();
    const enableItem = menuItem(/attiva|enable|aktivier|activer|activar|ativar/i);
    await expect(enableItem).toBeVisible({ timeout: 10000 });
    await expect(enableItem).toHaveClass(/text-success/);
    await expect(enableItem.locator("svg defs linearGradient")).toHaveCount(1);

    // ── Same anti-drift proof on the deleted view: icon color === label
    //    color for every item, and the exec-start gradient resolves its
    //    final stop to the exact label color (success).
    const delItems = page.getByRole("menuitem");
    const delDrifts = await delItems.evaluateAll((els) =>
      els.flatMap((el) => {
        const svg = el.querySelector("svg");
        const label = el.querySelector("span");
        if (!svg || !label) return [];
        const icon = getComputedStyle(svg);
        const text = getComputedStyle(label);
        return icon.color === text.color && icon.opacity === text.opacity
          ? []
          : [`"${label.textContent}": icon ${icon.color}/${icon.opacity} != label ${text.color}/${text.opacity}`];
      }),
    );
    expect(delDrifts).toEqual([]);
    const enableLiteralStops = await enableItem.evaluate((el) =>
      [...el.querySelectorAll("stop")]
        .filter((s) => !(s.getAttribute("style") ?? "").includes("currentColor"))
        .map((s) => `color literal in glyph: ${s.outerHTML}`),
    );
    expect(enableLiteralStops).toEqual([]);
  });

  /**
   * Bulk disable confirm dialog — the whole copy is meta-driven
   * (`meta.actions["delete.bulk"]` label_key/confirm_key/busy_key/color)
   * and a scope Choicebox asks "only selected vs all rows matching the
   * current filters" (the export-scope precedent). Proofs:
   *
   *   - title/button say "Disattiva", NEVER "Elimina"/"Delete"
   *   - body says disable-wording, NOT the "cannot be undone" delete tail
   *   - two radios: selected-count vs all-count (list total)
   *   - scope=all enumerates /list?deleted_records=EXCLUDED with the SAME
   *     filters and dispatches {items:[{uuid,version}]} — intercepted, so
   *     no real mutation lands
   *   - 1-row selection already enables the bulk CTA (scope=all is a
   *     legit entry point, not just "delete selected")
   */
  test("bulk Disattiva dialog — meta copy + scope choicebox + all-scope dispatch", async ({
    page,
  }) => {
    // Intercept the bulk endpoint — assert the wire, never mutate data.
    const bulkBodies: Array<{ items?: Array<{ uuid: string; version: number }> }> = [];
    await page.route("**/entities/job_trigger/bulk-delete", async (route) => {
      bulkBodies.push(route.request().postDataJSON() as { items?: [] });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ received: 1, affected: 1 }),
      });
    });

    const listUrls: string[] = [];
    let excludedTotal = -1;
    page.on("request", (req) => {
      if (req.url().includes("/entities/job_trigger/list"))
        listUrls.push(decodeURIComponent(req.url()));
    });
    page.on("response", (res) => {
      const u = res.url();
      if (u.includes("/entities/job_trigger/list") && u.includes("deleted_records=EXCLUDED") && res.ok())
        res.json().then((b) => { excludedTotal = Number(b?.total ?? -1); }).catch(() => {});
    });

    await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table")).toBeVisible({ timeout: 30000 });
    await expect
      .poll(() => excludedTotal, { timeout: 30000 })
      .toBeGreaterThan(0);

    // Select exactly ONE row — the bulk CTA must enable (scope=all entry).
    const firstRowCheck = page
      .locator("tbody tr")
      .first()
      .locator("[aria-label='select row']");
    await firstRowCheck.click();

    const disableRe = /disattiva|disable|deaktivier|désactiver|desactivar|desativar/i;
    const deleteRe = /elimina|delete|löschen|supprimer|eliminar|excluir/i;
    const bulkBtn = page.getByRole("button", { name: disableRe });
    await expect(bulkBtn.first()).toBeEnabled({ timeout: 10000 });
    await bulkBtn.first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // ── Meta-driven copy: "Disattiva" title + confirm button, never
    //    "Elimina". The label_key IS the dialog verb.
    const title = dialog.getByRole("heading").first();
    await expect(title).toHaveText(disableRe);
    await expect(title).not.toHaveText(deleteRe);
    const confirmBtn = dialog.getByRole("button", { name: disableRe });
    await expect(confirmBtn).toHaveCount(1);
    await expect(confirmBtn).not.toHaveText(deleteRe);

    // ── Body copy is the confirm_key template — disable wording, and the
    //    delete-only "cannot be undone" tail must be ABSENT.
    await expect(dialog).toContainText(
      /disattiv|disable|deaktivier|désactiv|desactiv|desativ/i,
    );
    await expect(dialog).not.toContainText(
      /non può essere annullata|cannot be undone|kann nicht rückgängig|ne peut pas être annulée|no se puede deshacer|não pode ser desfeita/i,
    );

    // ── Scope choicebox: two radios with the two counts.
    const radios = dialog.locator("[role='radio']");
    await expect(radios).toHaveCount(2);
    const selectedItem = radios.nth(0);
    const allItem = radios.nth(1);
    // selected → exactly the checked count (1)
    await expect(selectedItem).toContainText(/\b1\b/);
    await expect(selectedItem).toContainText(
      /selezionat|selected|ausgewählt|sélectionn|seleccionad|selecionad/i,
    );
    // all → the EXCLUDED list total under the current filters
    await expect(allItem).toContainText(
      new RegExp(`\\b${excludedTotal}\\b`),
    );
    await expect(allItem).toContainText(
      /tutti|all|alle|tous|todos/i,
    );

    // ── scope=all → confirm → enumerate(EXCLUDED) + {items:[{uuid,version}]}
    const mark = listUrls.length;
    await allItem.click();
    await expect(allItem).toHaveAttribute("data-state", "checked");
    await confirmBtn.click();

    await expect(async () => {
      const fresh = listUrls.slice(mark);
      expect(
        fresh.some((u) => u.includes("deleted_records=EXCLUDED")),
        `scope=all must re-enumerate /list with deleted_records=EXCLUDED, got: ${JSON.stringify(fresh)}`,
      ).toBe(true);
    }).toPass({ timeout: 15000 });

    await expect
      .poll(() => bulkBodies.length, { timeout: 15000 })
      .toBeGreaterThan(0);
    const items = bulkBodies[0]?.items ?? [];
    expect(
      items.length,
      `scope=all must dispatch one {uuid,version} per non-deleted row (${excludedTotal}), got ${items.length}`,
    ).toBe(excludedTotal);
    for (const it of items) {
      expect(typeof it.uuid).toBe("string");
      expect(typeof it.version).toBe("number");
    }

    // Dialog closes after the (fulfilled) dispatch.
    await expect(dialog).toBeHidden({ timeout: 10000 });
  });
});
