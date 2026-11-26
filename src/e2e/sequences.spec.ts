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
import { extJsonParse, extJsonStringify } from "@primebrick/core/ext-json";

const CRM_BASE = "/svc/crm/api/v1/entities";
const NAME = `e2e_seq_${Date.now()}`;

type SeqCol = { key: string; format?: string; [k: string]: unknown };
type SeqMeta = {
  entity?: string;
  entities_ns?: string;
  columns?: SeqCol[];
  actions?: Array<{ op: string; label_key?: string }>;
};
type SeqRow = { entity?: Record<string, unknown>; version?: unknown; uuid?: string; name?: string; [k: string]: unknown };

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
    const meta = extJsonParse<SeqMeta>(await r.text());
    expect(meta.entity).toBe("sequence");
    expect(meta.entities_ns).toBe("crm"); // derived — never authored
    const keys = (meta.columns ?? []).map((c) => c.key);
    for (const k of ["name", "pattern", "step", "start", "tz", "description_key"]) {
      expect(keys, `column ${k}`).toContain(k);
    }
    expect(keys).not.toContain("code");
    expect(keys).not.toContain("label_key");
    // `description_key` declares `format:"i18n_key"` — the governed badge
    // cell (languages icon + resolved label, raw-key fallback) — and is
    // out of the default view but toggleable (`default_visible:false`,
    // never `hidden`).
    const byKey = new Map<string, SeqCol>((meta.columns ?? []).map((c) => [c.key, c]));
    expect(byKey.get("description_key")?.format).toBe("i18n_key");
    expect(byKey.get("description_key")?.default_visible).toBe(false);
    expect(byKey.get("description_key")?.hidden).not.toBe(true);
    // `tz` is a governed IANA vocabulary — combobox over the closed
    // `iana.tzones` source, never free text; `defaultSql:"'UTC'"` derives
    // the served prefill (constant literal — same channel as step/start).
    expect(byKey.get("tz")?.options_source).toBe("iana.tzones");
    expect(byKey.get("tz")?.default).toBe("UTC");
    expect(byKey.get("tz")?.allow_create).not.toBe(true);
    // The audit group owns the allocation attribution columns.
    expect(byKey.get("last_alloc_at")?.audited).toBe(true);
    expect(byKey.get("last_alloc_by")?.audited).toBe(true);
    // List anatomy: `name` is the only sticky primary column; row-owned
    // sez slots are first-class visible data before increment/start; the
    // cadence stays visible while downstream revive lifecycle columns are
    // toggleable but absent by default.
    for (const k of ["name", "sez", "sez2", "sez3", "step", "start"]) {
      expect(keys, `primary column ${k}`).toContain(k);
    }
    expect(keys.indexOf("sez")).toBeGreaterThan(keys.indexOf("name"));
    expect(keys.indexOf("sez")).toBeLessThan(keys.indexOf("step"));
    expect(keys.indexOf("sez3")).toBeLessThan(keys.indexOf("step"));
    expect(keys.indexOf("tz")).toBeLessThan(keys.indexOf("revive_every"));
    expect(byKey.get("name")?.sticky).toBe(true);
    for (const k of ["sez", "sez2", "sez3"]) {
      expect(byKey.get(k)?.sticky).toBe(false);
      expect(byKey.get(k)?.default_visible).not.toBe(false);
    }
    expect(byKey.get("revive_every")?.default_visible).not.toBe(false);
    for (const k of ["default_from", "revive_slot", "revive_grace", "expire_at"]) {
      expect(byKey.get(k)?.default_visible).toBe(false);
      expect(byKey.get(k)?.hidden).not.toBe(true);
    }
    // `name` is NOT unique — no constraint may be declared on the meta.
    expect(byKey.get("name")?.unique).not.toBe(true);
    // Counter projection — virtual machine-state columns attached
    // post-query (value/step/next + both rendered emissions + attribution).
    for (const k of ["value_next", "value_actual", "emitted_next", "emitted_actual", "last_alloc_at", "last_alloc_by"]) {
      expect(keys, `virtual column ${k}`).toContain(k);
    }
    // Soft-delete reads as Disable/Enable on sequences (actions_overrides).
    for (const op of ["delete.single", "delete.bulk", "restore.single", "restore.bulk"]) {
      const a = (meta.actions ?? []).find((x) => x.op === op);
      expect(a?.label_key, `action ${op}`).toContain(".actions.");
    }

    const lr = await page.request.get(`${CRM_BASE}/sequence/list`);
    expect(lr.status()).toBe(200);
    const list = extJsonParse<{ rows?: Array<Record<string, unknown>>; items?: Array<Record<string, unknown>> }>(await lr.text());
    const rows: Array<Record<string, unknown>> = list?.rows ?? list?.items ?? [];
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
    const created = extJsonParse<SeqRow>(await cr.text());
    const uuid = created?.entity?.uuid ?? created?.uuid;
    expect(uuid).toBeTruthy();

    try {
      const get = await page.request.get(`${CRM_BASE}/sequence/${uuid}`);
      expect(get.status()).toBe(200);
      const row = extJsonParse<SeqRow>(await get.text());
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
      const row = extJsonParse<SeqRow>(await (await page.request.get(`${CRM_BASE}/sequence/${uuid}`)).text());
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
    const created = extJsonParse<SeqRow>(await cr.text());
    const uuid = created?.entity?.uuid ?? created?.uuid;
    expect(uuid).toBeTruthy();
    // `tz` omitted on the wire → `defaultSql:"'UTC'"` fills the gap —
    // NOT NULL column, the served value is never null.
    expect(created?.entity?.tz ?? created?.tz).toBe("UTC");

    const row = extJsonParse<SeqRow>(await (await page.request.get(`${CRM_BASE}/sequence/${uuid}`)).text());
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
      const row2 = extJsonParse<SeqRow>(
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
    const rows = extJsonParse<{ rows?: Array<{ name?: string; uuid?: string }> }>(await lr.text())?.rows ?? [];
    const bound = rows.find((r) => r.name === "customers.code");
    expect(bound?.uuid).toBeTruthy();
    const ok = await page.request.post(`${CRM_BASE}/customer`, {
      data: {
        entity: {
          code: { seq: { uuid: bound!.uuid } },
          display_name: "E2E SeqUuid Probe",
          status: "ACTIVE",
        },
      },
    });
    const okBody = await ok.text();
    expect(ok.status(), okBody).toBe(201);
    const created = extJsonParse<SeqRow>(okBody);
    try {
      expect(String(created.code)).toMatch(/^CUST-\d{5}$/);
    } finally {
      const fresh = extJsonParse<SeqRow>(
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
      const row = extJsonParse<SeqRow>(await res.text());
      expect(String(row.code)).toMatch(/^CUST-\d{5}$/);
      return row;
    };
    const a = await mk(`${runId} A`);
    const b = await mk(`${runId} B`);
    try {
      await page.goto("/crm/customers", { waitUntil: "domcontentloaded" });
      await expect(page.locator("table")).toBeVisible({ timeout: 5_000 });
      await page.getByTestId("bulk-actions-toggle").click();
      for (const name of [`${runId} A`, `${runId} B`]) {
        const row = page.locator("tr", { hasText: name });
        await expect(row).toBeVisible({ timeout: 5_000 });
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
      await expect(opt).toBeVisible({ timeout: 5_000 });
      await opt.click();
      await page.getByTestId("sequence-input-apply").click();
      await expect(field.locator("input").first()).toHaveValue("customers.code");
      // forecast strip — read-only `next` rendered from the registry row
      await expect(page.getByTestId("sequence-input-next")).toHaveText(/^CUST-\d{5}$/, {
        timeout: 5_000,
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
            const ra = extJsonParse<SeqRow>(
              await (await page.request.get(`${CRM_BASE}/customer/${a.uuid}`)).text(),
            );
            const rb = extJsonParse<SeqRow>(
              await (await page.request.get(`${CRM_BASE}/customer/${b.uuid}`)).text(),
            );
            codes = [String(ra.code), String(rb.code)].sort();
            return codes.every((c) => /^E2E-\d{4}$/.test(c) && parseInt(c.slice(4), 10) >= 9001);
          },
          { timeout: 5_000 },
        )
        .toBe(true);
      const nums = codes.map((c) => parseInt(c.slice(4), 10));
      expect(nums[1]! - nums[0]!).toBe(1);
    } finally {
      for (const row of [a, b]) {
        const fresh = extJsonParse<SeqRow>(
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
      { timeout: 5_000 },
    );
    await page.goto("/crm/settings/sequences");
    await listReq;
    // The leaf label must resolve via the parent crm dict — never the raw key
    await expect(page.locator("body")).not.toContainText("crm.settings.nav.sequences", {
      timeout: 5_000,
    });
    // kind:"list" → the EntityTablePage archetype: a real table with the
    // PoC registry row, not the settings-dictionary anatomy.
    await expect(page.locator("table")).toBeVisible({ timeout: 5_000 });
    // The rendered columns ARE the governed surface — order and labels
    // asserted exactly as authored on the decl (audit band last;
    // description_key is default_visible:false → never in the head).
    const headTexts = (await page.locator("table thead th").allTextContents())
      .map((t) => t.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    expect(headTexts.slice(0, 11)).toEqual([
      "Name",
      "Sezionale",
      "Sezionale 2",
      "Sezionale 3",
      "Increment",
      "Start",
      "Current",
      "Next",
      "Pattern",
      "Current Sequence",
      "Next Sequence",
    ]);
    // tz / revive_every and everything after are default_visible:false but
    // toggleable — the user-ratified contract (2026-11-26: "poi TZ, revive
    // every, e quello dopo NON visibile di default ma togglabile").
    expect(headTexts).not.toContain("Time zone");
    expect(headTexts).not.toContain("Renew Every");
    expect(headTexts).not.toContain("Description key");
    // `last_alloc_*` carry the standard audit anatomy — `default_visible:false`,
    // toggleable: absent from the head like every audit stamp, surfaced by
    // the column picker inside the audit band (first of the block).
    expect(headTexts).not.toContain("Last allocated at");
    expect(headTexts).not.toContain("Last allocated by");
    await page.getByTestId("elt-column-selector").click();
    const allocToggle = page.getByTestId("columns-toggle-last_alloc_at");
    await expect(allocToggle).toBeVisible({ timeout: 5_000 });
    await allocToggle.click();
    await page.keyboard.press("Escape");
    const headAfter = (await page.locator("table thead th").allTextContents())
      .map((t) => t.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    expect(headAfter.indexOf("Last allocated at")).toBeGreaterThan(
      headAfter.indexOf("Time zone"),
    );
    expect(headTexts).not.toContain("Default from");
    expect(headTexts).not.toContain("Revive slot");
    expect(headTexts).not.toContain("Expires at");
    // Restore the default view for the steps below — the toggle persists
    // per session otherwise.
    await page.getByTestId("elt-column-selector").click();
    await page.getByTestId("columns-toggle-last_alloc_at").click();
    await page.keyboard.press("Escape");
    const row = page.locator("table tbody tr", { hasText: "customers.code" }).first();
    await expect(row).toBeVisible({ timeout: 5_000 });
    // The entity_op synthesis lands the `sequence_set` CTA on the row kebab —
    // the governed set-counter surface exists by construction.
    const kebab = row.locator("td").last().getByRole("button").first();
    await kebab.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const cta = menu.getByText("Set counter");
    await expect(cta).toBeVisible();
    // The forced-revive row action resolves its module translation and the
    // Lucide glyph — never the raw key/custom sequence icon fallback.
    const reviveItem = menu.getByRole("menuitem").filter({ hasText: /Revive now|Rinnova ora/i });
    await expect(reviveItem).toBeVisible();
    await expect(reviveItem.locator("svg.lucide-rotate-cw-square").first()).toBeVisible();

    // `sequence_set` is parametric — the authored dialog collects `next`,
    // informed by `sequence-analyze` (the strip mounts live stats).
    await cta.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    const analysis = dialog.getByTestId("sequence-set-analysis");
    await expect(analysis).toContainText("Values in use", { timeout: 5_000 });
    // `next` prefills from suggested_start — operator can override.
    const nextInput = dialog.getByTestId("sequence-set-next");
    await expect(nextInput).not.toHaveValue("", { timeout: 5_000 });

    // Submit rides the governed chain — the meta-served confirm gate opens
    // (confirm_key → the generic gated-op DeleteDialog anatomy), cancelled
    // here: the MFA step-up + counter write paths are covered by the
    // dal/service suites.
    await dialog.getByTestId("sequence-set-submit").click();
    const confirmDialog = page.getByRole("dialog").last();
    await expect(confirmDialog.getByRole("button", { name: "Cancel" })).toBeVisible({
      timeout: 5_000,
    });
    await confirmDialog.getByRole("button", { name: "Cancel" }).click();
    // The input dialog survives a cancelled confirm — close it too.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 5_000 });
    expect(apiFetches).toBe(0);
  });

  test("standard filters apply on pattern — draft binds, wire carries ILIKE, rows narrow", async ({ page }) => {
    const suffix = Date.now().toString(36);
    const matchName = `e2e_filter_match_${suffix}`;
    const missName = `e2e_filter_miss_${suffix}`;
    const created: string[] = [];
    const createSeq = async (name: string, pattern: string) => {
      const r = await page.request.post(`${CRM_BASE}/sequence`, {
        data: { entity: { name, pattern, step: "1", start: "1" } },
      });
      expect([200, 201], `create ${name}: ${await r.text()}`).toContain(r.status());
      const row = extJsonParse<{ entity?: { uuid?: string } }>(await r.text());
      if (row.entity?.uuid) created.push(row.entity.uuid);
    };
    await createSeq(matchName, `FLT${suffix.slice(-4)}-{seq:4}`);
    await createSeq(missName, `FLT${suffix.slice(-4)}-{seq:3}`);
    try {
      const listReq = page.waitForResponse(
        (r) => r.url().includes("/entities/sequence/list") && r.status() === 200,
        { timeout: 5_000 },
      );
      await page.goto("/crm/settings/sequences");
      await listReq;
      await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 5_000 });

      await page.getByRole("button", { name: "Filters", exact: true }).first().click();
      await expect(page.getByTestId("filters-apply")).toBeVisible({ timeout: 5_000 });
      const control = page.getByRole("textbox", { name: "Pattern", exact: true });
      await expect(control).toBeVisible({ timeout: 5_000 });
      await control.fill("4}");

      const urls: string[] = [];
      page.on("request", (req) => {
        if (req.url().includes("/entities/sequence/list")) urls.push(req.url());
      });
      // Enter is the keyboard commit gesture for scalar filter drafts — the
      // user must never be forced to hunt for the footer Apply button.
      await control.press("Enter");

      await expect.poll(() => urls.length, { timeout: 5_000 }).toBeGreaterThan(0);
      const filtered = urls
        .map((u) => new URL(u))
        .find((u) =>
          Array.from({ length: 8 }, (_, i) => i).some(
            (i) => u.searchParams.get(`filters[${i}][field]`) === "pattern",
          ),
        );
      expect(filtered, `no pattern filter in list urls: ${urls.join("\n")}`).toBeTruthy();
      const idx = Array.from({ length: 8 }, (_, i) => i).find(
        (i) => filtered!.searchParams.get(`filters[${i}][field]`) === "pattern",
      )!;
      expect(filtered!.searchParams.get(`filters[${idx}][op]`)).toBe("ILIKE");
      expect(filtered!.searchParams.get(`filters[${idx}][value]`)).toBe("4}");

      await expect(page.locator("table tbody tr", { hasText: matchName }).first()).toBeVisible({ timeout: 5_000 });
      await expect(page.locator("table tbody tr", { hasText: missName })).toHaveCount(0);
    } finally {
      for (const uuid of created.splice(0)) {
        const got = await page.request.get(`${CRM_BASE}/sequence/${uuid}`).catch(() => null);
        if (!got?.ok()) continue;
        const row = extJsonParse<{ version?: unknown }>(await got.text());
        await page.request.delete(`${CRM_BASE}/sequence/${uuid}?version=${String(row.version ?? 0)}`).catch(() => {});
      }
    }
  });

  /**
   * Filter-surface widget parity — user-ratified 2026-11-26: VALUE controls
   * never degrade to plain text. `revive_every`/`revive_grace` mount the
   * dual-mode revive composite (the canonical varchar it emits IS the
   * matched wire format), `description_key` the governed i18n vocabulary
   * pick, `revived_from` the paged entity-ref combo (self-ref, service-
   * threaded), `revived_by` the audit-actor combo. Audit actors resolve
   * display names server-side and the combo searches labels client-side.
   */
  test("standard filters mount governed widgets — revive composite, i18n/ref/actor combos, wire + label search", async ({ page }) => {
    const suffix = Date.now().toString(36);
    const matchName = `e2e_wgt_match_${suffix}`;
    const missName = `e2e_wgt_miss_${suffix}`;
    const created: string[] = [];
    const createSeq = async (name: string, extra: Record<string, unknown>) => {
      const r = await page.request.post(`${CRM_BASE}/sequence`, {
        data: { entity: { name, step: "1", start: "1", ...extra } },
      });
      expect([200, 201], `create ${name}: ${await r.text()}`).toContain(r.status());
      const row = extJsonParse<{ entity?: { uuid?: string } }>(await r.text());
      if (row.entity?.uuid) created.push(row.entity.uuid);
    };
    await createSeq(matchName, {
      pattern: `W${suffix.slice(-4)}{seq:3}-{sez}`,
      sez: "2026-01-15",
      revive_every: "1 year",
      revive_slot: "sez",
    });
    await createSeq(missName, { pattern: `W${suffix.slice(-4)}{seq:4}` });
    try {
      const listReq = page.waitForResponse(
        (r) => r.url().includes("/entities/sequence/list") && r.status() === 200,
        { timeout: 5_000 },
      );
      await page.goto("/crm/settings/sequences");
      await listReq;
      await page.getByRole("button", { name: "Filters", exact: true }).first().click();
      await expect(page.getByTestId("filters-apply")).toBeVisible({ timeout: 5_000 });

      // ── anatomy: the governed control per column contract, never a bare textbox ──
      // The revive composite's inner numeric carries the labelled field id —
      // resolving the label proves the composite IS the mounted control.
      for (const label of ["Renew Every", "Activation"]) {
        const input = page.getByLabel(label, { exact: true }).first();
        await expect(input, `${label} must mount the revive composite`).toHaveAttribute(
          "data-testid",
          "revive-interval-input-field",
          { timeout: 5_000 },
        );
      }
      // i18n key + self-ref + actor columns mount comboboxes, never textboxes.
      // ComboSelect triggers are div[role=combobox] — non-labelable elements,
      // so the accessible-name chain does not apply; the structural chain
      // `label[for] → control[id]` is the wired contract under test.
      const controlFor = async (label: string) => {
        const labelEl = page.locator(`label:has-text("${label}")`).first();
        await expect(labelEl, `${label} label`).toBeVisible({ timeout: 5_000 });
        const forId = await labelEl.getAttribute("for");
        expect(forId, `${label} label must wire for=`).toBeTruthy();
        return page.locator(`[id="${forId}"]`);
      };
      for (const label of ["Description translation", "Cloned From", "Revived by", "Created by"]) {
        const control = await controlFor(label);
        await expect(control, `${label} must mount a combobox`).toHaveAttribute("role", "combobox", {
          timeout: 5_000,
        });
      }

      // ── wire: the revive composite emits the canonical varchar the filter matches ──
      const urls: string[] = [];
      page.on("request", (req) => {
        if (req.url().includes("/entities/sequence/list")) urls.push(req.url());
      });
      const renewInput = page.getByLabel("Renew Every", { exact: true }).first();
      await renewInput.fill("1");
      await page.getByTestId("filters-apply").click();

      await expect
        .poll(
          () =>
            urls.some((u) => {
              const url = new URL(u);
              return Array.from({ length: 8 }, (_, i) => i).some(
                (i) =>
                  url.searchParams.get(`filters[${i}][field]`) === "revive_every" &&
                  url.searchParams.get(`filters[${i}][value]`) === "1 year",
              );
            }),
          { timeout: 5_000, message: `no revive_every=1 year filter in: ${urls.join("\n")}` },
        )
        .toBe(true);
      const filtered = urls
        .map((u) => new URL(u))
        .find((u) =>
          Array.from({ length: 8 }, (_, i) => i).some(
            (i) => u.searchParams.get(`filters[${i}][field]`) === "revive_every",
          ),
        )!;
      const idx = Array.from({ length: 8 }, (_, i) => i).find(
        (i) => filtered.searchParams.get(`filters[${i}][field]`) === "revive_every",
      )!;
      expect(filtered.searchParams.get(`filters[${idx}][op]`)).toBe("ILIKE");
      await expect(page.locator("table tbody tr", { hasText: matchName }).first()).toBeVisible({ timeout: 5_000 });
      await expect(page.locator("table tbody tr", { hasText: missName })).toHaveCount(0);

      // ── actor labels: display names resolve server-side, label search hits them ──
      // This test's own rows are written by the ephemeral admin — the actor
      // vocabulary MUST carry its display name, not the raw uuid.
      const actorCombo = await controlFor("Created by");
      await actorCombo.click();
      const adminOption = page.getByRole("option", { name: /E2E Test Admin/ }).first();
      await expect(adminOption, "actor vocabulary must label-resolve the live profile").toBeVisible({ timeout: 5_000 });
      // ComboSelect client-search covers labels — typing the display name
      // prefix must keep the option visible (the raw-uuid search failure the
      // user reported cannot reproduce with resolved labels).
      const search = page.getByPlaceholder(/search/i).first();
      await expect(search).toBeVisible({ timeout: 5_000 });
      await search.fill("E2E Test");
      await expect(adminOption).toBeVisible({ timeout: 5_000 });
      await page.keyboard.press("Escape");
    } finally {
      for (const uuid of created.splice(0)) {
        const got = await page.request.get(`${CRM_BASE}/sequence/${uuid}`).catch(() => null);
        if (!got?.ok()) continue;
        const row = extJsonParse<{ version?: unknown }>(await got.text());
        await page.request.delete(`${CRM_BASE}/sequence/${uuid}?version=${String(row.version ?? 0)}`).catch(() => {});
      }
    }
  });

  /**
   * Column-visibility v2 pollution self-heals — the migration contract:
   * a stored v2 blob whose `hidden` array pins default-hidden columns as
   * fake intent (written by the bootstrap effect under the pre-reorder
   * decl) must NOT defeat the governed default visibility. `hidden` drops
   * wholesale at restore; the governed head renders and the store
   * rewrites as v3.
   */
  test("polluted v2 column prefs migrate — governed default order renders, store rewrites v3", async ({ page }) => {
    // The exact pollution shape: every default-hidden column of the
    // pre-reorder decl recorded as fake user intent — including the
    // sez block the reorder wave flipped to default-visible. Serialized
    // node-side (ext-json wire contract) and injected verbatim.
    const pollutedBlob = extJsonStringify({
      v: 2,
      shown: [],
      hidden: ["sez", "sez2", "sez3", "step", "start", "tz", "revive_every", "description_key"],
    });
    await page.addInitScript(
      ([key, val]) => window.localStorage.setItem(key, val),
      ["pb:crm-sequence:list:visibleKeys", pollutedBlob] as const,
    );
    const listReq = page.waitForResponse(
      (r) => r.url().includes("/entities/sequence/list") && r.status() === 200,
      { timeout: 5_000 },
    );
    await page.goto("/crm/settings/sequences");
    await listReq;
    await expect(page.locator("table")).toBeVisible({ timeout: 5_000 });
    const headTexts = (await page.locator("table thead th").allTextContents())
      .map((t) => t.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    // The polluted hide MUST NOT win — the governed head is the decl's.
    expect(headTexts.slice(0, 5)).toEqual(["Name", "Sezionale", "Sezionale 2", "Sezionale 3", "Increment"]);
    expect(headTexts).toContain("Next Sequence");
    expect(headTexts).not.toContain("Time zone");
    // The canonical store (sessionStorage — localStorage is the legacy
    // read-only fallback, orphaned by design) rewrites as v3 with the
    // pollution dropped.
    await expect
      .poll(
        async () => {
          const raw = await page.evaluate(() =>
            window.sessionStorage.getItem("pb:crm-sequence:list:visibleKeys"),
          );
          if (!raw) return null;
          const parsed = extJsonParse<{ v?: number; hidden?: string[] }>(raw);
          return `${parsed.v}:${(parsed.hidden ?? []).length}`;
        },
        { timeout: 5_000 },
      )
      .toBe("3:0");
  });

  test("columns sheet reset restores the governed ORDER — dragged columnOrder state wiped", async ({ page }) => {
    // Seed a dragged order: `step` pulled to the front of the data group.
    // The sheet factory is the only wiring that survives the sync effect —
    // its reset MUST be the composed one (visibility + order + sort), not
    // the visibility-only one (user report 2026-11-26).
    const draggedBlob = extJsonStringify({ data: ["step"] });
    await page.addInitScript(
      ([key, val]) => window.sessionStorage.setItem(key, val),
      ["pb:crm-sequence:list:columnOrder", draggedBlob] as const,
    );
    const listReq = page.waitForResponse(
      (r) => r.url().includes("/entities/sequence/list") && r.status() === 200,
      { timeout: 5_000 },
    );
    await page.goto("/crm/settings/sequences");
    await listReq;
    await expect(page.locator("table")).toBeVisible({ timeout: 5_000 });
    const headOrder = async () =>
      (await page.locator("table thead th").allTextContents())
        .map((t) => t.replace(/\s+/g, " ").trim())
        .filter(Boolean);
    // The dragged order wins on render — Increment jumps ahead of Sezionale.
    const dragged = await headOrder();
    expect(dragged.indexOf("Increment")).toBeLessThan(dragged.indexOf("Sezionale"));

    // Open the columns sheet and hit the eraser — the sheet-header reset.
    // Scoped to the sheet dialog: the filter bar carries its own disabled
    // Reset button earlier in DOM order.
    await page.getByTestId("elt-column-selector").click();
    await page.getByRole("dialog").getByRole("button", { name: "Reset" }).click();

    // The governed authored order is restored verbatim.
    await expect
      .poll(async () => (await headOrder()).slice(0, 6).join("|"), { timeout: 5_000 })
      .toBe("Name|Sezionale|Sezionale 2|Sezionale 3|Increment|Start");
    // The persisted order state is wiped — no group arrays survive.
    const wiped = await page.evaluate(() =>
      window.sessionStorage.getItem("pb:crm-sequence:list:columnOrder"),
    );
    const parsed = extJsonParse<{ data?: string[]; sticky?: string[]; auditing?: string[] }>(wiped ?? "{}");
    expect(parsed.data).toBeUndefined();
    expect(parsed.sticky).toBeUndefined();
    expect(parsed.auditing).toBeUndefined();
    await page.keyboard.press("Escape");
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
    const uuid = extJsonParse<{ entity?: { uuid?: string } }>(await cr.text())?.entity?.uuid;
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
    const fbUuid = extJsonParse<{ entity?: { uuid?: string } }>(await fb.text())?.entity?.uuid;
    try {
      const listReq = page.waitForResponse(
        (r) => r.url().includes("/entities/sequence/list") && r.status() === 200,
        { timeout: 5_000 },
      );
      await page.goto("/crm/settings/sequences");
      await listReq;

      // `description_key` is `default_visible:false` but toggleable — the
      // column picker must surface it and the badge cell renders once on.
      await page.getByTestId("elt-column-selector").click();
      const descToggle = page.getByTestId("columns-toggle-description_key");
      await expect(descToggle).toBeVisible({ timeout: 5_000 });
      // dispatchEvent: the picker popover animates its scroll area — the
      // toggle can be visible-but-unstable or momentarily below the fold;
      // the handler is a plain click listener either way.
      await descToggle.dispatchEvent("click");
      await page.keyboard.press("Escape");

      // Translated badge — icon + resolved label, raw key on the tooltip.
      await page.getByTestId("entity-search").locator("input").fill(name);
      const row = page.locator("table tbody tr", { hasText: name }).first();
      await expect(row).toBeVisible({ timeout: 5_000 });
      const badge = row
        .locator('td [data-slot="badge"]')
        .filter({ has: page.locator("svg") });
      await expect(badge).toContainText("Name");
      await expect(badge).not.toContainText("crm.entities.sequence.fields.name");
      await badge.hover();
      // The open tooltip — a closed-state tooltip from an earlier hover can
      // still linger in the DOM (bits mounts per trigger); :visible filters
      // hidden ones and hasText pins the right portal regardless of the
      // data-state vocabulary (instant-open vs delayed-open).
      await expect(
        page
          .locator('[data-tooltip-content]:visible')
          .filter({ hasText: "crm.entities.sequence.fields.name" }),
      ).toBeVisible({ timeout: 5_000 });

      // Raw fallback — the untranslated key renders itself, icon included.
      await page.getByTestId("entity-search").locator("input").fill(fbName);
      const fbRow = page.locator("table tbody tr", { hasText: fbName }).first();
      await expect(fbRow).toBeVisible({ timeout: 5_000 });
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
    await page.addInitScript(
      ([key, value]) => sessionStorage.setItem(key, value),
      ["pb:crm-sequence:list:sort", extJsonStringify({ key: "code", dir: "asc" })],
    );
    await page.goto("/crm/settings/sequences", { waitUntil: "domcontentloaded" });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 5_000 });
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
        body: extJsonStringify({
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
      { timeout: 5_000 },
    );
    await page.goto("/crm/settings/sequences", { waitUntil: "domcontentloaded" });
    await healedList;
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 5_000 });
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
        body: extJsonStringify({
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
      { timeout: 5_000 },
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
    test.setTimeout(90000);
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
      return (await r.text().then((t) => extJsonParse<unknown>(t))) as Record<string, unknown>;
    };
    const seqEdit = await mkSeq("e");
    const seqDel = await mkSeq("d");
    const seqBulk = await mkSeq("b");

    /** Track every entity-API request — nothing may leave `/svc/crm`.
     *  `/presence` is exempt: collaboration presence is a GATEWAY-owned
     *  facility (`/api/v1/entities/:e/:uuid/presence*` on the BE) — it
     *  never rides the owning service by design. */
    const apiUrls: string[] = [];
    page.on("request", (r) => {
      const u = r.url();
      if (u.includes("/entities/sequence") && !u.includes("/presence")) apiUrls.push(u);
    });

    await page.goto("/crm/settings/sequences");
    await expect(page.locator("table")).toBeVisible({ timeout: 5_000 });
    const byName = (name: string) =>
      page.locator("table tbody tr", { hasText: name }).first();
    /** Registry rows accumulate across runs — server-side `search`
     *  narrows to the fixture row instead of relying on page-1 sort. */
    const searchFor = async (name: string) => {
      const listReq = page.waitForResponse(
        (r) => r.url().includes("/entities/sequence/list") && r.status() === 200,
        { timeout: 5_000 },
      );
      await page.getByTestId("entity-search").locator("input").fill(name);
      await listReq;
    };

    // ── Modifica → entity.record sheet in edit mode → save ────────────
    await searchFor(String(seqEdit.name));
    const editRow = byName(String(seqEdit.name));
    await expect(editRow).toBeVisible({ timeout: 5_000 });
    await editRow.locator("td").last().getByRole("button").first().click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const putReq = page.waitForResponse(
      (r) =>
        r.url().includes("/svc/crm/api/v1/entities/sequence/") &&
        r.request().method() === "PUT" &&
        r.status() === 200,
      { timeout: 5_000 },
    );
    await menu.getByText(/modifica|edit/i).first().click();
    // The record sheet opens straight into edit mode — step is editable.
    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    const stepInput = sheet.locator("[data-testid=entity-form-field-step] input");
    await expect(stepInput).toBeEnabled({ timeout: 5_000 });
    await stepInput.fill("2");
    // NumericInput commits the canonical value on blur — blur before the
    // submit click so the zod schema sees the real value.
    await stepInput.blur();
    // Save — the governed update path, on the owning service.
    await page.getByTestId("entity-form-submit").click();
    await putReq;
    // Post-save settle: editing flips off (submit CTA unmounts) AFTER the
    // response lands — Escape before that would trip the dirty-close
    // guard (native confirm → auto-dismissed by Playwright = decline).
    await expect(page.getByTestId("entity-form-submit")).toBeHidden({ timeout: 5_000 });

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
      { timeout: 5_000 },
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
      { timeout: 5_000 },
    );
    // Soft-delete presents as "Disable" on sequences (actions_overrides —
    // same semantics as job_trigger: exec-stop + destructive).
    await page.getByRole("menu").getByText(/disabilita|disable|elimina|delete/i).first().click();
    const confirm = page.getByRole("dialog").last();
    await expect(confirm).toBeVisible({ timeout: 5_000 });
    // Confirm the destructive op — the dialog must CLEAR (no perpetual
    // busy: the request resolves on the owning schema).
    const confirmBtn = confirm.getByRole("button", { name: /disabilita|disable|elimina|delete|conferma|confirm/i }).last();
    await confirmBtn.click();
    await delReq;
    await expect(confirm).toBeHidden({ timeout: 5_000 });
    await expect(delRow).toBeHidden({ timeout: 5_000 });

    // ── Bulk delete CTA present + governed dispatch ──────────────────
    await searchFor(String(seqBulk.name));
    const bulkRow = byName(String(seqBulk.name));
    await bulkRow.getByRole("checkbox", { name: "select row" }).click();
    const bulkReq = page.waitForResponse(
      (r) =>
        r.url().includes("/svc/crm/api/v1/entities/sequence/bulk-delete") &&
        r.status() === 200,
      { timeout: 5_000 },
    );
    const bulkCta = page.getByTestId("entity-bulk-delete");
    await expect(bulkCta).toBeVisible({ timeout: 5_000 });
    await bulkCta.click();
    const bulkConfirm = page.getByRole("dialog").last();
    await expect(bulkConfirm).toBeVisible({ timeout: 5_000 });
    await bulkConfirm.getByRole("button", { name: /disabilita|disable|elimina|delete|conferma|confirm/i }).last().click();
    await bulkReq;

    // The residual check — no entity call may have left the owning svc.
    for (const u of apiUrls) expect(u).toContain("/svc/crm/");

    // Cleanup — the edit/restored fixtures (soft-deleted ones too).
    for (const s of [seqEdit, seqDel, seqBulk]) {
      const g = await page.request.get(`${CRM_BASE}/sequence/${s.uuid}`);
      if (!g.ok()) continue;
      const row = extJsonParse<SeqRow>(await g.text());
      await page.request.delete(`${CRM_BASE}/sequence/${s.uuid}?version=${row.version}`);
    }
  });

  /**
   * Meta-driven create surface — `meta.create.surface === "sheet"` wires
   * the list CTA to `entity.record` in `mode:"create"` (ONE panel, no
   * census create route). Also pins the `kind` contract: `calculated`/
   * `virtual` projections are NEVER form widgets on any surface, and
   * `name` — dropped `immutable` — stays mutable on update.
   */
  test("create.surface sheet — CTA → entity.record create mode → POST → morph; kind never widget", async ({
    page,
  }) => {
    await page.goto("/crm/settings/sequences");
    await expect(page.locator("table")).toBeVisible({ timeout: 5_000 });

    // ── CTA auto-wired from meta (no authored onCreateAction) ─────────
    const cta = page.getByTestId("entity-create-cta");
    await expect(cta).toBeVisible({ timeout: 5_000 });
    await cta.click();
    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 5_000 });

    // Create anatomy — record-only sections absent by construction:
    // no pencil toggle (born editable), no version badge, no audit
    // accordion, no uid. Fields editable from mount.
    await expect(page.getByTestId("entity-record-sheet-edit-toggle")).toHaveCount(0);
    await expect(page.getByTestId("entity-record-sheet-version-badge")).toHaveCount(0);
    await expect(sheet.getByTestId("entity-record-sheet-audit-section")).toHaveCount(0);
    const nameInput = sheet.locator("[data-testid=entity-form-field-name] input");
    await expect(nameInput).toBeEnabled({ timeout: 5_000 });

    // Served defaults — the decorator→meta→FE chain: `@Column({defaultSql:"1"})`
    // → `MetaColumn.default:1n` → create prefill. The prefilled value is the
    // real committed baseline (it rides the POST below untouched).
    const stepIn = sheet.locator("[data-testid=entity-form-field-step] input");
    const startIn = sheet.locator("[data-testid=entity-form-field-start] input");
    await expect(stepIn).toHaveValue("1");
    await expect(startIn).toHaveValue("1");

    // Validation gate — pristine → submit disabled; one required field
    // filled → the OTHERS still error → still disabled (canSave =
    // hasChanges && no errors — autowired zod, never a raw POST).
    const submit = page.getByTestId("entity-form-submit");
    await expect(submit).toBeDisabled();
    await nameInput.fill("e2e_gate_probe");
    await expect(submit).toBeDisabled({ timeout: 5_000 });
    // `kind:"virtual"`/audited projections never reach the widget grid —
    // on ANY form surface (create AND update).
    for (const k of [
      "value_actual",
      "value_next",
      "emitted_actual",
      "emitted_next",
      "last_alloc_at",
      "last_alloc_by",
    ])
      await expect(sheet.locator(`[data-testid=entity-form-field-${k}]`)).toHaveCount(0);

    // POST → the panel morphs into update on the created row.
    const unique = `e2e_sheet_${Date.now()}`;
    await nameInput.fill(unique);
    await sheet.locator("[data-testid=entity-form-field-pattern] input").fill("E2ES-C-{seq:4}");
    // step/start ride the POST as the UNTOUCHED prefilled defaults (1n/1n).
    const postReq = page.waitForResponse(
      (r) =>
        r.url().includes("/svc/crm/api/v1/entities/sequence") &&
        r.request().method() === "POST" &&
        r.status() === 201,
      { timeout: 5_000 },
    );
    await page.getByTestId("entity-form-submit").click();
    const postRes = await postReq;
    const created = extJsonParse<SeqRow>(await postRes.text());
    const createdRow = (created.entity ?? created) as Record<string, unknown>;
    // The untouched prefill committed — server row carries the defaults.
    expect(String(createdRow.step)).toMatch(/^1n?$/);
    expect(String(createdRow.start)).toMatch(/^1n?$/);

    // Morph → update: version badge + pencil toggle + audit section
    // return, uid block renders.
    await expect(page.getByTestId("entity-record-sheet-version-badge")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("entity-record-sheet-edit-toggle")).toBeVisible();

    // ── Update: pencil → `name` stays editable (immutable dropped —
    // display-name is mutable any number of times) → PUT persists ────
    await page.getByTestId("entity-record-sheet-edit-toggle").click();
    const renamed = `${unique}_r`;
    await expect(nameInput).toBeEnabled({ timeout: 5_000 });
    await nameInput.fill(renamed);
    const putReq = page.waitForResponse(
      (r) =>
        r.url().includes("/svc/crm/api/v1/entities/sequence/") &&
        r.request().method() === "PUT" &&
        r.status() === 200,
      { timeout: 5_000 },
    );
    await page.getByTestId("entity-form-submit").click();
    await putReq;
    // kind-projections are never in the PUT payload — the POST/PUT body
    // carries only authored columns (verified implicitly: a polluted
    // payload 400s the strict schema).
    await expect(nameInput).toHaveValue(renamed, { timeout: 5_000 });

    // Cleanup fixture.
    const g = await page.request.get(`${CRM_BASE}/sequence/${createdRow.uuid}`);
    if (g.ok()) {
      const row = extJsonParse<SeqRow>(await g.text());
      await page.request.delete(
        `${CRM_BASE}/sequence/${createdRow.uuid}?version=${row.version}`,
      );
    }
  });

  /**
   * `format:"i18n_key"` — `description_key` autowires the canonical
   * translation-key ComboSelect (the SAME anatomy the dict-page
   * TranslationKeyCell and the config-builder key selectors share through
   * `i18nKeyOptions`): combobox trigger, `*.entities.sequence.rows.*`
   * scoped vocabulary, `languages` icon on option rows, `custom.*`
   * convention suggestion tracking the name field, allowCreate.
   */
  test("description_key — i18n_key autowires the canonical translation-key ComboSelect", async ({
    page,
  }) => {
    await page.goto("/crm/settings/sequences");
    await expect(page.locator("table")).toBeVisible({ timeout: 5_000 });
    await page.getByTestId("entity-create-cta").click();
    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 5_000 });

    const field = sheet.getByTestId("entity-form-field-description_key");
    await expect(field).toBeVisible();
    // A combobox trigger — never a bare text input.
    const combo = field.locator('[role="combobox"]');
    await expect(combo).toBeVisible();
    // The languages CTA is part of the anatomy — opens the translation
    // editor for the picked key; disabled until a key exists.
    const langsCta = field.getByTestId("i18n-key-translations");
    await expect(langsCta).toBeVisible();
    await expect(langsCta).toBeDisabled();

    // The `custom.*` suggestion is the ASSIGNED value — typing the row's
    // name fills the field with `custom.entities.sequence.rows.<slug>`,
    // the trigger shows it, the CTA activates.
    await sheet
      .locator("[data-testid=entity-form-field-name] input")
      .fill("e2e dk probe");
    await expect(combo).toContainText("custom.entities.sequence.rows.e2e_dk_probe", {
      timeout: 5_000,
    });
    await expect(langsCta).toBeEnabled();

    // Open — defaultSearch carries the FULL namespace-less seed
    // `entities.sequence.rows.<slug>` — a key leaf, never a bare prefix
    // ending with a dot.
    await combo.click();
    const search = page.locator('[data-slot="command-input"]:visible').last();
    await expect(search).toHaveValue("entities.sequence.rows.e2e_dk_probe");

    // Vocabulary scope — clearing the seed shows the full row family:
    // every option lives under `*.entities.sequence.rows.*`; real
    // vocabulary options carry the `languages` icon (the synthetic
    // Create row does not — it's not a vocabulary item).
    await search.fill("");
    const options = page.locator("[data-state='open'] [role='option']:visible");
    const n = await options.count();
    for (let i = 0; i < n; i++) {
      const opt = options.nth(i);
      await expect(opt).toContainText(/entities\.sequence\.rows\./);
      if (!(await opt.textContent())?.trim().startsWith("Create")) {
        await expect(opt.locator("svg.lucide-languages")).toBeVisible();
      }
    }

    // allowCreate + the shared coercion — an `entities.*` typed path
    // commits convention-scoped under `custom.*` (the dict-cell rule).
    await search.fill("entities.sequence.rows.e2e_other");
    const createRow = page
      .getByRole("option")
      .filter({ hasText: "entities.sequence.rows.e2e_other" })
      .first();
    await expect(createRow).toBeVisible({ timeout: 5_000 });
    await createRow.click();
    await expect(combo).toContainText("custom.entities.sequence.rows.e2e_other", {
      timeout: 5_000,
    });
  });

  /**
   * `format:"sequence_pattern"` — the pattern-builder widget on the
   * `sequence.pattern` column: free literal typing, token-catalog sheet
   * via the in-input Tags CTA, insert-at-caret, used-token gating, live
   * interpolated preview (same renderSequenceValue engine as the BE)
   * both in the sheet and in the interpreter strip under the input
   * (schedule-spec-input convention).
   */
  test("sequence_pattern widget — token sheet, caret insert, used gating, live preview", async ({
    page,
  }) => {
    test.setTimeout(60000);
    // Wire spy — an invalid pattern must never reach the wire.
    let posts = 0;
    page.on("request", (r) => {
      if (r.url().includes("/svc/crm/api/v1/entities/sequence") && r.method() === "POST") posts++;
    });

    await page.goto("/crm/settings/sequences");
    await expect(page.locator("table")).toBeVisible({ timeout: 5_000 });
    await page.getByTestId("entity-create-cta").click();
    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    await sheet.locator("[data-testid=entity-form-field-name] input").fill("e2e_pattern_widget");

    const patternInput = sheet.locator("[data-testid=entity-form-field-pattern] input");
    await expect(patternInput).toBeEnabled({ timeout: 5_000 });

    // Free literal typing — arbitrary text is accepted verbatim.
    await patternInput.fill("INV-");
    // Interpreter strip under the input (schedule-spec convention) —
    // an incomplete pattern shows the parser error, not a guess.
    const strip = page.getByTestId("sequence-pattern-input-interpreter");
    await expect(strip).toBeVisible();
    await expect(page.getByTestId("sequence-pattern-input-error")).toBeVisible();
    // Untouched-caret insert appends at end; an invalid-incomplete
    // pattern (missing {seq}) must show the parser error in the sheet.
    const tokensCta = sheet.locator("[data-testid$=-tokens-cta]");
    await expect(tokensCta).toBeVisible();
    await tokensCta.click();
    await expect(page.getByTestId("sequence-pattern-token-seq")).toBeVisible({ timeout: 5_000 });
    // Token rows render the catalog examples — the example counter rides
    // the form's `start` sibling (served default 1 on create).
    await expect(page.getByTestId("sequence-pattern-token-seq-example")).toHaveText("1");
    // ONE counter row only — the old `{seq:W}` row is gone; width is
    // authored in the padding form under it (0 = no padding, default).
    await expect(page.getByTestId("sequence-pattern-token-seq_width")).toHaveCount(0);
    const seqWidth = page.getByTestId("sequence-pattern-seq-width");
    await expect(seqWidth).toHaveValue("0");
    // Time tokens exist — cosmetic claim-time stamps (24h/12h/min/sec).
    await expect(page.getByTestId("sequence-pattern-token-HH")).toBeVisible();
    await expect(page.getByTestId("sequence-pattern-token-hh")).toBeVisible();
    await expect(page.getByTestId("sequence-pattern-token-mm")).toBeVisible();
    await expect(page.getByTestId("sequence-pattern-token-ss")).toBeVisible();
    // Incomplete pattern → preview shows the parser error, not a guess.
    await expect(page.getByTestId("sequence-pattern-preview-error")).toBeVisible();
    // The sheet preview is display-only — no counter/sez sample inputs
    // (the example context rides the form record + catalog defaults)…
    await expect(page.getByTestId("sequence-pattern-example-counter")).toHaveCount(0);
    await expect(page.getByTestId("sequence-pattern-sez-sez")).toHaveCount(0);
    // …and neither the token list nor the preview sit inside a bordered
    // card — the sheet reads as flat rows under the section titles.
    await expect(
      page.getByTestId("sequence-pattern-token-seq").locator(".."),
    ).not.toHaveClass(/border/);
    await expect(
      page.getByTestId("sequence-pattern-preview-error").locator(".."),
    ).not.toHaveClass(/border/);

    // Padding 4 → the counter insert emits `{seq:4}`, not `{seq}`.
    await seqWidth.fill("4");
    await page.getByTestId("sequence-pattern-token-seq-insert").click();
    await expect(patternInput).toHaveValue("INV-{seq:4}");
    // Live preview interpolates through the shared renderer — in the
    // sheet AND in the strip under the input (same render engine).
    await expect(page.getByTestId("sequence-pattern-preview")).toHaveText("INV-0001");
    await expect(page.getByTestId("sequence-pattern-input-example")).toHaveText("INV-0001");
    // Grammar arity — the used counter slot is gated (data-used flag +
    // `-` remove CTA); the padding form mirrors the used width, disabled.
    await expect(page.getByTestId("sequence-pattern-token-seq")).toHaveAttribute("data-used", "true");
    await expect(page.getByTestId("sequence-pattern-token-seq-remove")).toBeVisible();
    await expect(seqWidth).toBeDisabled();
    await expect(seqWidth).toHaveValue("4");
    await expect(page.getByTestId("sequence-pattern-token-yyyy-insert")).toBeVisible();

    // `-` removes the whole `{seq:4}` span — insert CTA is back, the
    // padding form unlocks, the preview returns to the parser error.
    await page.getByTestId("sequence-pattern-token-seq-remove").click();
    await expect(patternInput).toHaveValue("INV-");
    await expect(page.getByTestId("sequence-pattern-token-seq-insert")).toBeVisible();
    await expect(seqWidth).toBeEnabled();
    await expect(page.getByTestId("sequence-pattern-preview-error")).toBeVisible();

    // Plain `{seq}` insert (padding back to 0).
    await seqWidth.fill("0");
    await page.getByTestId("sequence-pattern-token-seq-insert").click();
    await expect(patternInput).toHaveValue("INV-{seq}");
    await expect(page.getByTestId("sequence-pattern-preview")).toHaveText("INV-1");

    // Mid-string insertion — caret placed between INV- and {seq}.
    await patternInput.click();
    await patternInput.evaluate((el: HTMLInputElement) => el.setSelectionRange(4, 4));
    await page.getByTestId("sequence-pattern-token-yyyy-insert").click();
    await expect(patternInput).toHaveValue("INV-{yyyy}{seq}");
    await expect(page.getByTestId("sequence-pattern-preview")).toHaveText(/INV-\d{4}1/);

    // Time token mid-string — `{mm}` inserts at caret, case-distinct
    // from `{MM}` (both may coexist: minutes never scopes the period).
    // Home is a REAL keystroke (programmatic setSelectionRange(0,0) is
    // indistinguishable from a blur-cleared selection — {0,0} must come
    // from a user gesture for the caret tracker to record it).
    await patternInput.press("Home");
    await page.getByTestId("sequence-pattern-token-mm-insert").click();
    await expect(patternInput).toHaveValue("{mm}INV-{yyyy}{seq}");

    // Selection replace — select "{seq}" text, insert a date token over it.
    await patternInput.evaluate((el: HTMLInputElement) => {
      const i = el.value.indexOf("{seq}");
      el.setSelectionRange(i, i + 5);
    });
    await page.getByTestId("sequence-pattern-token-MM-insert").click();
    await expect(patternInput).toHaveValue("{mm}INV-{yyyy}{MM}");

    // Close the token sheet — invalid pattern (no counter) blocks submit,
    // zero POST on the wire.
    await page.keyboard.press("Escape");
    const submit = page.getByTestId("entity-form-submit");
    await expect(submit).toBeDisabled({ timeout: 5_000 });
    expect(posts).toBe(0);

    // Reopen the token sheet, then erase — the eraser rides the same
    // input channel as keystrokes, so the sheet MUST react: the counter
    // slot frees, the preview flips back to the parser error.
    await tokensCta.click();
    await expect(page.getByTestId("sequence-pattern-token-mm")).toHaveAttribute("data-used", "true", {
      timeout: 5_000,
    });
    await sheet
      .locator("[data-testid=entity-form-field-pattern] [data-testid$=-clear]")
      .click();
    await expect(patternInput).toHaveValue("");
    await expect(page.getByTestId("sequence-pattern-token-seq-insert")).toBeVisible();
    await expect(page.getByTestId("sequence-pattern-token-mm-insert")).toBeVisible();
    await expect(page.getByTestId("sequence-pattern-preview-error")).toBeVisible();
    // Empty input → the interpreter strip hides entirely (no stale
    // example under an empty field).
    await expect(page.getByTestId("sequence-pattern-input-interpreter")).toHaveCount(0);
  });

  test("entity.record update — uid pill, kind-off, reset, pencil-off silent reset, dirty-close native guard", async ({
    page,
  }) => {
    test.setTimeout(60000);
    const seq = await (async () => {
      const r = await page.request.post(`${CRM_BASE}/sequence`, {
        data: {
          entity: {
            name: `e2e_guard_${Date.now()}`,
            pattern: `E2EG-{seq:4}`,
            step: "2",
            start: "2",
          },
        },
      });
      expect(r.status()).toBe(201);
      return extJsonParse<SeqRow>(await r.text());
    })();

    const dialogs: { type: string; message: string }[] = [];
    /** Native window.confirm — every dirty-close consult goes through
     *  it; the handler decides accept/decline per phase. */
    let confirmAnswer = false;
    page.on("dialog", async (d) => {
      dialogs.push({ type: d.type(), message: d.message() });
      if (confirmAnswer) await d.accept();
      else await d.dismiss();
    });

    await page.goto("/crm/settings/sequences");
    await expect(page.locator("table")).toBeVisible({ timeout: 5_000 });
    const listReq = page.waitForResponse(
      (r) => r.url().includes("/entities/sequence/list") && r.status() === 200,
      { timeout: 5_000 },
    );
    await page.getByTestId("entity-search").locator("input").fill(String(seq.name));
    await listReq;
    const row = page.locator("table tbody tr", { hasText: String(seq.name) }).first();
    await expect(row).toBeVisible({ timeout: 5_000 });
    await row.locator("td").last().getByRole("button").first().click();
    await page.getByRole("menu").getByText(/modifica|edit/i).first().click();
    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 5_000 });

    // Update anatomy — uid pill first element, kind projections absent.
    await expect(sheet.getByTestId("entity-record-sheet-uid-badge")).toBeVisible();
    for (const k of ["value_actual", "value_next", "emitted_actual", "emitted_next"])
      await expect(sheet.locator(`[data-testid=entity-form-field-${k}]`)).toHaveCount(0);

    const stepInput = sheet.locator("[data-testid=entity-form-field-step] input");
    // Update shows the RECORD's step (fixture created with step=2) — the
    // served `default:1` is create-only and must never shadow a row value.
    await expect(stepInput).toHaveValue("2");
    const submit = page.getByTestId("entity-form-submit");
    const resetBtn = page.getByTestId("entity-form-reset");

    // ── Reset eraser → served baseline (update: refetch rebaseline) ──
    await stepInput.fill("9");
    await stepInput.blur();
    await expect(resetBtn).toBeEnabled({ timeout: 5_000 });
    await resetBtn.click();
    await expect(stepInput).toHaveValue("2", { timeout: 5_000 });
    await expect(resetBtn).toBeDisabled({ timeout: 5_000 });

    // ── Pencil-off = SILENT reset — no dialog, field re-baselines ────
    await stepInput.fill("7");
    await stepInput.blur();
    await page.getByTestId("entity-record-sheet-edit-toggle").click();
    await expect(submit).toBeHidden({ timeout: 5_000 });
    expect(dialogs).toHaveLength(0); // pencil-off never asks — it IS the intent
    // Re-enter edit → the discarded value is gone (baseline, not stale).
    await page.getByTestId("entity-record-sheet-edit-toggle").click();
    await expect(stepInput).toHaveValue("2", { timeout: 5_000 });

    // ── Dirty-close DECLINE → sheet stays open ───────────────────────
    await stepInput.fill("3");
    await stepInput.blur();
    await page.keyboard.press("Escape");
    await expect.poll(() => dialogs.length, { timeout: 5_000 }).toBe(1);
    expect(dialogs[0].type).toBe("confirm");
    await expect(sheet).toBeVisible(); // declined → vetoed

    // ── Dirty-close ACCEPT → draft.clear + close ─────────────────────
    confirmAnswer = true;
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden({ timeout: 5_000 });
    expect(dialogs).toHaveLength(2);

    // Draft cleared on confirmed discard — reopen → baseline, no stale.
    const row2 = page.locator("table tbody tr", { hasText: String(seq.name) }).first();
    await row2.locator("td").last().getByRole("button").first().click();
    await page.getByRole("menu").getByText(/modifica|edit/i).first().click();
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    await expect(stepInput).toHaveValue("2", { timeout: 5_000 });
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden({ timeout: 5_000 });
    expect(dialogs).toHaveLength(2); // pristine close → no third confirm

    // Cleanup.
    const g = await page.request.get(`${CRM_BASE}/sequence/${seq.uuid}`);
    if (g.ok()) {
      const r2 = extJsonParse<SeqRow>(await g.text());
      await page.request.delete(`${CRM_BASE}/sequence/${seq.uuid}?version=${r2.version}`);
    }
  });

  test("validation gate — per-field error chrome + zero wire on invalid, BOTH surfaces", async ({
    page,
  }) => {
    const seq = await (async () => {
      const r = await page.request.post(`${CRM_BASE}/sequence`, {
        data: {
          entity: {
            name: `aaa_val_${Date.now()}`,
            pattern: `E2EV-{seq:4}`,
            step: "1",
            start: "1",
          },
        },
      });
      expect(r.status()).toBe(201);
      return extJsonParse<SeqRow>(await r.text());
    })();

    // Wire spy — an invalid submit must NEVER reach the endpoint.
    const wireCalls: string[] = [];
    page.on("request", (r) => {
      if (
        r.url().includes("/svc/crm/api/v1/entities/sequence") &&
        (r.method() === "POST" || r.method() === "PUT")
      )
        wireCalls.push(`${r.method()} ${r.url()}`);
    });

    const listReq = page.waitForResponse(
      (r) => r.url().includes("/entities/sequence/list") && r.status() === 200,
      { timeout: 5_000 },
    );
    await page.goto("/crm/settings/sequences");
    await listReq;

    // ── UPDATE surface: pencil → clear a required field → error chrome
    //    + submit disabled + no PUT ───────────────────────────────────
    const row = page.locator("table tbody tr", { hasText: seq.name! }).first();
    await expect(row).toBeVisible({ timeout: 5_000 });
    await row.dblclick();
    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    await page.getByTestId("entity-record-sheet-edit-toggle").click();

    const nameField = sheet.locator("[data-testid=entity-form-field-name]");
    const nameInput = nameField.locator("input");
    await expect(nameInput).toBeEnabled({ timeout: 5_000 });
    await nameInput.fill("");
    await nameInput.blur();

    // The zod error renders under the field — chrome, not just gating.
    // Filtered by content: the FieldErrors container mounts even when
    // empty, and bare `.text-destructive` is also the required `*`.
    await expect(
      nameField.locator(".text-destructive.text-xs").filter({ hasText: /\S/ }).first(),
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("entity-form-submit")).toBeDisabled();
    // Pristine-required → also other required siblings error? Only
    // untouched-by-user required fields validate via forceValidation —
    // assert at least the cleared one shows chrome; wire stays silent.
    expect(wireCalls).toHaveLength(0);
    // Pencil-off = silent discard → pristine → clean close.
    await page.getByTestId("entity-record-sheet-edit-toggle").click();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden({ timeout: 5_000 });

    // ── CREATE surface: one required filled → the OTHER required
    //    fields show error chrome, submit disabled, no POST ───────────
    await page.getByTestId("entity-create-cta").click();
    const cSheet = page.getByTestId("entity-record-sheet");
    await expect(cSheet).toBeVisible({ timeout: 5_000 });
    const cNameInput = cSheet.locator("[data-testid=entity-form-field-name] input");
    await cNameInput.fill("e2e_val_partial");
    await cNameInput.blur();
    // Untouched required fields carry error chrome too — the schema
    // validates the whole object, not just the touched field. The error
    // chrome is the formsnap FieldErrors container (`.text-destructive
    // .text-xs`) FILTERED BY CONTENT — the container mounts even when
    // empty, and bare `.text-destructive` also matches the required `*`.
    // step/start are prefilled by the served `default:1` → already valid
    // → no error text.
    await expect(
      cSheet
        .locator("[data-testid=entity-form-field-pattern] .text-destructive.text-xs")
        .filter({ hasText: /\S/ })
        .first(),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      cSheet
        .locator("[data-testid=entity-form-field-step] .text-destructive.text-xs")
        .filter({ hasText: /\S/ }),
    ).toHaveCount(0);
    await expect(
      cSheet
        .locator("[data-testid=entity-form-field-start] .text-destructive.text-xs")
        .filter({ hasText: /\S/ }),
    ).toHaveCount(0);
    await expect(page.getByTestId("entity-form-submit")).toBeDisabled();
    expect(wireCalls).toHaveLength(0);
    // Dirty close → native confirm fires (accept → discard).
    page.once("dialog", (d) => void d.accept());
    await page.keyboard.press("Escape");
    await expect(cSheet).toBeHidden({ timeout: 5_000 });

    // Cleanup.
    const g = await page.request.get(`${CRM_BASE}/sequence/${seq.uuid}`);
    if (g.ok()) {
      const r2 = extJsonParse<SeqRow>(await g.text());
      await page.request.delete(`${CRM_BASE}/sequence/${seq.uuid}?version=${r2.version}`);
    }
  });

  test("row dblclick → entity.record update sheet (no kind:detail route → sheet IS the record surface)", async ({
    page,
  }) => {
    const seq = await (async () => {
      const r = await page.request.post(`${CRM_BASE}/sequence`, {
        data: {
          entity: {
            name: `e2e_dbl_${Date.now()}`,
            pattern: `E2ED-{seq:4}`,
            step: "1",
            start: "1",
          },
        },
      });
      expect(r.status()).toBe(201);
      return extJsonParse<SeqRow>(await r.text());
    })();

    await page.goto("/crm/settings/sequences");
    const row = page.locator("table tbody tr", { hasText: seq.name! }).first();
    await expect(row).toBeVisible({ timeout: 5_000 });
    await row.dblclick();

    // Sheet opens in update mode — readonly anatomy: uid pill + pencil
    // toggle present, submit absent until the pencil arms editing.
    const sheet = page.getByTestId("entity-record-sheet");
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    await expect(sheet.getByTestId("entity-record-sheet-uid-badge")).toBeVisible();
    // The pencil lives in the header chrome (actions snippet), gated on
    // update.single — not inside the sheet body testid.
    await expect(page.getByTestId("entity-record-sheet-edit-toggle")).toBeVisible();
    await expect(page.getByTestId("entity-form-submit")).toHaveCount(0);

    // Pristine close — no dirty guard.
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden({ timeout: 5_000 });

    // Cleanup.
    const g = await page.request.get(`${CRM_BASE}/sequence/${seq.uuid}`);
    if (g.ok()) {
      const r2 = extJsonParse<SeqRow>(await g.text());
      await page.request.delete(`${CRM_BASE}/sequence/${seq.uuid}?version=${r2.version}`);
    }
  });

  test("sequence_set row action → SequenceSetDialog renders canonical controls (no raw inputs)", async ({
    page,
  }) => {
    // Fixture row — the dialog opens on a live sequence.
    const seq = await (async () => {
      const r = await page.request.post(`${CRM_BASE}/sequence`, {
        data: {
          entity: {
            name: `e2e_seqset_${Date.now()}`,
            pattern: `E2ES-{sez}-{sez2}-{sez3}-{seq:4}`,
            step: "1",
            start: "1",
          },
        },
      });
      expect(r.status()).toBe(201);
      return extJsonParse<SeqRow>(await r.text());
    })();

    // Unbound operator rows have no physical scan target — the dialog must
    // explain the unavailable analysis WITHOUT calling `sequence-analyze`
    // (the governed 400 used to be the visible symptom).
    let analyzeFetches = 0;
    await page.route("**/actions/sequence-analyze", (r) => {
      analyzeFetches++;
      return r.continue();
    });
    await page.goto("/crm/settings/sequences");
    await page.getByTestId("entity-search").locator("input").fill(seq.name!);
    const row = page.locator("table tbody tr", { hasText: seq.name! }).first();
    await expect(row).toBeVisible({ timeout: 5_000 });

    // Row actions menu → the sequence_set parametric op. Its menu label is
    // `<entities_ns>.actions.sequence_set` — resolved or raw-key fallback.
    await row.getByRole("button", { name: /row actions|azioni riga/i }).click();
    const setItem = page
      .getByRole("menuitem")
      .filter({ hasText: /sequence_set|counter|contatore/i });
    await expect(setItem).toBeVisible({ timeout: 5_000 });
    await setItem.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByTestId("sequence-set-analysis")).toBeVisible();
    await expect(dialog.getByTestId("sequence-set-analysis")).toContainText(
      /bound to a field|associat/i,
      { timeout: 5_000 },
    );
    await page.waitForTimeout(500); // analyze debounce window — zero calls must remain zero
    expect(analyzeFetches).toBe(0);

    // Canonical control anatomy — the point under test:
    //   `next`      → NumericInput (real input, bigint kind)
    //   `sez*`      → TextInput per slot (real editable inputs, not raw)
    //   `at`        → DateWheelPicker popover trigger = a BUTTON, and the
    //                 dialog carries NO input[type="datetime-local"] at all.
    await expect(dialog.getByTestId("sequence-set-next")).toBeVisible();
    for (const slot of ["sez", "sez2", "sez3"]) {
      const input = dialog.getByTestId(`sequence-set-${slot}`);
      await expect(input).toBeVisible();
      await input.fill(`K${slot}`);
      await expect(input).toHaveValue(`K${slot}`);
    }
    await expect(dialog.locator("button[data-testid='sequence-set-at']")).toBeVisible();
    await expect(dialog.locator("input[type='datetime-local']")).toHaveCount(0);

    // Cancel closes — no submit, no counter write.
    await dialog.getByRole("button", { name: /cancel|annulla/i }).click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });

    // Cleanup.
    const g = await page.request.get(`${CRM_BASE}/sequence/${seq.uuid}`);
    if (g.ok()) {
      const r2 = extJsonParse<SeqRow>(await g.text());
      await page.request.delete(`${CRM_BASE}/sequence/${seq.uuid}?version=${r2.version}`);
    }
  });
});
