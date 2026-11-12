<script lang="ts">
	/**
	 * EntityFormField — the ONE per-field anatomy shared by every form
	 * surface: `EntityFormPage` (inside FormField/FormControl, edit mode)
	 * and `EntityRecordSheetBody` (standalone, readonly). The widget
	 * resolution itself lives in `FormFieldDispatcher`; this component
	 * owns the surrounding anatomy — icon + translated label + priority
	 * tooltip + optional editing badge, the boolean→SwitchField split,
	 * and the controlProps pass-through.
	 *
	 * `inForm` selects the label primitive: formsnap `FormLabel` wires
	 * aria/fs-error styling but requires the FormField context; outside
	 * a superform the plain `Label` renders the same look.
	 *
	 * Audit columns (`column.audited`) are rejected BY CONSTRUCTION: audit
	 * facts are immutable server-owned data — they render as read values
	 * (audit section → `TableCell`), never as form widgets. A placement
	 * or fallback that routes one here is a contract violation and fails
	 * fast instead of silently drawing a dead control.
	 */
	import { t } from '$lib/i18n';
	import {
		FormLabel,
		Label,
		DynamicIcon,
		FormLabelWithPriorityHelp,
		SwitchField,
	} from '@primebrick/ui';
	import FieldEditingBadge from '$lib/components/collaboration/FieldEditingBadge.svelte';
	import FormFieldDispatcher from './FormFieldDispatcher.svelte';
	import type { MetaColumn, FormFieldPlacement } from '@primebrick/ui';
	import type { CensusSubjectOption } from './use-census-subject-options.svelte';
	import type { CallableDecl, EmitDecl } from '@primebrick/ui';

	let {
		column,
		placement,
		columns,
		value = $bindable(),
		record = $bindable(),
		readonly = false,
		mode = 'update',
		controlProps,
		inForm = false,
		editingNames,
		emitsOptions,
		callablesOptions,
		targetCallable,
		sourceEmit,
		disabledBadgeValues,
	}: {
		column: MetaColumn;
		/** Declared `page_props.form` placement — readonly/placeholder_key.
		 *  Fallback surfaces (no form declaration) pass undefined. */
		placement?: FormFieldPlacement;
		columns: ReadonlyMap<string, MetaColumn>;
		value?: unknown;
		record?: Record<string, unknown>;
		readonly?: boolean;
		/** Lifecycle mode — `immutable` columns are editable ONLY on
		 *  `kind:"create"`; every update/detail surface renders them disabled.
		 *  Fallback surfaces (record sheet) are always 'update'. */
		mode?: 'create' | 'update';
		/** FormControl `props` (id + aria wiring) when inside a superform;
		 *  callers outside one pass `{ id }` so the label `for` still works. */
		controlProps?: Record<string, unknown>;
		/** Inside a formsnap FormField → FormLabel; else plain Label. */
		inForm?: boolean;
		/** Names editing this field right now (collaboration badge). */
		editingNames?: string[];
		emitsOptions?: CensusSubjectOption[];
		callablesOptions?: CensusSubjectOption[];
		targetCallable?: CallableDecl;
		sourceEmit?: EmitDecl;
		disabledBadgeValues?: string[];
	} = $props();

	// Construction guard — `column` is mount-stable (keyed per col.key in
	// every caller); the audited contract is checked once, at init.
	// svelte-ignore state_referenced_locally
	if (column.audited) {
		throw new Error(
			`EntityFormField: audited column "${column.key}" cannot render as a form field — audit values are read-only by contract`,
		);
	}

	const labelFor = $derived(controlProps?.id as string | undefined);

/** Effective read-only state — placement readonly, surface readonly,
 *  `kind:"calculated"` server projections (never writable by construction),
 *  or the `immutable` lifecycle: the field was set at creation
 *  (user-supplied or derived) and is frozen for the record's life. */
const fieldReadonly = $derived(
	readonly ||
		placement?.readonly === true ||
		column.kind === 'calculated' ||
		(column.immutable === true && mode !== 'create'),
);

	/** SwitchField binds a strict `boolean`; the field value is the
	 *  record's `unknown` (undefined on columns the row never populated).
	 *  This proxy keeps the bindable contract while coercing non-boolean
	 *  record values to `false`. */
	const boolValue = {
		get value() {
			return value === true;
		},
		set value(v: boolean) {
			value = v;
		},
	};
</script>

{#if column.type === 'boolean' || column.pg_type === 'boolean'}
	<!-- Boolean = SwitchField anatomy (control-first, label beside) —
	     the ONLY sanctioned labelled switch; booleans never reach the
	     dispatcher. -->
	<div class="flex items-center gap-2 pb-1 pt-6">
		<SwitchField
			label={$t(column.label_key)}
			tooltip={column.tooltip && column.show_form_tooltip !== false
				? $t(column.tooltip)
				: undefined}
			tooltipTitle={column.tooltip_title ? $t(column.tooltip_title) : undefined}
			tooltipPriority={column.tooltip_priority}
			disabled={fieldReadonly}
			bind:checked={boolValue.value}
			{...controlProps}
		/>
		{#if editingNames?.length}
			<FieldEditingBadge names={editingNames} />
		{/if}
	</div>
{:else}
	<div class="flex items-center justify-between gap-2">
		{#if inForm}
			<FormLabel for={labelFor}>
				{#if column.icon}
					<DynamicIcon name={column.icon} size={14} class="inline-block" />
				{/if}
				{$t(column.label_key)}
				{#if column.tooltip && column.show_form_tooltip !== false}
					<FormLabelWithPriorityHelp
						text={$t(column.tooltip)}
						title={column.tooltip_title ? $t(column.tooltip_title) : undefined}
						priority={column.tooltip_priority}
					/>
				{/if}
			</FormLabel>
		{:else}
			<Label for={labelFor}>
				{#if column.icon}
					<DynamicIcon name={column.icon} size={14} class="inline-block" />
				{/if}
				{$t(column.label_key)}
				{#if column.tooltip && column.show_form_tooltip !== false}
					<FormLabelWithPriorityHelp
						text={$t(column.tooltip)}
						title={column.tooltip_title ? $t(column.tooltip_title) : undefined}
						priority={column.tooltip_priority}
					/>
				{/if}
			</Label>
		{/if}
		{#if editingNames?.length}
			<FieldEditingBadge names={editingNames} />
		{/if}
	</div>
	<FormFieldDispatcher
		{column}
		{placement}
		{emitsOptions}
		{callablesOptions}
		{targetCallable}
		{sourceEmit}
		{columns}
		{controlProps}
		{disabledBadgeValues}
		readonly={fieldReadonly}
		bind:value
		bind:record
	/>
{/if}
