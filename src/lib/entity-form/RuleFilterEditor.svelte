<script lang="ts">
	/**
	 * RuleFilterEditor — the guided composer for `format:"rule_filter"`
	 * columns (`job_trigger.filter`). Mirrors the ELT advanced-filter
	 * anatomy (field + operator + value → committed list) adapted to the
	 * RuleFilter vocabulary: `{field: dot-path, op, value}` resolved
	 * against the SELECTED event's payload_schema, never a MetaColumn.
	 *
	 * Wire contract is unchanged — the column stays a JSON string of
	 * `RuleFilter[]`; the engine's `matchFilter` is `.every()` so there is
	 * deliberately no AND/OR toggle (it would lie). Committed criteria
	 * render as `w-fit` badges below the composer — X removes, no edit
	 * (remove + re-add). "Edit the raw JSON" falls back to the same
	 * JsonValueEditor the `json` format renders.
	 */
	import {
		Badge,
		Button,
		ComboSelect,
		JsonValueEditor,
		NumericInput,
		PropNavigator,
		TextInput,
		schemaToNavNodes,
		type PropNavNode,
		type SchemaLike,
	} from '@primebrick/ui';
	import { X as XIcon, Plus } from '@primebrick/ui/vendor/lucide';
	import { t } from '$lib/i18n';
	import {
		schemaAtPath,
		type JsonSchema,
	} from './rule-schema-completions';
	import type { EditorState } from '@codemirror/state';

