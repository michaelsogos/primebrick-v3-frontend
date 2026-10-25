import { describe, expect, it } from 'vitest';
import {
	layoutGridStyle,
	parseSectionSource,
	sectionCellStyle,
} from '../components/remote-page/section-layout';

describe('parseSectionSource', () => {
	it('parses remote and host sources', () => {
		expect(parseSectionSource('remote:mountModels')).toEqual({
			kind: 'remote',
			name: 'mountModels',
		});
		expect(parseSectionSource('host:entity_table')).toEqual({
			kind: 'host',
			name: 'entity_table',
		});
	});
	it('rejects malformed sources', () => {
		expect(parseSectionSource('chunk:mountX')).toBeNull();
		expect(parseSectionSource('remote:')).toBeNull();
		expect(parseSectionSource('remote:foo-bar')).toBeNull();
		expect(parseSectionSource('nocolon')).toBeNull();
	});
});

describe('layoutGridStyle', () => {
	it('defaults to the single-column stack', () => {
		expect(layoutGridStyle({ sections: [] })).toBe(
			'display:grid;gap:1.5rem;grid-template-columns:1fr',
		);
	});
	it('passes through declared grid values', () => {
		expect(
			layoutGridStyle({ columns: '280px 1fr', rows: 'auto', gap: '1rem', sections: [] }),
		).toBe('display:grid;gap:1rem;grid-template-columns:280px 1fr;grid-template-rows:auto');
	});
});

describe('sectionCellStyle', () => {
	it('empty placement = auto-flow', () => {
		expect(sectionCellStyle({ id: 'a', source: 'remote:x' })).toBe('');
	});
	it('span alone emits span syntax', () => {
		expect(sectionCellStyle({ id: 'a', source: 'remote:x', span: 2 })).toBe(
			'grid-column:span 2',
		);
	});
	it('col pins the track start', () => {
		expect(sectionCellStyle({ id: 'a', source: 'remote:x', col: 2, span: 3 })).toBe(
			'grid-column:2 / span 3',
		);
		expect(sectionCellStyle({ id: 'a', source: 'remote:x', col: 2 })).toBe(
			'grid-column:2 / span 1',
		);
	});
	it('row pins the row track', () => {
		expect(sectionCellStyle({ id: 'a', source: 'remote:x', row: 3 })).toBe('grid-row:3');
	});
});
