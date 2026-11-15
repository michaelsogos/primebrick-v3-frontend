import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/svelte";

vi.mock("$lib/i18n", () => ({
	t: { subscribe: (fn: (v: (k: string) => string) => void) => { fn((k: string) => k); return () => {}; } },
	dict: { subscribe: (fn: (v: Record<string, unknown>) => void) => { fn({}); return () => {}; } },
	getDictKeys: () => [],
}));

vi.mock("$lib/entity-form/use-census-subject-options.svelte", () => ({
	useCensusSubjectOptions: () => ({ emitsOptions: [], callablesOptions: [] }),
}));

vi.mock("$lib/composables/useAuditBox", () => ({
	useAuditBox: () => ({ formatValue: (v: unknown) => String(v ?? "-") }),
}));

// The ordering contract under test lives in the sheet body's own
// partition/sort — EntityFormField is stubbed to a key echo.
vi.mock("$lib/entity-form/EntityFormField.svelte", async () => {
	const m = await import("./FieldEcho.svelte");
	return { default: m.default };
});

import EntityRecordSheetBody from "../entity-list/sheets/EntityRecordSheetBody.svelte";
import type { EntityMeta, MetaColumn } from "$lib/entity-list/types";
import type { FormFieldPlacement } from "@primebrick/ui";

const col = (key: string, order: number, over: Partial<MetaColumn> = {}): MetaColumn =>
	({ key, label_key: `fields.${key}`, type: "text", order, ...over }) as MetaColumn;

const metaOf = (columns: MetaColumn[]): EntityMeta =>
	({
		entity: "test_entity",
		translation_key: "test_entity",
		uid: "uuid",
		columns,
	}) as unknown as EntityMeta;

const fieldKeys = (container: HTMLElement) =>
	Array.from(container.querySelectorAll('[id^="record-sheet-field-"]')).map((e) =>
		e.id.replace("record-sheet-field-", ""),
	);

const renderBody = (columns: MetaColumn[]) =>
	render(EntityRecordSheetBody, {
		props: {
			meta: metaOf(columns),
			record: { uuid: "u-1" },
			formPlacements: [],
			formTwoCol: false,
			draft: {},
		},
	});

describe("EntityRecordSheetBody fallback — meta.columns order contract", () => {
	it("renders business fields sorted by `order`, not array position", () => {
		const { container } = renderBody([
			col("z_last", 9),
			col("a_first", 1),
			col("m_mid", 5),
		]);
		expect(fieldKeys(container)).toEqual(["a_first", "m_mid", "z_last"]);
	});

	it("renders a sticky non-uid column before normal ones (sticky group first)", () => {
		const { container } = renderBody([
			col("norm", 2),
			col("sticky_col", 6, { sticky: true }),
			col("norm2", 4),
		]);
		expect(fieldKeys(container)).toEqual(["sticky_col", "norm", "norm2"]);
	});

	it("keeps array index when `order` is absent (last-resort fallback)", () => {
		const { container } = renderBody([
			col("z", undefined as unknown as number),
			col("q", undefined as unknown as number),
			col("m", undefined as unknown as number),
		]);
		expect(fieldKeys(container)).toEqual(["z", "q", "m"]);
	});

	it("partitions uid → top badge, audited → bottom section, version → out", () => {
		const { container } = renderBody([
			col("audited2", 8, { audited: true }),
			col("field_b", 7),
			col("version", 99),
			col("uuid", -1, { sticky: true }),
			col("audited1", 3, { audited: true }),
			col("field_a", 1),
		]);

		// Form surface: only business columns, sorted by order.
		expect(fieldKeys(container)).toEqual(["field_a", "field_b"]);

		// Audit section: audited columns only, sorted by order too.
		const audit = container.querySelector('[data-testid="entity-record-sheet-audit-section"]');
		expect(audit).not.toBeNull();
		const auditKeys = Array.from(audit!.querySelectorAll("dt")).map((dt) =>
			dt.textContent!.replace(":", "").replace("fields.", ""),
		);
		expect(auditKeys).toEqual(["audited1", "audited2"]);
	});
});

describe("EntityRecordSheetBody formPlacements — collapse order contract", () => {
	const renderPlaced = (
		placements: { key: string; p?: Partial<FormFieldPlacement>; order?: number }[],
	) =>
		render(EntityRecordSheetBody, {
			props: {
				meta: metaOf(placements.map(({ key, order }, i) => col(key, order ?? i))),
				record: { uuid: "u-1" },
				formTwoCol: placements.some(({ p }) => (p?.col ?? 1) > 1),
				formPlacements: placements.map(({ key, p, order }, i) => ({
					col: col(key, order ?? i),
					p: { key, ...p } as FormFieldPlacement,
				})),
				draft: {},
			},
		});

	it("follows placement declaration order, never the column meta `order`", () => {
		// Meta ranks payload_map first, the form declaration puts it last —
		// page form and record sheet share the declaration, so the sheet
		// must keep the declaration's sequence (name first).
		const { container } = renderPlaced([
			{ key: "name", order: 60 },
			{ key: "event_subject", order: 50 },
			{ key: "payload_map", order: 1, p: { col: 2, row: 1, row_span: 7 } },
		]);
		expect(fieldKeys(container)).toEqual(["name", "event_subject", "payload_map"]);
	});

	it("resets row/col pinning on the collapse breakpoint (col-2/row-1 field)", () => {
		// Regression: `grid-row-start:1` survived the @max-xl reset and pinned
		// payload_map above every auto-flowed field in the collapsed sheet.
		// The wrapper must neutralize BOTH axes below @xl so the single-column
		// layout flows in DOM order.
		const { container } = renderPlaced([
			{ key: "name" },
			{ key: "payload_map", p: { col: 2, row: 1, row_span: 7 } },
		]);
		const wrapper = container.querySelector("#record-sheet-field-payload_map")!
			.parentElement as HTMLElement;
		// The pin is still emitted for the @xl two-column surface…
		expect(wrapper.getAttribute("style")).toContain("grid-row-start: 1");
		// …and the @max-xl important resets disarm it on collapse.
		expect(wrapper.className).toContain("row-start-auto");
		expect(wrapper.className).toContain("row-end-auto");
		expect(wrapper.className).toContain("col-start-auto");
	});
});
