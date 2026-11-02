/**
 * Data-aware JSON completions for the job-rule form's raw JSON editors —
 * suggestions the authored `json_schema` cannot express because they depend
 * on RUNTIME data (the selected source event's `payload_schema`) and on
 * sibling values inside the document itself.
 *
 * One source, three positions:
 *
 * - inside a `"field"` property value → dot-paths (`$.a.b`) walked from the
 *   source event schema (all levels, leaf type shown as detail)
 * - inside a `"value"` property value → candidates for the sibling `"field"`
 *   of the same `{field, op?, value}` object: `enum` members first, then
 *   type-shaped candidates (true/false for boolean)
 * - inside a `"path"` property value (`payload_map` DST) → the same
 *   dot-paths; `"meta"` → the `PAYLOAD_MAP_META_KINDS` vocabulary
 *
 * The source schema is ALWAYS the single event selected in
 * `event_subject` — never a merge of all census events (the payload the
 * rule receives is exactly that event's payload).
 *
 * Registered through JsonEditor's `extra_completions` prop as a
 * language-data provider; the schema LS keeps owning property-name and
 * enum completions, this only answers at value positions the schema
 * cannot know about. Returns `null` everywhere else.
 *
 * Node names come from the @lezer/json grammar the editor's json()
 * language produces (Object/Property/PropertyName/JsonString/...).
 */
import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { PAYLOAD_MAP_META_KINDS } from '@primebrick/ui';

interface JsonSchema {
	type?: string;
	description?: string;
	properties?: Record<string, JsonSchema>;
	required?: string[];
	enum?: unknown[];
	items?: JsonSchema;
	[k: string]: unknown;
}

interface CmCompletionContext {
	pos: number;
	explicit: boolean;
	state: EditorState;
}

interface CmCompletion {
	label: string;
	type?: string;
	detail?: string;
	apply?: string;
}

interface CmCompletionResult {
	from: number;
	to?: number;
	options: CmCompletion[];
	validFor?: RegExp;
}

type SyntaxNodeLike = {
	name: string;
	from: number;
	to: number;
	parent: SyntaxNodeLike | null;
	nextSibling: SyntaxNodeLike | null;
	getChild(name: string): SyntaxNodeLike | null;
	firstChild: SyntaxNodeLike | null;
};

/** All `$.`-rooted dot paths through the schema, depth ≤ 5. */
export function schemaDotPaths(schema: JsonSchema): { path: string; type: string }[] {
	const out: { path: string; type: string }[] = [];
	const walk = (s: JsonSchema | undefined, prefix: string, depth: number) => {
		if (!s?.properties || depth > 5) return;
		for (const [key, sub] of Object.entries(s.properties)) {
			const path = `${prefix}.${key}`;
			out.push({ path, type: sub.type ?? 'object' });
			walk(sub, path, depth + 1);
		}
	};
	walk(schema, '$', 1);
	return out;
}

/** Resolve a `$.a.b` path to its schema node (for value candidates). */
function schemaAtPath(schema: JsonSchema, path: string): JsonSchema | undefined {
	const segs = path.replace(/^\$\.?/, '').split('.').filter(Boolean);
	let node: JsonSchema | undefined = schema;
	for (const seg of segs) {
		node = node?.properties?.[seg] ?? (node?.items?.properties?.[seg] as JsonSchema | undefined);
	}
	return node;
}

/** Candidate literals for a field's schema — enum members, else
 *  type-shaped candidates for the common operators. */
function valueCandidates(sub: JsonSchema | undefined): { label: string; apply: unknown }[] {
	if (!sub) return [];
	if (Array.isArray(sub.enum)) return sub.enum.map((v) => ({ label: JSON.stringify(v), apply: v }));
	if (sub.type === 'boolean') return ['true', 'false'].map((v) => ({ label: v, apply: v }));
	if (sub.type === 'number' || sub.type === 'integer')
		return [{ label: '0', apply: 0 }];
	return [];
}

/** Text of a JsonString node's CONTENT (quotes stripped) — tolerates an
 *  unterminated string while the user is mid-typing. */
