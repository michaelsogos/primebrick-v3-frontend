/**
 * Section layout helpers — pure functions over `PageLayoutDecl`/
 * `PageSectionDecl` so the grid mapping is unit-testable without DOM.
 *
 * One layout archetype: CSS grid. `columns`/`rows`/`gap` are pass-through
 * CSS values declared by the module; placement is auto-flow unless a section
 * pins `col`/`row`. The contract is validated at `service.register` time
 * (`validateNavDeclaration`) — these helpers re-parse defensively anyway.
 */
import type { PageLayoutDecl, PageSectionDecl } from '@primebrick/ui';

/** `remote:<export>` | `host:<key>` — validated at decl time; null when malformed. */
export function parseSectionSource(
	source: string,
): { kind: 'remote' | 'host'; name: string } | null {
	const i = source.indexOf(':');
	if (i < 0) return null;
	const kind = source.slice(0, i);
	const name = source.slice(i + 1);
	if ((kind !== 'remote' && kind !== 'host') || !/^[A-Za-z_$][\w$]*$/.test(name)) {
		return null;
	}
	return { kind, name };
}

/** Inline style for the grid container — defaults produce the 1-col stack. */
export function layoutGridStyle(layout: PageLayoutDecl): string {
	const parts = [
		'display:grid',
		`gap:${layout.gap ?? '1.5rem'}`,
		`grid-template-columns:${layout.columns ?? '1fr'}`,
	];
	if (layout.rows) parts.push(`grid-template-rows:${layout.rows}`);
	return parts.join(';');
}

/**
 * Inline style for a section's grid cell — `col`+`span` pin the column
 * track, `row` pins the row track. Absent placement = auto-flow order.
 */
export function sectionCellStyle(section: PageSectionDecl): string {
	const parts: string[] = [];
	if (section.col !== undefined) {
		parts.push(`grid-column:${section.col} / span ${section.span ?? 1}`);
	} else if (section.span !== undefined && section.span > 1) {
		parts.push(`grid-column:span ${section.span}`);
	}
	if (section.row !== undefined) parts.push(`grid-row:${section.row}`);
	return parts.join(';');
}
