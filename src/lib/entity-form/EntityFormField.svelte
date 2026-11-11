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

	const labelFor = $derived(controlProps?.id as string | undefined);

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
			disabled={readonly || placement?.readonly}
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
		readonly={readonly || placement?.readonly}
		bind:value
		bind:record
	/>
{/if}
