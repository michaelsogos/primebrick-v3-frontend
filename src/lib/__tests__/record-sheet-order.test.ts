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
