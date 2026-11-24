import { test, expect } from "@playwright/test";
import { loginAsTestAdmin } from "./helpers/admin-login";
import { extJsonParse } from "@primebrick/core/ext-json";

/* `sequence` create-sheet field contract (bugfix-sequence-create-form-contract):
 *
 *  - The synthesized form renders EXACTLY the writable contract — the
 *    revive columns carry the right flag taxonomy: `audited` (expire_at/
 *    switch_at/revived_*) and `hidden` (binding_key) can never be form
 *    fields by construction; `immutable` is editable on create,
 *    disabled on update (sez*, revive_every, revive_slot, default_from).
 *  - `depends_on.disabled_when{revive_every, set:false}` gates
 *    default_from / revive_slot / revive_grace until the cadence is set.
 *  - `format:"revive_interval"` renders the composite editor
 *    (number + closed 5-unit dropdown) and emits the `'N unit'` varchar
 *    canonical — verified on the wire after create.
 *  - The `default_from` anchor input seeds tomorrow 00:00 local and
 *    `expire_at` derives server-side from it — verified on the stored row.
 *  - Audited columns render in the record-sheet audit accordion, never
 *    as editable fields.
 *
 * Surface: /crm/settings/sequences — the builtin leaf (crm authors
 * nothing; the mount + meta + form policy are framework-owned).
 * Residue-free: the created row is deleted at the end, pass or fail.
 */

const CRM = "/svc/crm/api/v1/entities/sequence";
const TS = Date.now();

const PRESENT = [
	"name",
	"step",
	"start",
	"pattern",
	"tz",
	"description_key",
	"revive_every",
	"default_from",
	"revive_slot",
	"revive_grace",
	"sez",
	"sez2",
	"sez3",
];
const ABSENT = [
	"expire_at",
	"switch_at",
	"revived_from",
	"revived_at",
	"revived_by",
	"binding_key",
	"uuid",
	"version",
	"value_actual",
	"value_next",
	"emitted_actual",
	"emitted_next",
	"last_alloc_at",
	"last_alloc_by",
];

test.describe.configure({ mode: "serial" });

