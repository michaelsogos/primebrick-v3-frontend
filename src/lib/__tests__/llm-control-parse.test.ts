/**
 * `llmControlParse` — the orchestration-boundary parse contract: plain
 * JSON semantics for engine signaling (numbers stay number), prose/fence
 * extraction, string-aware brace matching. The domain-destined half of
 * the boundary (extJsonParse) is deliberately NOT here — see the helper's
 * header for the split.
 */
import { describe, it, expect } from 'vitest';
import { llmControlParse } from '../components/ui/smart-ai/llm-control-parse';

describe('llmControlParse', () => {
	it('parses numeric verdicts as number — the pick-action regression', () => {
		// extJsonParse decodes `2` as 2n and the typeof guard dies; plain
		// orchestration semantics keep it a number.
		const p = llmControlParse<{ select: unknown }>('{"select": 2}');
		expect(p.select).toBe(2);
		expect(typeof p.select).toBe('number');
	});

	it('parses boolean verdicts verbatim', () => {
		const p = llmControlParse<{ apply: unknown }>('{"apply": true}');
		expect(p.apply).toBe(true);
	});

	it('strips markdown fences and json prefixes', () => {
		const p = llmControlParse<{ select: unknown }>('```json\n{"select": 1}\n```');
		expect(p.select).toBe(1);
	});

	it('extracts the first balanced object from prose-wrapped output', () => {
		const p = llmControlParse<{ select: unknown }>(
			'The user wants the second pattern, so: {"select": 2} — that is my verdict.',
		);
		expect(p.select).toBe(2);
	});

	it('brace matching is string-aware — regex quantifiers do not unbalance', () => {
		// `\d{2,4}` inside a string literal carries braces; a naive counter
		// closes the object early and the extraction corrupts. JSON-escaped
		// as `\\d` on the wire, the pattern value is `\d{2,4}` once parsed.
		const p = llmControlParse<{ patterns: { pattern: string }[] }>(
			'{"patterns": [{"pattern": "^\\\\d{2,4}$"}]}',
		);
		expect(p.patterns[0].pattern).toBe('^\\d{2,4}$');
	});

	it('escaped quotes inside strings do not close the string early', () => {
		const p = llmControlParse<{ description: unknown }>(
			'{"description": "matches \\"quoted\\" text"}',
		);
		expect(p.description).toBe('matches "quoted" text');
	});

	it('throws on output with no object — the caller treats it as a normal message', () => {
		expect(() => llmControlParse('just prose, no verdict')).toThrow();
	});

	it('throws on unbalanced objects', () => {
		expect(() => llmControlParse('{"select": 2')).toThrow();
	});

	it('parses nested arrays and string arrays (test-example payloads)', () => {
		const p = llmControlParse<{ positive: unknown }>(
			'{"positive": ["abc", "def"], "negative": ["xyz"]}',
		);
		expect(Array.isArray(p.positive)).toBe(true);
	});
});
