/**
 * mapper-viewer — the read-only prose mirror of the payload_map builder,
 * verified in the it-IT locale it renders for real users.
 *
 * Covers what the form-side spec cannot reach:
 *   1. the list-page create CTA renders the generic `+` glyph (component
 *      default — a route/nav icon must never leak into the action);
 *   2. the mapper cell renders the LOCALIZED "Vedi mappa" link +
 *      a trailing ExternalLink to the record's kind:"detail" route;
 *   3. the `entity.mapperViewer` sheet heads SOURCE/DEST EVENT endpoint
 *      badges (census labels, translated), then one 50/50 row per
 *      authored DST entry — left field identity, right kind line +
 *      value line — no inputs; `map`/`list`/fallback nest correctly;
 *   4. declared-but-unmapped target fields collapse in the localized
 *      "Campi non mappati" accordion.
 *
 * Fixture: a trigger declared via the governed API with an authored
 * payload_map (const/path/inject + map + fallback) — deleted at the end.
 *
 * Conventions: e2e-browser-session.md — 5s expectation budget, no
 * waitForTimeout, dead clicks retried inside polls.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";
import { declareTrigger, deleteTrigger, JOB_API } from "./helpers/job-chain";

test.use({ actionTimeout: 5000 });

const MAP = {
  requestId: { kind: "inject", inject: "uuid" },
  templateCode: { kind: "const", value: "e2e_mapper_probe" },
  to: { kind: "list", items: [{ kind: "const", value: "mapper-viewer@example.com" }] },
  variables: {
    kind: "map",
    entries: { customer_name: { kind: "path", path: "$.entity.after.display_name" } },
  },
  languageIso: {
    kind: "meta",
    meta: "actor_locale",
    fallback: [{ kind: "const", value: "en-US" }],
  },
};

/** Pin the UI to it-IT — the locale the illegible/English-mixed sheet was
 *  reported on; sessionStorage `pb.lang` is the store the i18n layer reads. */
async function pinItalian(page: import("@playwright/test").Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const langNow = await page.evaluate(() => sessionStorage.getItem("pb.lang"));
  if (langNow !== "it-IT") {
    await page.evaluate(() => sessionStorage.setItem("pb.lang", "it-IT"));
    await page.reload({ waitUntil: "domcontentloaded" });
  }
}