function stringContent(state: EditorState, node: SyntaxNodeLike): string {
	const raw = state.sliceDoc(node.from, node.to);
	return raw.replace(/^"/, '').replace(/"$/, '');
}

/** The `{from,to}` a completion should replace: inside a string token the
 *  content between its quotes; otherwise the cursor point. */
function replaceRange(
	ctx: CmCompletionContext,
	innermost: SyntaxNodeLike,
): { from: number; to: number; inString: boolean } {
	if (innermost.name === 'JsonString') {
		const raw = ctx.state.sliceDoc(innermost.from, innermost.to);
		const hasOpen = raw.startsWith('"');
		const hasClose = raw.length > 1 && raw.endsWith('"');
		return {
			from: innermost.from + (hasOpen ? 1 : 0),
			to: innermost.to - (hasClose ? 1 : 0),
			inString: true,
		};
	}
	return { from: ctx.pos, to: ctx.pos, inString: false };
}

/** The string VALUE of a named property inside an Object node, if present. */
function propStringValue(
	state: EditorState,
	obj: SyntaxNodeLike,
	name: string,
): string | undefined {
	for (let child = obj.firstChild; child; child = child.nextSibling as SyntaxNodeLike | null) {
		if (child.name !== 'Property') continue;
		const nameNode = child.getChild('PropertyName');
		if (!nameNode) continue;
		if (stringContent(state, nameNode) !== name) continue;
		// The value node is the Property's last child.
		let valueNode: SyntaxNodeLike | null = null;
		for (let c = child.firstChild; c; c = c.nextSibling as SyntaxNodeLike | null) valueNode = c;
		if (valueNode && valueNode !== nameNode && valueNode.name === 'JsonString') {
			return stringContent(state, valueNode);
		}
	}
	return undefined;
}

/**
 * Build the completion source for a rule form's JSON editors.
 * `sourceSchema` = the payload_schema of the emit selected in
 * `event_subject`; undefined → source stays silent (no event chosen yet).
 */
export function ruleJsonCompletions(
	sourceSchema: Record<string, unknown> | undefined,
): (context: CmCompletionContext) => CmCompletionResult | null {
	const schema = sourceSchema as JsonSchema | undefined;
	return (ctx) => {
		if (!schema) return null;
		const tree = syntaxTree(ctx.state);
		const innermost = tree.resolveInner(ctx.pos, 0) as unknown as SyntaxNodeLike;

		// Enclosing Property (skip when the cursor is in its key) and Object.
		let prop: SyntaxNodeLike | null = innermost;
		while (prop && prop.name !== 'Property') prop = prop.parent;
		if (!prop) return null;
		const nameNode = prop.getChild('PropertyName');
		if (!nameNode || ctx.pos <= nameNode.to) return null;
		const propName = stringContent(ctx.state, nameNode);
		const obj = prop.parent;
		if (!obj || obj.name !== 'Object') return null;

		const { from, to, inString } = replaceRange(ctx, innermost);
		const quote = (v: unknown) => (inString ? String(v) : JSON.stringify(v));

		if (propName === 'field' || propName === 'path') {
			// Dot-paths into the selected event's payload.
			return {
				from,
				to,
				options: schemaDotPaths(schema).map((p) => ({
					label: p.path,
					type: 'property',
					detail: p.type,
					apply: inString ? p.path : `"${p.path}"`,
				})),
				validFor: /^[\w$.]*$/,
			};
		}
		if (propName === 'meta') {
			return {
				from,
				to,
				options: PAYLOAD_MAP_META_KINDS.map((k) => ({
					label: k,
					type: 'constant',
					apply: quote(k),
				})),
				validFor: /^[\w-]*$/,
			};
		}
		if (propName === 'value') {
			// Candidates for the sibling `field` of this {field, op?, value}.
			const fieldPath = propStringValue(ctx.state, obj, 'field');
			if (!fieldPath) return null;
			const candidates = valueCandidates(schemaAtPath(schema, fieldPath));
			if (!candidates.length) return null;
			return {
				from,
				to,
				options: candidates.map((c) => ({
					label: c.label,
					type: 'value',
					apply: quote(c.apply),
				})),
				validFor: /^[\w$."-]*$/,
			};
		}
		return null;
	};
}