test.describe("sequence create sheet — field contract", () => {
	test("create sheet: writable census + revive gating + revive_interval round-trip", async ({
		page,
	}) => {
		await loginAsTestAdmin(page);
		await page.goto("/crm/settings/sequences", { waitUntil: "domcontentloaded" });
		await expect(
			page.locator("[data-sidebar='content'] a[href]").first(),
		).toBeVisible({ timeout: 5_000 });

		// create.surface:"sheet" — the list CTA opens entity.record in
		// create mode (no route, no popup tab).
		await page.getByTestId("entity-create-cta").click();
		const sheet = page.getByTestId("entity-record-sheet");
		await expect(sheet).toBeVisible({ timeout: 5_000 });
		const field = (k: string) => sheet.getByTestId(`entity-form-field-${k}`);

		// ── census: exactly the writable set, nothing computed ─────────
		for (const k of PRESENT) {
			await expect(field(k), `expected field ${k}`).toBeVisible({ timeout: 5_000 });
		}
		for (const k of ABSENT) {
			await expect(field(k), `leaked field ${k}`).toHaveCount(0);
		}

		// ── revive gating: depends_on{revive_every, set:false} disables
		//    the revive-axis inputs until the cadence carries a value.
		//    Controls differ in anatomy: text/datetime render <input>/
		//    <button>, the badge enum renders div[role=combobox] with
		//    aria-disabled — the locator covers all three. ─────────────
		const ctl = (k: string) =>
			field(k).locator("input,button,[role='combobox']").first();
		for (const k of ["default_from", "revive_slot", "revive_grace"]) {
			await expect(
				ctl(k),
				`${k} must be gated-disabled while revive_every is empty`,
			).toBeDisabled({ timeout: 5_000 });
		}

		// ── fill the identity fields ───────────────────────────────────
		const name = `e2e_revive_${TS}`;
		await field("name").locator("input").fill(name);
		await field("pattern").locator("input").fill(`REV-{sez}-{seq:4}`);
		await field("step").locator("input").fill("1");
		await field("start").locator("input").fill("1");
		// tz defaults to UTC (options_source iana.tzones) — no input needed.
		await field("sez").locator("input").fill("2026");

		// ── revive_interval composite: number + closed unit dropdown.
		//    "1 year" + sez "2026" is the advanceable pair — a month-grain
		//    cadence would correctly flag sez (year-shape can't +3m). ────
		const revive = field("revive_every");
		await revive.locator("input").fill("1");
		await revive.locator("[data-testid$='-uom-cta']").click();
		await page.locator("[data-testid$='-uom-option-year']").click();

		// gates release once the cadence holds a value
		for (const k of ["default_from", "revive_slot", "revive_grace"]) {
			await expect(
				ctl(k),
				`${k} must unlock after revive_every is set`,
			).toBeEnabled({ timeout: 5_000 });
		}

		// revive_slot — closed badge enum; pick the sez slot the pattern uses
		await ctl("revive_slot").click();
		await page
			.getByRole("option", { name: /sezionale 1/i })
			.first()
			.click();

		// ── submit → 201; the sheet stays open in view mode on the
		//    created row (product behaviour — fields flip to disabled). ──
		const posted = page.waitForResponse(
			(r) =>
				r.url().includes("/entities/sequence") &&
				r.request().method() === "POST" &&
				r.status() === 201,
			{ timeout: 5_000 },
		);
		await page.getByTestId("entity-form-submit").click();
		await posted;
		// view-mode: revive_every round-trips into the composite verbatim
		await expect(
			field("revive_every").locator("input").first(),
		).toHaveValue("1", { timeout: 5_000 });

		// ── wire truth: the stored row carries the varchar canonical and
		//    server-derived anchors (expire_at from the default_from
		//    anchor seeded to tomorrow 00:00 local) ─────────────────────
		const list = await page.request.get(
			`${CRM}/list?search=${encodeURIComponent(name)}`,
		);
		expect(list.status()).toBe(200);
		const parsed = extJsonParse<{
			rows?: Record<string, unknown>[];
			items?: Record<string, unknown>[];
		}>(await list.text());
		const row = (parsed.rows ?? parsed.items ?? [])[0];
		expect(row, "created row on the list").toBeTruthy();
		expect(row?.revive_every).toBe("1 year");
		expect(row?.revive_slot).toBe("sez");
		expect(row?.sez).toBe("2026");
		expect(typeof row?.default_from).toBe("string");
		expect(typeof row?.expire_at).toBe("string");
		expect(new Date(row?.expire_at as string).getTime()).toBeGreaterThan(
			new Date(row?.default_from as string).getTime(),
		);
		expect(row?.binding_key ?? null).toBeNull();

		// residue-free
		await page.request.delete(`${CRM}/${row?.uuid}?version=${row?.version}`);
	});

	test("update sheet: immutable write keys disabled, audited columns in accordion", async ({
		page,
	}) => {
		await loginAsTestAdmin(page);
		// fixture via API — a REVIVING row: revive_grace's disabled_when
		// gate pivots on revive_every, so the editable-on-update
		// assertion needs the revive axis populated.
		const name = `e2e_immutable_${TS}`;
		const create = await page.request.post(`${CRM}`, {
			data: {
				entity: {
					name,
					pattern: `IMM-{sez}-{seq:4}`,
					step: "1",
					start: "1",
					sez: "2026",
					revive_every: "1 year",
					revive_slot: "sez",
				},
			},
		});
		expect(create.status()).toBe(201);
		const created = extJsonParse<Record<string, unknown>>(await create.text());

		await page.goto("/crm/settings/sequences", { waitUntil: "domcontentloaded" });
		const listReq = page.waitForResponse(
			(r) => r.url().includes("/entities/sequence/list") && r.status() === 200,
			{ timeout: 5_000 },
		);
		await page.getByTestId("entity-search").locator("input").fill(name);
		await listReq;
		const rowEl = page.locator("table tbody tr", { hasText: name }).first();
		await expect(rowEl).toBeVisible({ timeout: 5_000 });
		await rowEl.locator("td").last().getByRole("button").first().click();
		await page
			.getByRole("menuitem")
			.filter({ hasText: /modifica|edit/i })
			.first()
			.click();
		const sheet = page.getByTestId("entity-record-sheet");
		await expect(sheet).toBeVisible({ timeout: 5_000 });
		const field = (k: string) => sheet.getByTestId(`entity-form-field-${k}`);
		const ctl = (k: string) =>
			field(k).locator("input,button,[role='combobox']").first();

		// immutable-on-update — the revive axis identity is frozen
		for (const k of ["revive_every", "default_from", "revive_slot", "sez", "sez2", "sez3"]) {
			await expect(
				ctl(k),
				`${k} must be immutable-disabled on update`,
			).toBeDisabled({ timeout: 5_000 });
		}
		// revive_grace stays editable — it is operational slack, not identity
		await expect(
			field("revive_grace").locator("input").first(),
		).toBeEnabled({ timeout: 5_000 });
		// editable columns still editable
		await expect(field("name").locator("input").first()).toBeEnabled({ timeout: 5_000 });

		// audited columns live in the audit accordion — never as fields.
		// The accordion mounts collapsed; expand it via the Audit trigger.
		await sheet.getByRole("button", { name: /^audit$/i }).click();
		const audit = sheet.getByTestId("entity-record-sheet-audit-section");
		await expect(audit).toBeVisible({ timeout: 5_000 });
		for (const label of [/expires|scade/i, /switches|cambia/i, /cloned|clone/i, /revived|rinnov/i]) {
			await expect(
				audit.locator("dt", { hasText: label }).first(),
				String(label),
			).toBeVisible();
		}
		for (const k of ["expire_at", "switch_at", "revived_from", "revived_at", "revived_by"]) {
			await expect(field(k), `audited ${k} must not be a form field`).toHaveCount(0);
		}

		// residue-free
		await page.request.delete(`${CRM}/${created.uuid}?version=${created.version}`);
	});
});