import { extJsonStringify, extJsonParse } from '$lib/api-ext';
	type RuleOp = 'eq' | 'neq' | 'exists' | 'contains' | 'gt' | 'lt';
	type RuleFilterItem = { field: string; op?: RuleOp; value?: unknown };

	interface Props {
		value: string;
		/** payload_schema of the emit selected in `event_subject` —
		 *  the field vocabulary and per-path value semantics come from it. */
		source_schema?: Record<string, unknown>;
		readonly?: boolean;
		disabled?: boolean;
		placeholder?: string;
		/** Passthrough props for the embedded JsonValueEditor (raw mode). */
		schema?: Record<string, unknown>;
		on_ai_assist?: (() => void) | undefined;
		extra_completions?:
			| ((context: { pos: number; explicit: boolean; state: EditorState }) => unknown)[]
			| undefined;
		[k: string]: unknown;
	}

	let {
		value = $bindable(''),
		source_schema,
		readonly = false,
		disabled = false,
		placeholder,
		schema,
		on_ai_assist,
		extra_completions,
		...rest
	}: Props = $props();

	const OP_ICON: Record<RuleOp, string> = {
		eq: 'equal',
		neq: 'equal-not',
		exists: 'question-mark',
		contains: 'text-search',
		gt: 'chevron-right',
		lt: 'chevron-left',
	};

	// Schema leaf → the ops the JH `matchFilter` can meaningfully evaluate
	// on it. `exists` is offered on EVERY leaf — it asks about presence,
	// not value, and is the ONLY honest test on object/array leaves.
	function opsForLeaf(leaf: JsonSchema | undefined): RuleOp[] {
		if (leaf?.enum || (leaf && 'const' in leaf)) return ['eq', 'neq', 'exists'];
		const type = Array.isArray(leaf?.type)
			? leaf.type.find((t) => t !== 'null')
			: leaf?.type;
		switch (type) {
			case 'boolean':
				return ['eq', 'neq', 'exists'];
			case 'number':
			case 'integer':
				return ['eq', 'neq', 'gt', 'lt', 'exists'];
			case 'string':
				// `format:"uuid"` — exact match only; substring on an id lies.
				return leaf?.format === 'uuid'
					? ['eq', 'neq', 'exists']
					: ['eq', 'neq', 'contains', 'exists'];
			case 'object':
			case 'array':
				return ['exists'];
			default:
				return ['eq', 'neq', 'exists'];
		}
	}

	const locked = $derived(readonly || disabled);

	// ── wire ↔ draft ────────────────────────────────────────────────────
	// value is a JSON string of RuleFilter[]; the composer owns a parsed
	// draft and serializes back on every mutation. Invalid JSON → raw mode
	// (the composer can't lie about a document it can't parse).
	function parseFilters(raw: string): RuleFilterItem[] | null {
		try {
			const parsed = extJsonParse<any>(raw);
			if (!Array.isArray(parsed)) return null;
			if (parsed.some((f) => !f || typeof f !== 'object' || typeof f.field !== 'string')) return null;
			return parsed as RuleFilterItem[];
		} catch {
			return null;
		}
	}

	let filters = $state<RuleFilterItem[]>([]);

	function commit(next: RuleFilterItem[]) {
		filters = next;
		value = extJsonStringify(next);
	}

	// External value edits (JSON mode round-trip, form reset, record load)
	// re-sync the draft — the composer never owns the document itself.
	$effect(() => {
		const parsed = parseFilters(value);
		if (parsed !== null && extJsonStringify(parsed) !== extJsonStringify(filters)) filters = parsed;
	});

	// ── composer draft ─────────────────────────────────────────────────
	let newField = $state('');
	let newOp = $state<RuleOp>('eq');
	let newValue = $state<string>('');

	// Schema tree for the PropNavigator — the SHARED builder owns label
	// (`x_label_key` → translated), `_sub` (readable type line), and the
	// type icons so this picker and the payload-map selector can never
	// diverge into two presentations of the same schema.
	const pathTree = $derived.by(() => schemaToNavNodes(source_schema as SchemaLike | undefined));

	// The value control is typed by the selected path's schema leaf:
	// enum → single combo over the closed vocabulary, boolean → yes/no
	// combo, number/integer → numeric input, else plain text.
	const fieldSchema = $derived(
		newField ? schemaAtPath((source_schema ?? {}) as JsonSchema, `$.${newField}`) : undefined,
	);
	// `const` is a one-member vocabulary — `event.schema` offers `2`, same
	// closed-picker treatment as enum (the literal stays the wire value).
	const valueOptions = $derived(
		(fieldSchema?.enum ?? (fieldSchema && 'const' in fieldSchema ? [fieldSchema.const] : [])).map(
			(v) => {
				const lk = (
					(fieldSchema as Record<string, unknown> | undefined)?.['x_enum_labels'] as
						| Record<string, string>
						| undefined
				)?.[String(v)];
				return { value: String(v), label: lk ? $t(lk) : String(v) };
			},
		),
	);
	const valueKind = $derived<'enum' | 'boolean' | 'number' | 'text'>(
		valueOptions.length > 0
			? 'enum'
			: fieldSchema?.type === 'boolean'
				? 'boolean'
				: fieldSchema?.type === 'number' || fieldSchema?.type === 'integer'
					? 'number'
					: 'text',
	);

	// The op combobox is conditional on the leaf type — an enum leaf can
	// only answer "is it X / isn't it X / is it set", an object leaf only
	// the presence test.
	const allowedOps = $derived(opsForLeaf(fieldSchema));
	const opOptions = $derived(
		allowedOps.map((op) => ({
			value: op,
			label: $t(`system.entities.list.operators.${op}`),
			_icon: OP_ICON[op],
		})),
	);

	let prevField = $state('');
	$effect(() => {
		if (newField === prevField) return;
		prevField = newField;
		newValue = '';
		if (!allowedOps.includes(newOp)) newOp = allowedOps[0] ?? 'eq';
	});

	// ── single-row cascade — every control renders immediately, disabled
	// until its upstream pick (field → op → value → add). The field picker
	// itself waits on the emit's payload_schema: no schema, no paths.
	const fieldDisabled = $derived(locked || !source_schema);
	const opDisabled = $derived(locked || !newField);
	const valueDisabled = $derived(locked || !newField || newOp === 'exists');
	const addDisabled = $derived(
		!newField || (newOp !== 'exists' && (newValue === '' || newValue == null)),
	);

	/** String draft → wire value, coerced by the path's schema leaf:
	 *  enum members restore their original literal, boolean/number parse. */
	function wireValue(): unknown {
		if (valueKind === 'boolean') return newValue === 'true';
		if (valueKind === 'number') return Number(newValue);
		if (valueKind === 'enum')
			return (
				(fieldSchema?.enum ?? (fieldSchema && 'const' in fieldSchema ? [fieldSchema.const] : []))
					.find((e) => String(e) === newValue) ?? newValue
			);
		return newValue;
	}

	function addFilter() {
		const item: RuleFilterItem = { field: newField, op: newOp };
		if (newOp !== 'exists') item.value = wireValue();
		commit([...filters, item]);
		newField = '';
		newValue = '';
	}

	function removeFilter(idx: number) {
		commit(filters.filter((_, i) => i !== idx));
	}

	/** Committed field — translate via the schema leaf's `x_label_key` when
	 *  the selected source emits one; the raw path stays the fallback AND
	 *  the hover title (wire truth, always traceable). */
	function badgeField(f: RuleFilterItem): string {
		const leaf = schemaAtPath((source_schema ?? {}) as JsonSchema, `$.${f.field}`);
		const lk = (leaf as Record<string, unknown> | undefined)?.['x_label_key'];
		return typeof lk === 'string' && lk ? $t(lk) : f.field;
	}

	function badgeValue(f: RuleFilterItem): string {
		if (f.value === true || f.value === false)
			return $t(f.value ? 'system.entities.list.boolean_true' : 'system.entities.list.boolean_false');
		return String(f.value ?? '');
	}
