/**
 * `version` on the wire is bigint BY CONSTRUCTION — every transport
 * (HTTP bodies, SSE markers, MCP results) parses through extJsonParse,
 * where every integer decodes as native bigint. A `number` version is
 * never wire-legitimate: it is a client-side vestige (a manual `Number()`
 * conversion or a literal) and the dual-guard tolerance of the past only
 * masked that drift.
 *
 * The extraction is SEMI-silent by design — the same failure philosophy
 * as the depends-on scalar gates: the value is recovered (the optimistic
 * lock must keep working — a lost version is a lost save) and the dev
 * console carries the trace so the vestige gets found and removed.
 */

/**
 * Extract the optimistic-lock version from a wire-shaped row.
 *   - bigint  → verbatim (the by-construction case)
 *   - number  → recovered to bigint + dev-console trace (vestige)
 *   - absent/other → `0n` (create pages never send a version anyway)
 */
export function wireVersion(v: unknown, context: string): bigint {
	if (typeof v === 'bigint') return v;
	if (typeof v === 'number') {
		if (import.meta.env.DEV) {
			console.error(
				`[version] number on the version channel — bigint by construction — ${context}:`,
				v,
			);
		}
		return BigInt(Math.trunc(v));
	}
	return 0n;
}
