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
		DynamicIcon,
		JsonValueEditor,
		NumericInput,
		PrimeField,
		PropNavigator,
		TextInput,
		schemaToNavNodes,
		type PropNavNode,
		type SchemaLike,
	} from '@primebrick/ui';
	import { X as XIcon, Plus, ListFilter, Braces } from '@primebrick/ui/vendor/lucide';
	import { t } from '$lib/i18n';
	import {
		schemaAtPath,
		type JsonSchema,
	} from './rule-schema-completions';
	import type { EditorState } from '@codemirror/state';

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

	const OPS: readonly { op: RuleOp; icon: string }[] = [
		{ op: 'eq', icon: 'equal' },
		{ op: 'neq', icon: 'equal-not' },
		{ op: 'exists', icon: 'asterisk' },
		{ op: 'contains', icon: 'text-search' },
		{ op: 'gt', icon: 'chevron-right' },
		{ op: 'lt', icon: 'chevron-left' },
	];

	const locked = $derived(readonly || disabled);

	// ── wire ↔ draft ────────────────────────────────────────────────────
	// value is a JSON string of RuleFilter[]; the composer owns a parsed
	// draft and serializes back on every mutation. Invalid JSON → raw mode
	// (the composer can't lie about a document it can't parse).
	function parseFilters(raw: string): RuleFilterItem[] | null {
		try {
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) return null;
			if (parsed.some((f) => !f || typeof f !== 'object' || typeof f.field !== 'string')) return null;
			return parsed as RuleFilterItem[];
		} catch {
			return null;
		}
	}

	let filters = $state<RuleFilterItem[]>([]);
	let mode = $state<'builder' | 'json'>('builder');

	function commit(next: RuleFilterItem[]) {
		filters = next;
		value = JSON.stringify(next);
	}

	// External value edits (JSON mode round-trip, form reset, record load)
	// re-sync the draft — the composer never owns the document itself.
	$effect(() => {
		const parsed = parseFilters(value);
		if (parsed !== null && JSON.stringify(parsed) !== JSON.stringify(filters)) filters = parsed;
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
	const opOptions = $derived(
		OPS.map(({ op, icon }) => ({
			value: op,
			label: $t(`system.entities.list.operators.${op}`),
			_icon: icon,
		})),
	);

	// The value control is typed by the selected path's schema leaf:
	// enum → single combo over the closed vocabulary, boolean → yes/no
	// combo, number/integer → numeric input, else plain text.
	const fieldSchema = $derived(
		newField ? schemaAtPath((source_schema ?? {}) as JsonSchema, `$.${newField}`) : undefined,
	);
	const valueOptions = $derived(
		(fieldSchema?.enum ?? []).map((v) => {
			const lk = (
				(fieldSchema as Record<string, unknown> | undefined)?.['x_enum_labels'] as
					| Record<string, string>
					| undefined
			)?.[String(v)];
			return { value: String(v), label: lk ? $t(lk) : String(v) };
		}),
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

	let prevField = $state('');
	$effect(() => {
		if (newField === prevField) return;
		prevField = newField;
		newValue = '';
	});

	const addDisabled = $derived(
		!newField || (newOp !== 'exists' && (newValue === '' || newValue == null)),
	);

	/** String draft → wire value, coerced by the path's schema leaf:
	 *  enum members restore their original literal, boolean/number parse. */
	function wireValue(): unknown {
		if (valueKind === 'boolean') return newValue === 'true';
		if (valueKind === 'number') return Number(newValue);
		if (valueKind === 'enum')
			return (fieldSchema?.enum ?? []).find((e) => String(e) === newValue) ?? newValue;
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

{#if mode === 'json'}
	<div class="space-y-2">
		<JsonValueEditor
			bind:value
			{schema}
			minRows={6}
			maxHeight="20rem"
			preview_open={false}
			{placeholder}
			readonly={locked}
			{on_ai_assist}
			{extra_completions}
			{...rest}
		/>
		<Button variant="ghost" size="xs" type="button" onclick={() => (mode = 'builder')}>
			<ListFilter class="size-3.5" />
			{$t('app.widgets.rule_filter.builder_mode')}
		</Button>
	</div>
{:else}
	<div class="space-y-3">
		{#if !locked}
			<div class="space-y-2">
				<PrimeField label={$t('system.entities.list.field')}>
					{#snippet control()}
						<PropNavigator
							nodes={pathTree}
							value={newField ? `$.${newField}` : ''}
							isSelectable={() => true}
							placeholder={$t('system.entities.list.select_field')}
							data-testid="rule-filter-field"
							onSelect={(path) => {
								newField = path.replace(/^\$\.?/, '');
							}}
						/>
					{/snippet}
				</PrimeField>

				{#if newField}
					<PrimeField label={$t('system.entities.list.operator')}>
						{#snippet control({ id })}
							<ComboSelect
								{id}
								mode="single"
								bind:value={newOp}
								options={opOptions}
								valueField="value"
								labelField="label"
								iconField="_icon"
								data-testid="rule-filter-op"
							/>
						{/snippet}
					</PrimeField>

					{#if newOp !== 'exists'}
						<PrimeField label={$t('system.entities.list.value')}>
							{#snippet control({ id })}
								{#if valueKind === 'enum'}
									<ComboSelect
										{id}
										mode="single"
										bind:value={newValue}
										options={valueOptions}
										valueField="value"
										labelField="label"
										data-testid="rule-filter-value"
									/>
								{:else if valueKind === 'boolean'}
									<ComboSelect
										{id}
										mode="single"
										bind:value={newValue}
										options={[
											{ value: 'true', label: $t('system.entities.list.boolean_true') },
											{ value: 'false', label: $t('system.entities.list.boolean_false') },
										]}
										valueField="value"
										labelField="label"
										data-testid="rule-filter-value"
									/>
								{:else if valueKind === 'number'}
									<NumericInput {id} kind="number" bind:value={newValue} data-testid="rule-filter-value" />
								{:else}
									<TextInput {id} bind:value={newValue} data-testid="rule-filter-value" />
								{/if}
							{/snippet}
						</PrimeField>
					{/if}
				{/if}

				<div class="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						type="button"
						disabled={addDisabled}
						onclick={addFilter}
						data-testid="rule-filter-add"
					>
						<Plus class="size-3.5" />
						{$t('system.entities.list.add_filter')}
					</Button>
					<Button variant="ghost" size="xs" type="button" onclick={() => (mode = 'json')}>
						<Braces class="size-3.5" />
						{$t('app.widgets.json.edit_mode')}
					</Button>
				</div>
			</div>
		{/if}

		{#if filters.length > 0}
			<div class="flex flex-wrap items-center gap-2" data-testid="rule-filter-badges">
				<span class="text-xs italic text-muted-foreground/70">{$t('system.entities.list.all_criteria')}</span>
				{#each filters as f, i (i)}
					<Badge variant="secondary" class="w-fit gap-1.5 pr-1">
						<span class="text-xs font-bold text-foreground" title={f.field}>{badgeField(f)}</span>
						<span class="text-xs text-primary inline-flex items-center gap-0.5">
							<DynamicIcon
								name={OPS.find((o) => o.op === (f.op ?? 'eq'))?.icon ?? 'equal'}
								size={12}
								class="shrink-0"
							/>
							{$t(`system.entities.list.operators.${f.op ?? 'eq'}`)}
						</span>
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
		{:else if locked}
			<span class="text-xs italic text-muted-foreground/70">{value || '—'}</span>
		{/if}
	</div>
{/if}