</script>

<div class="space-y-3">
	{#if !locked}
		<!-- One row like the payload-map composer: field · op · value · add.
		     Every control renders immediately — `{#if}` reveal would hide the
		     anatomy; the cascade carries `disabled` instead. -->
		<div class="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_auto] items-start gap-2">
			<PropNavigator
				nodes={pathTree}
				value={newField ? `$.${newField}` : ''}
				isSelectable={() => true}
				placeholder={$t('system.entities.list.select_field')}
				disabled={fieldDisabled}
				data-testid="rule-filter-field"
				onSelect={(path) => {
					newField = path.replace(/^\$\.?/, '');
				}}
			/>
			<ComboSelect
				mode="single"
				bind:value={newOp}
				options={opOptions}
				valueField="value"
				labelField="label"
				iconField="_icon"
				placeholder={$t('system.entities.list.operator')}
				disabled={opDisabled}
				data-testid="rule-filter-op"
			/>
			<div class="min-w-0">
				{#if valueKind === 'enum'}
					<ComboSelect
						mode="single"
						bind:value={newValue}
						options={valueOptions}
						valueField="value"
						labelField="label"
						placeholder={$t('system.entities.list.value')}
						disabled={valueDisabled}
						data-testid="rule-filter-value"
					/>
				{:else if valueKind === 'boolean'}
					<ComboSelect
						mode="single"
						bind:value={newValue}
						options={[
							{ value: 'true', label: $t('system.entities.list.boolean_true') },
							{ value: 'false', label: $t('system.entities.list.boolean_false') },
						]}
						valueField="value"
						labelField="label"
						disabled={valueDisabled}
						data-testid="rule-filter-value"
					/>
				{:else if valueKind === 'number'}
					<NumericInput kind="number" bind:value={newValue} disabled={valueDisabled} data-testid="rule-filter-value" />
				{:else}
					<TextInput bind:value={newValue} disabled={valueDisabled} data-testid="rule-filter-value" />
				{/if}
			</div>
			<Button
				variant="ghost"
				size="icon-sm"
				class="self-center text-info hover:bg-info/10 hover:text-info"
				type="button"
				disabled={addDisabled}
				onclick={addFilter}
				aria-label={$t('system.entities.list.add_filter')}
				title={$t('system.entities.list.add_filter')}
				data-testid="rule-filter-add"
			>
				<Plus class="size-3.5" />
			</Button>
		</div>
	{/if}

	{#if filters.length > 0}
		<div class="flex flex-wrap items-center gap-2" data-testid="rule-filter-badges">
			{#each filters as f, i (i)}
				<Badge variant="secondary" class="w-fit gap-1.5 pr-1">
					<span class="text-xs font-bold text-foreground" title={f.field}>{badgeField(f)}</span>
					<span class="text-xs text-primary">{$t(`system.entities.list.operators.${f.op ?? 'eq'}`)}</span>
					{#if f.op !== 'exists'}
						<span class="text-xs italic text-muted-foreground">{badgeValue(f)}</span>
					{/if}
					{#if !locked}
						<button
							type="button"
							class="ml-0.5 inline-flex size-4 cursor-pointer items-center justify-center rounded-full hover:bg-muted-foreground/20"
							onclick={() => removeFilter(i)}
							aria-label={$t('app.common.remove')}
							data-testid="rule-filter-remove"
						>
							<XIcon class="size-3" />
						</button>
					{/if}
				</Badge>
			{/each}
		</div>
	{:else}
		<span class="text-xs italic text-muted-foreground/70" data-testid="rule-filter-empty">
			{$t('system.entities.list.filter_badge.no_filters_applied')}
		</span>
	{/if}

	<!-- Same JsonValueEditor the payload mapper embeds — preview collapsed
	     behind its accordion toggle; preview⇄edit lives in its toolbar, so
	     there is no separate "edit JSON" mode to maintain. -->
	<JsonValueEditor
		bind:value
		{schema}
		minRows={6}
		preview_open={false}
		{placeholder}
		readonly={locked}
		{on_ai_assist}
		{extra_completions}
		{...rest}
	/>
</div>
