<script lang="ts">
	/**
	 * FormFieldDispatcher — the entity-form twin of `ConfigValueInput`:
	 * selects the CONTROL for one declared field from the served column
	 * metadata (`format` first, then `type`, then `pg_type` fallback) plus
	 * the page-domain placement policy (`widget` override, `options_source`,
	 * `readonly`, `placeholder_key`).
	 *
	 * Rendered inside a `FormField` wrapper by EntityFormPage — this
	 * component emits only the control itself; label/constraints/errors are
	 * the wrapper's job.
	 */
	import type { FormFieldPlacement, MetaColumn } from '@primebrick/ui';
	import {
		TextInput,
		ComboSelect,
		Switch,
		JsonValueEditor,
		ScheduleSpecInput,
	} from '@primebrick/ui';
	import { Textarea } from '$lib/components/ui/textarea';
	import { NumericInput } from '$lib/components/ui/numeric-input';
	import { EmailInput } from '$lib/components/ui/email-input';
	import { UrlInput } from '$lib/components/ui/url-input';
	import { PhoneInput } from '$lib/components/ui/phone-input';
	import { t } from '$lib/i18n';
	import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';

	interface Props {
		column: MetaColumn;
		placement: FormFieldPlacement;
		value: unknown;
		/** Census-derived option vocabulary — `options_source:"census.emits"`
		 *  (pre-resolved `{value, label, _desc, _sub, _icon, _icon_color}` for
		 *  the 3-line `display="detailed"` event anatomy: translated display
		 *  name, italic description, raw subject, left icon). */
		emitsOptions: {
			value: string;
			label: string;
			_desc: string;
			_sub: string;
			_icon: string;
			_icon_color: string;
		}[];
		/** FormControl-provided props (`id`, `aria-invalid`, `aria-describedby`)
		 *  — spread onto the rendered control so label/error wiring works. */
		controlProps?: Record<string, unknown>;
		readonly?: boolean;
	}

	let {
		column,
		placement,
		value = $bindable(),
		emitsOptions,
		controlProps,
		readonly = false,
	}: Props = $props();

	const placeholder = $derived(placement.placeholder_key ? $t(placement.placeholder_key) : undefined);
	const control = $derived(resolveControl());

	function resolveControl(): string {
		if (placement.widget) return placement.widget;
		const format = column.format;
		if (format === 'schedule_spec') return 'schedule_spec';
		if (format === 'json' || column.pg_type === 'jsonb' || column.pg_type === 'json') return 'json';
		if (format === 'nats_subject') {
			return placement.options_source === 'census.emits' ? 'subject_combo' : 'text';
		}
		if (format === 'textarea' || column.type === 'textarea') return 'textarea';
		if (format === 'number' || format === 'money' || column.type === 'number') return 'number';
		if (format === 'email') return 'email';
		if (format === 'url') return 'url';
		if (format === 'phone') return 'phone';
		if (column.type === 'boolean' || column.pg_type === 'boolean') return 'switch';
		if (column.type === 'badge') return 'badge';
		return 'text';
	}

	const badgeOptions = $derived(
		column.type === 'badge' && column.badge?.values ? Object.keys(column.badge.values) : [],
	);
	const stringValue = {
		get value(): string {
			return typeof value === 'string' ? value : value == null ? '' : String(value);
		},
		set value(v: string) {
			value = v;
		},
	};
	const boolValue = {
		get value(): boolean {
			return value === true;
		},
		set value(v: boolean) {
			value = v;
		},
	};
	const numValue = {
		get value(): number | undefined {
			return typeof value === 'number' ? value : undefined;
		},
		set value(v: number | undefined) {
			value = v;
		},
	};

	/** AI CTA for the JSON control — opens the generic schema assistant.
	 *  The sheet is host-side; `column.json_schema` scopes prompts,
	 *  explorer topics and candidate validation, `current_json` is a LIVE
	 *  getter (the field mutates after each apply), `object_label` names
	 *  the document in prompts. */
	const onJsonAiAssist = $derived(
		column.json_schema
			? () =>
					openSheet('json.aiChat', {
						schema: column.json_schema as Record<string, unknown>,
						object_label: column.key,
						current_json: () => stringValue.value,
						on_apply_json: (json: string) => {
							stringValue.value = json;
						},
					})
			: undefined,
	);
</script>

{#if control === 'schedule_spec'}
	<ScheduleSpecInput bind:value={stringValue.value} {readonly} {placeholder} {...controlProps} />
{:else if control === 'json'}
	<JsonValueEditor
		bind:value={stringValue.value}
		schema={column.json_schema}
		minRows={10}
		maxHeight="24rem"
		{placeholder}
		{readonly}
		on_ai_assist={onJsonAiAssist}
		{...controlProps}
	/>
{:else if control === 'subject_combo'}
	<ComboSelect
		mode="single"
		bind:value={stringValue.value}
		options={emitsOptions}
		valueField="value"
		labelField="label"
		descriptionField="_desc"
		secondaryField="_sub"
		iconField="_icon"
		iconColorField="_icon_color"
		display="detailed"
		allowCreate
		{placeholder}
		disabled={readonly}
		{...controlProps}
	/>
{:else if control === 'badge'}
	<ComboSelect mode="single" bind:value={stringValue.value} options={badgeOptions} {placeholder} disabled={readonly} {...controlProps} />
{:else if control === 'switch'}
	<Switch bind:checked={boolValue.value} disabled={readonly} {...controlProps} />
{:else if control === 'textarea'}
	<Textarea bind:value={stringValue.value} {placeholder} {readonly} {...controlProps} />
{:else if control === 'number'}
	<NumericInput type="number" bind:value={numValue.value} {placeholder} disabled={readonly} {...controlProps} />
{:else if control === 'email'}
	<EmailInput bind:value={stringValue.value} {placeholder} disabled={readonly} {...controlProps} />
{:else if control === 'url'}
	<UrlInput bind:value={stringValue.value} {placeholder} disabled={readonly} {...controlProps} />
{:else if control === 'phone'}
	<PhoneInput bind:value={stringValue.value} {placeholder} disabled={readonly} {...controlProps} />
{:else}
	<TextInput bind:value={stringValue.value} {placeholder} {readonly} {...controlProps} />
{/if}
