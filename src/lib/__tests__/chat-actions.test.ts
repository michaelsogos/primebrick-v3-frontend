/**
 * `parseClassification` — the verdict-shape contract of the LLM
 * orchestration boundary. Regression: parsed through the wire codec,
 * `select` decoded as bigint and the pick guards died silently — the
 * numbered choices in every assistant panel could never resolve.
 */
import { describe, it, expect } from 'vitest';
import { parseClassification, type PendingActionSpec } from '../components/ui/smart-ai/chat-actions';

const pickSpecs: PendingActionSpec[] = [
	{ id: 'pick', index: 0, label: 'first' },
	{ id: 'pick', index: 1, label: 'second' },
	{ id: 'pick', index: 2, label: 'third' },
];

describe('parseClassification', () => {
	it('resolves a numeric pick verdict — the bigint regression', () => {
		expect(parseClassification('{"select": 2}', pickSpecs)).toEqual({ action: 'pick', index: 1 });
		expect(parseClassification('{"select": 1}', pickSpecs)).toEqual({ action: 'pick', index: 0 });
		expect(parseClassification('{"select": 3}', pickSpecs)).toEqual({ action: 'pick', index: 2 });
	});

	it('resolves picks from prose-wrapped and fenced output', () => {
		expect(parseClassification('The user chose: {"select": 1} — confirmed', pickSpecs)).toEqual({
			action: 'pick',
			index: 0,
		});
		expect(parseClassification('```json\n{"select": 2}\n```', pickSpecs)).toEqual({
			action: 'pick',
			index: 1,
		});
	});

	it('an out-of-range pick is not an action', () => {
		expect(parseClassification('{"select": 9}', pickSpecs)).toBeNull();
	});

	it('resolves apply and discard verdicts (boolean — never bigint-affected)', () => {
		const specs: PendingActionSpec[] = [{ id: "apply", label: "Apply" }, { id: "discard", label: "Discard" }];
		expect(parseClassification('{"apply": true}', specs)).toEqual({ action: 'apply' });
		expect(parseClassification('{"discard": true}', specs)).toEqual({ action: 'discard' });
	});

	it('plain prose is not an action — a normal message must never degrade into a false pick', () => {
		expect(parseClassification('tell me more about the second one', pickSpecs)).toBeNull();
	});
});
