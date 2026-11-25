/**
 * `llmControlParse` — the ONE sanctioned parse path for LLM **orchestration**
 * output: the small control payloads model turns emit to drive the caller's
 * loop (`{"select":2}`, `{"apply":true}`, `{"positive":[…]}` — verdicts,
 * picks, transient examples).
 *
 * Why this is NOT ext-json: the ext-json codec is the contract of the
 * Primebrick WIRE — every integer decodes as bigint because domain data
 * (row versions, totals, surrogate ids) demands precision safety. LLM
 * orchestration JSON is not wire domain data: it is engine signaling,
 * produced by a model that only ever emits small integers, consumed by
 * control-flow comparisons the ecosystem writes as `typeof x === 'number'`.
 * Parsing it through the wire codec makes every numeric verdict unreadable
 * (`{"select":2}` decodes `2n`, the `typeof === 'number'` guard dies, the
 * pick never registers) — the failure that motivated this boundary.
 *
 * The symmetric half of the contract: LLM output that IS domain-destined
 * — entity write args, type-build configs with reactive form effects —
 * keeps riding `extJsonParse` at the handoff into domain land (see
 * `ai-action-confirm-dialog`'s argsText round-trip). Orchestration here,
 * domain there — the boundary is the parse call, chosen once, in this file.
 *
 * Robustness mirrors what the panels already do by hand: markdown fences
 * stripped, the first balanced `{…}` extracted when the model wraps the
 * verdict in prose. The brace matcher is string-aware — braces inside
 * string literals (regex quantifiers `\d{2,4}`, json snippets) do not
 * unbalance the extraction.
 */
export function llmControlParse<T = unknown>(raw: string): T {
	let text = raw.trim();
	text = text.replace(/^```(?:json)?\s*\n?/i, '');
	text = text.replace(/^json\s*\n/i, '');
	text = text.replace(/\n?```\s*$/i, '').trim();
	if (!text.startsWith('{')) {
		const start = text.indexOf('{');
		if (start < 0) throw new SyntaxError('llm-control: no object in output');
		let depth = 0;
		let end = -1;
		let inString = false;
		let escaped = false;
		for (let i = start; i < text.length; i++) {
			const c = text[i];
			if (escaped) {
				escaped = false;
				continue;
			}
			if (c === '\\' && inString) {
				escaped = true;
				continue;
			}
			if (c === '"') {
				inString = !inString;
				continue;
			}
			if (inString) continue;
			if (c === '{') depth++;
			else if (c === '}') {
				depth--;
				if (depth === 0) {
					end = i;
					break;
				}
			}
		}
		if (end < 0) throw new SyntaxError('llm-control: unbalanced object in output');
		text = text.slice(start, end + 1);
	}
	return JSON.parse(text) as T;
}