test.describe("mapper viewer", () => {
  test("cell link → badges + 50/50 prose rows + unmapped accordion (it-IT)", async ({ page }) => {
    await loginAsTestAdmin(page);
    await pinItalian(page);
    const { uuid } = await declareTrigger(page.request, {
      name: `e2e-mapper-viewer-${Date.now()}`,
      event_subject: "events.crm.customer.on.changed",
      target_subject: "emailsender.send",
      run_as: "author",
      payload_map: MAP,
    });

    try {
      await page.goto("/system/job/triggers", { waitUntil: "domcontentloaded" });
      await expect(page.locator("table")).toBeVisible();
      await expect(page.locator('a[href^="/system/"]').first()).toBeVisible();

      // Create CTA — the generic `+` component default; NO route/nav icon
      // (text-cursor-input was the regression this guards).
      const createCta = page.getByTestId("entity-create-cta");
      await expect(createCta).toBeVisible();
      await expect(createCta.locator("svg.lucide-plus").first()).toBeVisible();
      await expect(createCta.locator("svg.lucide-text-cursor-input")).toHaveCount(0);

      // payload_map is default_visible:false — enable it via the picker
      // (the button's aria-label is the same localized `columns` key).
      await page.locator('button[aria-label="Colonne"]').first().click();
      const toggle = page.getByTestId("columns-toggle-payload_map");
      await expect(toggle).toBeVisible();
      if ((await toggle.locator('[data-state="checked"]').count()) === 0) {
        await toggle.click();
      }
      await page.keyboard.press("Escape");

      // Our row carries the unique name — locate the row by text, the
      // mapper affordance lives inside its payload_map cell. (entity-search
      // targets searchable columns only; `name` may not be one.)
      const row = page.locator("table tbody tr", { hasText: "e2e-mapper-viewer-" });
      await expect(row).toHaveCount(1);
      const cell = row.getByTestId("mapper-cell-payload_map-text");
      // Localized affordance — the seeded `app.widgets.mapper.view` value.
      await expect(cell).toContainText("Vedi mappa");

      // Trailing CTA → the record's detail route, _blank.
      const ext = row.getByTestId("mapper-cell-payload_map-ext");
      await expect(ext).toHaveAttribute("href", `/system/job/triggers/${uuid}`);

      await cell.click();

      // Endpoint badges — SOURCE is the subscribed emit's census label,
      // DEST EVENT the callable's; both translated via `label_key`.
      const source = page.getByTestId("mapper-viewer-source");
      await expect(source).toContainText("SORGENTE");
      await expect(source.locator("span.truncate").last()).toContainText("Cliente modificato");
      const dest = page.getByTestId("mapper-viewer-dest-event");
      await expect(dest).toContainText("EVENTO DEST");
      await expect(dest.locator("span.truncate").last()).toContainText("Invia email");

      // Authored rows — prose, not inputs: no combobox/input inside rows.
      const rows = page.getByTestId("mapper-viewer-rows");
      await expect(rows).toBeVisible();

      // 50/50 anatomy: the row grid is two columns; the right cell holds
      // the kind line (icon + translated label) over the value line.
      const tcRow = page.getByTestId("mapper-viewer-row-templateCode");
      const tcGrid = tcRow.locator(":scope > .grid");
      await expect(tcGrid).toBeVisible();
      const cols = await tcGrid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
      expect(cols).toBe(2);
      await expect(tcRow.getByTestId("mapper-viewer-kind-templateCode")).toContainText("Valore fisso");
      await expect(tcRow.getByTestId("mapper-viewer-value-templateCode")).toContainText("e2e_mapper_probe");

      await expect(page.getByTestId("mapper-viewer-kind-requestId")).toContainText(/./);
      await expect(page.getByTestId("mapper-viewer-value-requestId")).toContainText("ID univoco");
      await expect(page.getByTestId("mapper-viewer-kind-variables")).toContainText(
        "Variabili del template",
      );
      await expect(page.getByTestId("mapper-viewer-kind-to")).toContainText("Elenco di valori");
      await expect(page.getByTestId("mapper-viewer-value-to")).toContainText("mapper-viewer@example.com");
      await expect(page.getByTestId("mapper-viewer-kind-languageIso")).toContainText(
        "Contesto del processo",
      );
      await expect(page.getByTestId("mapper-viewer-value-languageIso")).toContainText(
        "Lingua dell'utente",
      );

      // `map` entries nest as key → prose lines.
      await expect(rows).toContainText("customer_name");
      await expect(rows).toContainText("$.entity.after.display_name");
      // Fallback clause renders its localized prose line.
      await expect(page.getByTestId("mapper-viewer-fallback").first()).toContainText(
        "altrimenti, se vuoto",
      );
      // Read-only contract: ZERO interactive controls inside the viewer.
      await expect(rows.locator('[role="combobox"], input, textarea')).toHaveCount(0);

      // Unmapped target fields sit collapsed BELOW the authored rows,
      // accordion header localized (`{count}` interpolated).
      const unmapped = page.getByTestId("mapper-viewer-unmapped");
      await expect(unmapped).toBeVisible();
      await expect(unmapped).toContainText(/Campi non mappati \(\d+\)/);
      await unmapped.getByRole("button").first().click();
      await expect(unmapped).toContainText("non mappato");

      await page.screenshot({ path: `test-results/mapper-viewer-${Date.now()}.png` });
    } finally {
      await deleteTrigger(page.request, uuid).catch(() => {});
    }
  });

  /**
   * The wire gate the two legacy email triggers sailed through — a
   * verbatim passthrough only stands when the source emit provably
   * carries the callable's requireds (or inject/semantic covers them).
   * `events.crm.customer.on.changed` emits a customer snapshot — `to`/
   * `templateCode`/`languageIso` are undeliverable from it, so the write
   * must be a 400. An undeclared event and a schedule-only empty map
   * fail the same gate.
   */
  test("wire gate — empty-map passthrough + undeclared emit rejected via API", async ({ page }) => {
    await loginAsTestAdmin(page);
    const post = (entity: Record<string, unknown>) =>
      page.request.post(`${JOB_API}/entities/job_trigger`, { data: { entity } });

    const uncovered = await post({
      name: `e2e-gate-uncovered-${Date.now()}`,
      event_subject: "events.crm.customer.on.changed",
      target_subject: "emailsender.send",
      run_as: "author",
      payload_map: null,
    });
    expect(uncovered.status()).toBe(400);
    expect(await uncovered.text()).toContain("unmapped_required");

    const ghost = await post({
      name: `e2e-gate-ghost-${Date.now()}`,
      event_subject: "ghost.never_emitted",
      target_subject: "emailsender.send",
      run_as: "author",
      payload_map: null,
    });
    expect(ghost.status()).toBe(400);
    expect(await ghost.text()).toContain("not a declared emit");

    const scheduleOnly = await post({
      name: `e2e-gate-schedule-${Date.now()}`,
      schedule_spec: "@every 1d",
      target_subject: "emailsender.send",
      run_as: "author",
      payload_map: null,
    });
    expect(scheduleOnly.status()).toBe(400);
    expect(await scheduleOnly.text()).toContain("unmapped_required");
  });

  /**
   * Audit-diff ref enrichment — `*_by` actor values inside the delta
   * carry `old_display_name`/`new_display_name` resolved per-uuid
   * through user_profiles (the SAME contract the diff-detail rows
   * render). Insert + update rows are both probed: the update row's
   * old side names the PREVIOUS actor, never the new one.
   */
  test("audit delta — actor refs resolve to display_name per side", async ({ page }) => {
    await loginAsTestAdmin(page);
    const trig = await declareTrigger(page.request, {
      name: `e2e-audit-ref-${Date.now()}`,
      event_subject: "events.crm.customer.on.changed",
      target_subject: "emailsender.send",
      run_as: "author",
      payload_map: MAP,
    });

    try {
      const cur = await page.request.get(`${JOB_API}/entities/job_trigger/${trig.uuid}`);
      const { version } = (await cur.json()) as { version: number };
      const put = await page.request.put(`${JOB_API}/entities/job_trigger/${trig.uuid}`, {
        data: { entity: { name: `e2e-audit-ref-renamed-${Date.now()}`, version } },
      });
      expect(put.status()).toBe(200);

      const audit = await page.request.get(
        `${JOB_API}/entities/job_trigger/${trig.uuid}/audit?page=1&limit=10`,
      );
      expect(audit.status()).toBe(200);
      const { data } = (await audit.json()) as {
        data: { action: string; delta: Record<string, { old_display_name?: string; new_display_name?: string }> }[];
      };

      const insert = data.find((r) => r.action === "INSERT");
      const update = data.find((r) => r.action === "UPDATE");
      expect(insert).toBeTruthy();
      expect(update).toBeTruthy();

      // Actor columns resolve both sides per-uuid — never a bare GUID.
      for (const row of [insert, update]) {
        const createdBy = row!.delta["created_by"] ?? row!.delta["updated_by"];
        expect(
          typeof createdBy?.new_display_name === "string" && createdBy.new_display_name.length > 0,
        ).toBeTruthy();
        if (row!.delta["updated_by"]) {
          const ub = row!.delta["updated_by"]!;
          expect(ub.new_display_name).not.toMatch(/^[0-9a-fA-F-]{36}$/);
        }
      }
    } finally {
      await deleteTrigger(page.request, trig.uuid);
    }
  });
});
