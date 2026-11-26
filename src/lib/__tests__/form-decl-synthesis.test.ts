import { describe, it, expect } from "vitest";
import { synthesizeFormDecl } from "../entity-form/build-entity-form-schema";
import type { EntityMeta, MetaColumn } from "$lib/entity-list/types";

const col = (key: string, order: number, over: Partial<MetaColumn> = {}): MetaColumn =>
	({ key, label_key: `app.fields.${key}`, type: "text", order, ...over }) as MetaColumn;

const metaOf = (columns: MetaColumn[]): EntityMeta =>
	({
		entity: "test_entity",
		translation_key: "test_entity",
		uid: "uuid",
		columns,
	}) as unknown as EntityMeta;

const keys = (meta: EntityMeta) => synthesizeFormDecl(meta).fields.map((f) => f.key);

describe("synthesizeFormDecl — fallback placement contract", () => {
	it("emits business fields sorted by `order`, not array position", () => {
		const meta = metaOf([
			col("z_last", 9),
			col("a_first", 1),
			col("m_mid", 5),
		]);
		expect(keys(meta)).toEqual(["a_first", "m_mid", "z_last"]);
	});

	it("keeps declared order for columns without `order` (stable index)", () => {
		const meta = metaOf([
			col("b_two", Number.NaN),
			col("a_one", Number.NaN),
		]);
		expect(keys(meta)).toEqual(["b_two", "a_one"]);
	});

	it("excludes the system partition — uid, version, audited, hidden", () => {
		const meta = metaOf([
			col("uuid", 0, { audited: true }),
			col("name", 1),
			col("version", 2, { audited: true }),
			col("created_at", 3, { audited: true }),
			col("updated_at", 4, { audited: true }),
			col("internal_flag", 5, { hidden: true }),
		]);
		expect(keys(meta)).toEqual(["name"]);
	});

	it("excludes `kind` projections — calculated and virtual never become widgets", () => {
		const meta = metaOf([
			col("name", 1),
			col("value_next", 2, { kind: "virtual" }),
			col("computed_total", 3, { kind: "calculated" }),
			col("note", 4),
		]);
		expect(keys(meta)).toEqual(["name", "note"]);
	});

	it("excludes `managed` columns — server-owned, never writable", () => {
		const meta = metaOf([
			col("name", 1),
			col("emitted_last", 2, { managed: true }),
		]);
		expect(keys(meta)).toEqual(["name"]);
	});
});
