/**
 * sequences — the builtin `sequence` registry, mounted BY CONSTRUCTION:
 *
 *   makeServiceRoutes auto-mounts the dal-provided builtin decl on every
 *   module — no module-authored entity, service, meta, dto or route
 *
 * PRODUCT CONTRACT under test:
 *   - `/entities/sequence/meta` + `/list` serve on a module that authored
 *     NOTHING for them (crm has no sequence decl — the mount is the
 *     framework's)
 *   - the registry is governed CRUD: create → get → list → update →
 *     delete, schema-validated (pattern grammar gate, step ≠0, IANA tz)
 *   - `entities_ns` is the module's own schema (crm) — derived, never
 *     authored
 *   - counters are NOT routed — `sequence_counter` has no surface
 *
 * Residue-free: created rows are deleted at the end, pass or fail.
 */
import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";
import { extJsonParse } from "@primebrick/core/ext-json";

const CRM_BASE = "/svc/crm/api/v1/entities";
const NAME = `e2e_seq_${Date.now()}`;

// Serial — the suite mutates shared DB state (bound rows, live counters)
// and intercepts routes; parallel workers race the same rows and starve
// the single dev stack (same convention as the other DB-coupled specs).
test.describe.configure({ mode: "serial" });

test.describe("builtin sequence registry — mounted by construction", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestAdmin(page);
  });

  test("meta + list serve without a module-authored decl", async ({ page }) => {
    const r = await page.request.get(`${CRM_BASE}/sequence/meta`);
    expect(r.status()).toBe(200);
    const meta = extJsonParse<any>(await r.text());
    expect(meta.entity).toBe("sequence");
    expect(meta.entities_ns).toBe("crm"); // derived — never authored
    const keys = (meta.columns ?? []).map((c: any) => c.key);
    for (const k of ["name", "pattern", "step", "start", "tz", "description_key"]) {
      expect(keys, `column ${k}`).toContain(k);
    }
    expect(keys).not.toContain("code");
    expect(keys).not.toContain("label_key");
    // `description_key` declares `format:"i18n_key"` — the governed badge
    // cell (languages icon + resolved label, raw-key fallback) — and is
    // out of the default view but toggleable (`default_visible:false`,
    // never `hidden`).
    const byKey = new Map<string, any>((meta.columns ?? []).map((c: any) => [c.key, c]));
    expect(byKey.get("description_key")?.format).toBe("i18n_key");
    expect(byKey.get("description_key")?.default_visible).toBe(false);
    expect(byKey.get("description_key")?.hidden).not.toBe(true);
    // The audit group owns the allocation attribution columns.
    expect(byKey.get("last_alloc_at")?.audited).toBe(true);
    expect(byKey.get("last_alloc_by")?.audited).toBe(true);
    // `name` is NOT unique — no constraint may be declared on the meta.
    expect(byKey.get("name")?.unique).not.toBe(true);
    // Counter projection — virtual machine-state columns attached
    // post-query (value/step/next + both rendered emissions + attribution).
    for (const k of ["value_next", "value_actual", "emitted_next", "emitted_actual", "last_alloc_at", "last_alloc_by"]) {
      expect(keys, `virtual column ${k}`).toContain(k);
    }
    // Soft-delete reads as Disable/Enable on sequences (actions_overrides).
    for (const op of ["delete.single", "delete.bulk", "restore.single", "restore.bulk"]) {
      const a = (meta.actions ?? []).find((x: any) => x.op === op);
      expect(a?.label_key, `action ${op}`).toContain(".actions.");
    }

    const lr = await page.request.get(`${CRM_BASE}/sequence/list`);
    expect(lr.status()).toBe(200);
    const list = extJsonParse<any>(await lr.text());
    const rows: any[] = list?.rows ?? list?.items ?? [];
    expect(rows.length).toBeGreaterThan(0);
    // The projection is attached per served row — never-claimed sequences
    // show value_next = start and value_actual/emitted_actual = null.
    const r0 = rows[0];
    expect(r0).toHaveProperty("value_next");
    expect(r0).toHaveProperty("value_actual");
    expect(r0).toHaveProperty("emitted_next");
  });

  test("counters are machine state — no routed surface", async ({ page }) => {
    const r = await page.request.get(`${CRM_BASE}/sequence_counter/meta`);
    expect([400, 404]).toContain(r.status());
  });

  test("governed CRUD + validation gates", async ({ page }) => {
    // grammar gate — unparseable pattern must fail
    const bad = await page.request.post(`${CRM_BASE}/sequence`, {
      data: { entity: { name: NAME, pattern: "X-{n:3}-{n:3}", step: "1", start: "1" } },
    });
    expect(bad.status()).toBeGreaterThanOrEqual(400);

    const cr = await page.request.post(`${CRM_BASE}/sequence`, {
      data: {
        entity: {
          name: NAME,
          pattern: `E2E-{seq:5}`,
          step: "1",
          start: "1",
          tz: "Europe/Rome",
          description_key: "crm.entities.sequence.rows.e2e",
        },
      },
    });
    expect([200, 201], `create: ${await cr.text()}`).toContain(cr.status());
    const created = extJsonParse<any>(await cr.text());
    const uuid = created?.entity?.uuid ?? created?.uuid;
    expect(uuid).toBeTruthy();

    try {
      const get = await page.request.get(`${CRM_BASE}/sequence/${uuid}`);
      expect(get.status()).toBe(200);
      const row = extJsonParse<any>(await get.text());
      expect(row.entity?.name ?? row.name).toBe(NAME);
      expect(String(row.entity?.step ?? row.step)).toMatch(/^1n?$/);

      // step=0 must fail
      const upd = await page.request.put(`${CRM_BASE}/sequence/${uuid}`, {
        data: { entity: { version: String(row.entity?.version ?? row.version), step: "0" } },
      });
      expect(upd.status()).toBeGreaterThanOrEqual(400);

      const list = await page.request.get(`${CRM_BASE}/sequence/list?search=${NAME}`);
      expect(list.status()).toBe(200);
      expect(await list.text()).toContain(NAME);
    } finally {
      const row = extJsonParse<any>(await (await page.request.get(`${CRM_BASE}/sequence/${uuid}`)).text());
      const version = String(row.entity?.version ?? row.version);
      // `version` rides the QUERY string on governed writes — a body field
      // is ignored (`VERSION_REQUIRED`); an unasserted cleanup call here
      // is how e2e_seq_* residue accumulated.
      await page.request.delete(`${CRM_BASE}/sequence/${uuid}?version=${version}`);
    }
  });

  test("soft-delete cascade — deleted seq fails allocation (deleted excluded wired)", async ({
    page,
  }) => {
    const name = `e2e_seq_del_${Date.now()}`;
    const cr = await page.request.post(`${CRM_BASE}/sequence`, {
      data: { entity: { name, pattern: "DEL-{seq:4}", step: "1", start: "1" } },
    });
    expect([200, 201], `create: ${await cr.text()}`).toContain(cr.status());
    const created = extJsonParse<any>(await cr.text());
    const uuid = created?.entity?.uuid ?? created?.uuid;
    expect(uuid).toBeTruthy();

    const row = extJsonParse<any>(await (await page.request.get(`${CRM_BASE}/sequence/${uuid}`)).text());
    const del = await page.request.delete(
      `${CRM_BASE}/sequence/${uuid}?version=${row.entity?.version ?? row.version}`,
    );
    expect(del.status()).toBe(200);

    try {
      // A write carrying `{seq:{uuid}}` MUST fail — the registry lookup
      // filters `deleted_at IS NULL` → SequenceNotFoundError, no silent
      // fallback: a stale directive erroring loudly IS the contract.
      const w = await page.request.post(`${CRM_BASE}/customer`, {
        data: {
          entity: { code: { seq: { uuid } }, display_name: "E2E SeqDel Probe", status: "ACTIVE" },
        },
      });
      const body = await w.text();
      expect(w.status()).toBeGreaterThanOrEqual(400);
      expect(body).toMatch(/SequenceNotFound|SEQUENCE_NOT_FOUND/);
    } finally {
      // Restore resurrects the row AND the persisted counter state —
      // counters are never deleted with the definition.
      const rr = await page.request.post(`${CRM_BASE}/sequence/${uuid}/restore?version=2`);
      expect(rr.status()).toBe(200);
      const row2 = extJsonParse<any>(
        await (await page.request.get(`${CRM_BASE}/sequence/${uuid}`)).text(),
      );
      await page.request.delete(
        `${CRM_BASE}/sequence/${uuid}?version=${row2.entity?.version ?? row2.version}`,
      );
    }
  });

  test("uuid is the sole sequence identity — {seq:{code}} is rejected", async ({ page }) => {
    // `{seq:{code}}` was REMOVED from the directive grammar (TIC census:
    // zero legitimate persisted consumers — the alias was input sugar
    // that undermined uuid-only identity). A write naming a sequence by
    // `code`/`name` must fail validation loudly, never be resolved.
    const w = await page.request.post(`${CRM_BASE}/customer`, {
      data: {
        entity: {
          code: { seq: { code: "customers.code" } },
          display_name: "E2E SeqCode Probe",
          status: "ACTIVE",
        },
      },
    });
    const body = await w.text();
    expect(w.status(), body).toBeGreaterThanOrEqual(400);
    expect(body).not.toMatch(/CUST-\d{5}/);
    // The uuid form is the identity contract — assert it is accepted on
    // the bound field's own default sequence (resolved via list).
    const lr = await page.request.get(`${CRM_BASE}/sequence/list?search=customers.code`);
    const rows = extJsonParse<any>(await lr.text())?.rows ?? [];
    const bound = rows.find((r: any) => r.name === "customers.code");
    expect(bound?.uuid).toBeTruthy();
    const ok = await page.request.post(`${CRM_BASE}/customer`, {
      data: {
        entity: {
          code: { seq: { uuid: bound.uuid } },
          display_name: "E2E SeqUuid Probe",
          status: "ACTIVE",
        },
      },
    });
    const okBody = await ok.text();
    expect(ok.status(), okBody).toBe(201);
    const created = extJsonParse<any>(okBody);
    try {
      expect(String(created.code)).toMatch(/^CUST-\d{5}$/);
    } finally {
      const fresh = extJsonParse<any>(
        await (await page.request.get(`${CRM_BASE}/customer/${created.uuid}`)).text(),
      );
      await page.request.delete(`${CRM_BASE}/customer/${created.uuid}?version=${fresh.version}`);
    }
  });

  test("seq-bound column: bulk editor mounts SequenceInput — select + generate write", async ({
    page,
  }) => {
    test.setTimeout(60000);
    /* `customers.code` is @SequenceField-bound: `format:"sequence"` must
     * resolve the dedicated widget (readonly literal display + assist
     * popover), and the value crossing the wire is a DIRECTIVE — never a
     * literal. `update.bulk` rides the same governed confirm as every op.
     * Residue-free: the two ad-hoc customers are soft-deleted in finally. */
    const runId = `E2E SeqWidget ${Date.now()}`;
    const mk = async (name: string) => {
      const res = await page.request.post(`${CRM_BASE}/customer`, {
        data: { entity: { display_name: name, status: "ACTIVE" } },
      });
      expect(res.status()).toBe(201);
      const row = extJsonParse<any>(await res.text());
      expect(String(row.code)).toMatch(/^CUST-\d{5}$/);
      return row;
    };
    const a = await mk(`${runId} A`);
    const b = await mk(`${runId} B`);
    try {
      await page.goto("/crm/customers", { waitUntil: "domcontentloaded" });
      await expect(page.locator("table")).toBeVisible({ timeout: 15000 });
      await page.getByTestId("bulk-actions-toggle").click();
      for (const name of [`${runId} A`, `${runId} B`]) {
        const row = page.locator("tr", { hasText: name });
        await expect(row).toBeVisible({ timeout: 15000 });
        await row.getByRole("checkbox", { name: "select row" }).click();
      }
      await page.getByTestId("entity-bulk-edit").click();
      await expect(page.getByTestId("bulk-editor-summary")).toBeVisible();

      await page.getByTestId("bulk-editor-add-field").click();
      const searchInput = page.locator("[data-slot='popover-content'] input").first();
      await searchInput.fill("code");
      await page.getByRole("option", { name: /^code$/i }).first().click();
      const field = page.getByTestId("bulk-editor-field-code");
      const widget = field.getByTestId("sequence-input");
      await expect(widget).toBeVisible({ timeout: 5000 });
      // bulk on rows with different codes is a mixed surface — the served
      // literals never leak into the directive slot: it stays empty.
      await expect(field.locator("input").first()).toHaveValue("");

      // ── select mode — combobox over the module-local registry ──
      await field.getByTestId("sequence-input-assist").click();
      await page.getByTestId("sequence-input-mode-select").click();
      const combo = page.getByTestId("sequence-input-select");
      await expect(combo).toBeVisible({ timeout: 5000 });
      await combo.click();
      // The bound sequence's `name` is the bound field name
      // (`customers.code`) — `uuid` is the identity on the wire, `name`
      // is what the operator reads.
      const opt = page
        .locator("[data-state='open'] [role='option']:visible")
        .filter({ hasText: "customers.code" })
        .first();
      await expect(opt).toBeVisible({ timeout: 10000 });
      await opt.click();
      await page.getByTestId("sequence-input-apply").click();
      await expect(field.locator("input").first()).toHaveValue("customers.code");
      // forecast strip — read-only `next` rendered from the registry row
      await expect(page.getByTestId("sequence-input-next")).toHaveText(/^CUST-\d{5}$/, {
        timeout: 10000,
      });

      // ── generate mode — inline pattern directive ──
      await field.getByTestId("sequence-input-assist").click();
      await page.getByTestId("sequence-input-mode-generate").click();
      await page.getByTestId("sequence-input-pattern").fill("E2E-{seq:4}");
      await page.getByTestId("sequence-input-start").fill("9001");
      await page.getByTestId("sequence-input-apply").click();
      await expect(field.locator("input").first()).toHaveValue("E2E-9001");

      await page.getByTestId("bulk-editor-apply").click();
      const confirmBtn = page.getByTestId("entity-op-confirm");
      await expect(confirmBtn).toBeVisible({ timeout: 5000 });
      await confirmBtn.click();

      // Server truth — both rows carry the SAME expr-sequence allocation:
      // {pattern} directives materialize a shared expr registry row, so the
      // two bulk claims are CONTIGUOUS on one counter. The counter persists
      // across runs — assert the contract (shape + adjacency), not the seed.
      let codes: string[] = [];
      await expect
        .poll(
          async () => {
            const ra = extJsonParse<any>(
              await (await page.request.get(`${CRM_BASE}/customer/${a.uuid}`)).text(),
            );
            const rb = extJsonParse<any>(
              await (await page.request.get(`${CRM_BASE}/customer/${b.uuid}`)).text(),
            );
            codes = [String(ra.code), String(rb.code)].sort();
            return codes.every((c) => /^E2E-\d{4}$/.test(c) && parseInt(c.slice(4), 10) >= 9001);
          },
          { timeout: 15000 },
        )
        .toBe(true);
      const nums = codes.map((c) => parseInt(c.slice(4), 10));
      expect(nums[1]! - nums[0]!).toBe(1);
    } finally {
      for (const row of [a, b]) {
        const fresh = extJsonParse<any>(
          await (await page.request.get(`${CRM_BASE}/customer/${row.uuid}`)).text(),
        );
        await page.request.delete(
          `${CRM_BASE}/customer/${row.uuid}?version=${fresh.version}`,
        );
      }
    }
  });

  test("settings list page renders — EntityTablePage archetype, sequence_set CTA wired", async ({
    page,
  }) => {
    // is_reserved platform rows (api gateway) own no dict — the shell/ELT
    // must never request one. Intercept and count: any fetch is a bug.
    let apiFetches = 0;
    await page.route("**/system/translations/api/*", (r) => {
      apiFetches++;
      return r.continue();
    });
    // The list surface comes up — the builtin list endpoint answers.
    // Attach the waiter BEFORE navigating: goto fires the fetch.
    const listReq = page.waitForResponse(
      (r) => r.url().includes("/entities/sequence/list") && r.status() === 200,
      { timeout: 15_000 },
    );
    await page.goto("/crm/settings/sequences");
    await listReq;
    // The leaf label must resolve via the parent crm dict — never the raw key
    await expect(page.locator("body")).not.toContainText("crm.settings.nav.sequences", {
      timeout: 15_000,
    });
    // kind:"list" → the EntityTablePage archetype: a real table with the
    // PoC registry row, not the settings-dictionary anatomy.
    await expect(page.locator("table")).toBeVisible({ timeout: 30_000 });
    // The rendered columns ARE the governed surface — order and labels
    // asserted exactly as authored on the decl (audit band last;
    // description_key is default_visible:false → never in the head).
    const headTexts = (await page.locator("table thead th").allTextContents())
      .map((t) => t.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    expect(headTexts.slice(0, 9)).toEqual([
      "Name",
      "Increment",
      "Initial Value",
      "Current",
      "Next",
      "Pattern",
      "Current Sequence",
      "Next Sequence",
      "Time zone",
    ]);
    expect(headTexts).not.toContain("Description key");
    const allocAt = headTexts.indexOf("Last allocated at");
    const allocBy = headTexts.indexOf("Last allocated by");
    expect(allocAt).toBeGreaterThan(headTexts.indexOf("Time zone"));
    expect(allocBy).toBe(allocAt + 1);
    const row = page.locator("table tbody tr", { hasText: "customers.code" }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    // The entity_op synthesis lands the `sequence_set` CTA on the row kebab —
    // the governed set-counter surface exists by construction.
    const kebab = row.locator("td").last().getByRole("button").first();
    await kebab.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const cta = menu.getByText("Set counter");
    await expect(cta).toBeVisible();

    // `sequence_set` is parametric — the authored dialog collects `next`,
    // informed by `sequence-analyze` (the strip mounts live stats).
    await cta.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const analysis = dialog.getByTestId("sequence-set-analysis");
    await expect(analysis).toContainText("Values in use", { timeout: 15000 });
    // `next` prefills from suggested_start — operator can override.
    const nextInput = dialog.getByTestId("sequence-set-next");
    await expect(nextInput).not.toHaveValue("", { timeout: 10000 });

    // Submit rides the governed chain — the meta-served confirm gate opens
    // (confirm_key → the generic gated-op DeleteDialog anatomy), cancelled
    // here: the MFA step-up + counter write paths are covered by the
    // dal/service suites.
    await dialog.getByTestId("sequence-set-submit").click();
    const confirmDialog = page.getByRole("dialog").last();
    await expect(confirmDialog.getByRole("button", { name: "Cancel" })).toBeVisible({
      timeout: 10000,
    });
    await confirmDialog.getByRole("button", { name: "Cancel" }).click();
    // The input dialog survives a cancelled confirm — close it too.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10000 });
    expect(apiFetches).toBe(0);
  });

  /**
   * `format:"i18n_key"` cells render the governed translation badge —
   * the same source/destination anatomy `nats_subject` owns: languages
   * icon + `$t(key)` label inside a Badge, raw key in the tooltip, and
   * the raw key itself when no translation resolves.
   */
  test("i18n_key cells render the governed translation badge — translated + raw fallback", async ({
    page,
  }) => {
    // Translated case — `description_key` points at a seeded key: the
    // badge must show the RESOLVED translation, never the raw key.
    const name = `e2e_i18n_${Date.now()}`;
    const cr = await page.request.post(`${CRM_BASE}/sequence`, {
      data: {
        entity: {
          name,
          pattern: `I18N-{seq:3}`,
          step: "1",
          start: "1",
          description_key: "crm.entities.sequence.fields.name", // seeded → "Name"
        },
      },
    });
    expect([200, 201], `create: ${await cr.text()}`).toContain(cr.status());
    const uuid = extJsonParse<any>(await cr.text())?.entity?.uuid;
    // Fallback case — an untranslated key resolves to itself: the badge
    // renders the raw `description_key` (mono), never an invented label.
    const fbName = `e2e_i18n_fb_${Date.now()}`;
    const fbKey = `crm.entities.sequence.rows.${fbName}`;
    const fb = await page.request.post(`${CRM_BASE}/sequence`, {
      data: {
        entity: {
          name: fbName,
          pattern: `FB-{seq:3}`,
          step: "1",
          start: "1",
          description_key: fbKey,
        },
      },
    });
    expect([200, 201], `fb create: ${await fb.text()}`).toContain(fb.status());
    const fbUuid = extJsonParse<any>(await fb.text())?.entity?.uuid;
    try {
      const listReq = page.waitForResponse(
        (r) => r.url().includes("/entities/sequence/list") && r.status() === 200,
        { timeout: 15_000 },
      );
      await page.goto("/crm/settings/sequences");
      await listReq;

      // `description_key` is `default_visible:false` but toggleable — the
      // column picker must surface it and the badge cell renders once on.
      await page.getByTestId("elt-column-selector").click();
      const descToggle = page.getByTestId("columns-toggle-description_key");
      await expect(descToggle).toBeVisible({ timeout: 10_000 });
      await descToggle.click();
      await page.keyboard.press("Escape");

      // Translated badge — icon + resolved label, raw key on the tooltip.
      await page.getByTestId("entity-search").locator("input").fill(name);
      const row = page.locator("table tbody tr", { hasText: name }).first();
      await expect(row).toBeVisible({ timeout: 15_000 });
      const badge = row
        .locator('td [data-slot="badge"]')
        .filter({ has: page.locator("svg") });
      await expect(badge).toContainText("Name");
      await expect(badge).not.toContainText("crm.entities.sequence.fields.name");
      await badge.hover();
      await expect(page.locator("[data-tooltip-content]")).toContainText(
        "crm.entities.sequence.fields.name",
        { timeout: 5_000 },
      );

      // Raw fallback — the untranslated key renders itself, icon included.
      await page.getByTestId("entity-search").locator("input").fill(fbName);
      const fbRow = page.locator("table tbody tr", { hasText: fbName }).first();
      await expect(fbRow).toBeVisible({ timeout: 15_000 });
      const fbBadge = fbRow.locator('td [data-slot="badge"]').filter({ hasText: fbKey });
      await expect(fbBadge).toBeVisible();
      await expect(fbBadge.locator("svg")).toBeVisible();
    } finally {
      // `version` is required on the delete route — fresh creates are v1.
      if (uuid) await page.request.delete(`${CRM_BASE}/sequence/${uuid}?version=1`);
      if (fbUuid) await page.request.delete(`${CRM_BASE}/sequence/${fbUuid}?version=1`);
    }
  });

  /**
   * TIC review — the builtin list's side paths must route to the OWNING
   * service (`/svc/crm`), never the last service the flat census map
   * happens to expose for `sequence` (they mount on EVERY service —
   * last-wins picked `emailsender` and every side path 500'd):
   *   - row delete → confirm → DELETE /svc/crm → 200 → row gone
   *   - version history → GET /svc/crm/:uuid/audit → 200 → timeline
   *   - Modifica → entity.record sheet in edit mode → PUT /svc/crm → 200
   *   - bulk delete CTA exists (`delete.bulk` permission declared) and
   *     dispatches POST /svc/crm/bulk-delete → 200
   */
  /**
   * Stale persisted state must SELF-HEAL — a renamed column (`code`→`name`)
   * leaves `pb:*:list:sort` pointing at a key the wire now rejects closed.
   * Two layers: bootstrap sanitize drops it before the first call; a
   * mid-session rename (stale cached meta) heals via meta re-fetch +
   * re-sanitize + exactly one retry.
   */
  test("stale persisted sort_key self-heals at bootstrap — page stays usable", async ({
    page,
  }) => {
    const listCalls: number[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/entities/sequence/list")) listCalls.push(r.status());
    });
    // Pre-rename profile: the persisted sort still references `code`.
    await page.addInitScript(() =>
      sessionStorage.setItem(
        "pb:crm-sequence:list:sort",
        JSON.stringify({ key: "code", dir: "asc" }),
      ),
    );
    await page.goto("/crm/settings/sequences", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 20_000 });
    // No 400 ever shipped — the stale key was dropped pre-fetch and the
    // healed default sort persisted over the poisoned slot.
    expect(listCalls.filter((s) => s >= 400)).toEqual([]);
    const healed = await page.evaluate(() =>
      sessionStorage.getItem("pb:crm-sequence:list:sort"),
    );
    expect(healed).not.toContain('"code"');
  });

  test("mid-session meta staleness heals — VALIDATION 400 → meta re-fetch → one retry", async ({
    page,
  }) => {
    let metaFetches = 0;
    const listStatuses: number[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/entities/sequence/meta")) metaFetches++;
      if (r.url().includes("/entities/sequence/list")) listStatuses.push(r.status());
    });
    // First list call answers the fail-closed field-key rejection — the
    // exact wire shape the DAL emits for a stale `sort_key` (`internal_code`
    // carries the DAL code, `detail` the message). The page must
    // re-download meta, re-sanitize, retry once, and render — never loop.
    let poisoned = true;
    await page.route("**/entities/sequence/list**", (route) => {
      if (!poisoned) return route.continue();
      poisoned = false;
      return route.fulfill({
        status: 400,
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "/errors/validation-error",
          title: "Validation error",
          status: 400,
          detail: 'Invalid sort_key "code" for SequenceEntity — must be one of: created_at, name',
          internal_code: "VALIDATION",
          severity: "MEDIUM",
        }),
      });
    });
    // Attach the 200 waiter BEFORE goto — the retried response must be
    // observed through the same event waitForResponse listens to, or the
    // status assertions race the CDP delivery of `page.on("response")`.
    const healedList = page.waitForResponse(
      (r) => r.url().includes("/entities/sequence/list") && r.status() === 200,
      { timeout: 20_000 },
    );
    await page.goto("/crm/settings/sequences", { waitUntil: "domcontentloaded" });
    await healedList;
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 20_000 });
    expect(listStatuses.filter((s) => s === 400)).toHaveLength(1);
    expect(metaFetches).toBeGreaterThanOrEqual(2);
  });

  test("non-field VALIDATION 400 never heals — no retry, no meta refetch", async ({
    page,
  }) => {
    let metaFetches = 0;
    const listStatuses: number[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/entities/sequence/meta")) metaFetches++;
      if (r.url().includes("/entities/sequence/list")) listStatuses.push(r.status());
    });
    // An envelope-param rejection (`page_size` ceiling) is NOT a
    // stale-meta signal — healing cannot fix it, so the page must surface
    // the error without a meta refetch or a retry (the loop the guard
    // exists to prevent).
    await page.route("**/entities/sequence/list**", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "/errors/validation-error",
          title: "Validation error",
          status: 400,
          detail: 'Invalid page_size "999" — maximum is 250',
          internal_code: "VALIDATION",
          severity: "MEDIUM",
        }),
      }),
    );
    const firstList = page.waitForResponse(
      (r) => r.url().includes("/entities/sequence/list"),
      { timeout: 20_000 },
    );
    await page.goto("/crm/settings/sequences", { waitUntil: "domcontentloaded" });
    await firstList;
    // Give any erroneous heal a moment to fire before asserting silence.
    await page.waitForTimeout(3_000);
    expect(listStatuses).toEqual([400]);
    expect(metaFetches).toBe(1);
  });

  test("side paths route to the owning service — delete, audit, sheet edit, bulk", async ({
    page,
  }) => {
    const mkSeq = async (suffix: string) => {
      const r = await page.request.post(`${CRM_BASE}/sequence`, {
        data: {
          entity: {
            name: `e2e_side_${suffix}_${Date.now()}`,
            pattern: `E2ES-${suffix}-{seq:4}`,
            step: "1",
            start: "1",
          },
        },
      });
      expect(r.status()).toBe(201);
      return (await r.text().then((t) => extJsonParse<any>(t))) as Record<string, unknown>;
    };
    const seqEdit = await mkSeq("e");
    const seqDel = await mkSeq("d");
    const seqBulk = await mkSeq("b");

    /** Track every entity-API request — nothing may leave `/svc/crm`. */
    const apiUrls: string[] = [];
    page.on("request", (r) => {
      const u = r.url();
      if (u.includes("/entities/sequence")) apiUrls.push(u);
    });

    await page.goto("/crm/settings/sequences");
    await expect(page.locator("table")).toBeVisible({ timeout: 30_000 });
    const byName = (name: string) =>
      page.locator("table tbody tr", { hasText: name }).first();
    /** Registry rows accumulate across runs — server-side `search`
     *  narrows to the fixture row instead of relying on page-1 sort. */
    const searchFor = async (name: string) => {
      const listReq = page.waitForResponse(
        (r) => r.url().includes("/entities/sequence/list") && r.status() === 200,
        { timeout: 15_000 },
      );
      await page.getByTestId("entity-search").locator("input").fill(name);
      await listReq;
    };

    // ── Modifica → entity.record sheet in edit mode → save ────────────
    await searchFor(String(seqEdit.name));
    const editRow = byName(String(seqEdit.name));
    await expect(editRow).toBeVisible({ timeout: 15_000 });
    await editRow.locator("td").last().getByRole("button").first().click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const putReq = page.waitForResponse(
      (r) =>
        r.url().includes("/svc/crm/api/v1/entities/sequence/") &&
        r.request().method() === "PUT" &&
        r.status() === 200,
      { timeout: 20_000 },
    );
    await menu.getByText(/modifica|edit/i).first().click();
    // The record sheet opens straight into edit mode — step is editable.
    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    const stepInput = sheet.locator("#record-sheet-field-step");
    await expect(stepInput).toBeEnabled({ timeout: 10_000 });
    await stepInput.fill("2");
    // Save — the governed update path, on the owning service.
    await page.getByTestId("entity-record-sheet-save").click();
    await putReq;

    // ── Version history → audit on the owning service ────────────────
    await page.keyboard.press("Escape");
    await searchFor(String(seqEdit.name));
    const auditRow = byName(String(seqEdit.name));
    await auditRow.locator("td").last().getByRole("button").first().click();
    const auditReq = page.waitForResponse(
      (r) =>
        r.url().includes("/svc/crm/api/v1/entities/sequence/") &&
        r.url().includes("/audit") &&
        r.status() === 200,
      { timeout: 20_000 },
    );
    await page.getByRole("menu").getByText(/edit log|version history/i).first().click();
    await auditReq;
    await page.keyboard.press("Escape");

    // ── Row delete → confirm → DELETE on the owning service ──────────
    await searchFor(String(seqDel.name));
    const delRow = byName(String(seqDel.name));
    await delRow.locator("td").last().getByRole("button").first().click();
    const delReq = page.waitForResponse(
      (r) =>
        r.url().includes("/svc/crm/api/v1/entities/sequence/") &&
        r.request().method() === "DELETE" &&
        r.status() === 200,
      { timeout: 20_000 },
    );
    // Soft-delete presents as "Disable" on sequences (actions_overrides —
    // same semantics as job_trigger: exec-stop + destructive).
    await page.getByRole("menu").getByText(/disabilita|disable|elimina|delete/i).first().click();
    const confirm = page.getByRole("dialog").last();
    await expect(confirm).toBeVisible({ timeout: 10_000 });
    // Confirm the destructive op — the dialog must CLEAR (no perpetual
    // busy: the request resolves on the owning schema).
    const confirmBtn = confirm.getByRole("button", { name: /disabilita|disable|elimina|delete|conferma|confirm/i }).last();
    await confirmBtn.click();
    await delReq;
    await expect(confirm).toBeHidden({ timeout: 10_000 });
    await expect(delRow).toBeHidden({ timeout: 10_000 });

    // ── Bulk delete CTA present + governed dispatch ──────────────────
    await searchFor(String(seqBulk.name));
    const bulkRow = byName(String(seqBulk.name));
    await bulkRow.getByRole("checkbox", { name: "select row" }).click();
    const bulkReq = page.waitForResponse(
      (r) =>
        r.url().includes("/svc/crm/api/v1/entities/sequence/bulk-delete") &&
        r.status() === 200,
      { timeout: 20_000 },
    );
    const bulkCta = page.getByTestId("entity-bulk-delete");
    await expect(bulkCta).toBeVisible({ timeout: 10_000 });
    await bulkCta.click();
    const bulkConfirm = page.getByRole("dialog").last();
    await expect(bulkConfirm).toBeVisible({ timeout: 10_000 });
    await bulkConfirm.getByRole("button", { name: /disabilita|disable|elimina|delete|conferma|confirm/i }).last().click();
    await bulkReq;

    // The residual check — no entity call may have left the owning svc.
    for (const u of apiUrls) expect(u).toContain("/svc/crm/");

    // Cleanup — the edit/restored fixtures (soft-deleted ones too).
    for (const s of [seqEdit, seqDel, seqBulk]) {
      const g = await page.request.get(`${CRM_BASE}/sequence/${s.uuid}`);
      if (!g.ok()) continue;
      const row = extJsonParse<any>(await g.text());
      await page.request.delete(`${CRM_BASE}/sequence/${s.uuid}?version=${row.version}`);
    }
  });
});
