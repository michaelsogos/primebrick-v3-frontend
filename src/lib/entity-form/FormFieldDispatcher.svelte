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
	import type {
		CallableDecl,
		EmitDecl,
		FormFieldPlacement,
		MetaColumn,
		PayloadOptionsSource,
	} from '@primebrick/ui';
	import { flagCodeForBcp47, toDisplayString } from '@primebrick/ui';
	import {
		TextInput,
		ComboSelect,
		JsonValueEditor,
		PayloadMapEditor,
		ScheduleSpecInput,
	} from '@primebrick/ui';
	import { Textarea } from '@primebrick/ui';
	import { NumericInput } from '@primebrick/ui';
	import { EmailInput } from '$lib/components/ui/email-input';
	import { UrlInput } from '$lib/components/ui/url-input';
	import { PhoneInput } from '$lib/components/ui/phone-input';
	import { t } from '$lib/i18n';
	import { UI_LANGS } from '$lib/i18n/languages';
	import { apiFetch } from '$lib/api';
	import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
	import { ruleJsonCompletions } from './rule-schema-completions';

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
		/** Same option anatomy for `options_source:"census.callables"` — the
		 *  governed LISTEN subjects a rule may invoke. Catalog-only. */
		callablesOptions?: {
			value: string;
			label: string;
			_desc: string;
			_sub: string;
			_icon: string;
			_icon_color: string;
		}[];
		/** Decls resolved by the page for the current form values — the
		 *  `payload_map` control needs the target callable's request schema
		 *  (and its `permissions` for the warn strip), the path picker needs
		 *  the source event's payload schema. */
		targetCallable?: CallableDecl;
		sourceEmit?: EmitDecl;
		/** FormControl-provided props (`id`, `aria-invalid`, `aria-describedby`)
		 *  — spread onto the rendered control so label/error wiring works. */
		controlProps?: Record<string, unknown>;
		/** Badge-option values the page disables live (closed-vocab option
		 *  policy — e.g. `user` when a trigger has no event source). */
		disabledBadgeValues?: string[];
		readonly?: boolean;
	}

	let {
		column,
		placement,
		value = $bindable(),
		emitsOptions,
		callablesOptions = [],
		targetCallable,
		sourceEmit,
		controlProps,
		disabledBadgeValues,
		readonly = false,
	}: Props = $props();

	const placeholder = $derived(placement.placeholder_key ? $t(placement.placeholder_key) : undefined);
	const control = $derived(resolveControl());

	/**
	 * The control registry is CLOSED — same enforcement posture as
	 * `validators` in build-entity-form-schema: a widget/control key that
	 * resolves to no template branch throws at construction instead of
	 * silently falling back to TextInput (silent drift was the
	 * source_subject/bare-Switch failure mode). Boolean columns never
	 * reach the dispatcher — EntityFormPage renders them as SwitchField.
	 */
	const CONTROLS = new Set([
		'schedule_spec',
		'json',
		'subject_combo',
		'payload_map',
		'badge',
		'textarea',
		'number',
		'email',
		'url',
		'phone',
		'text',
	]);

	function resolveControl(): string {
		if (column.type === 'boolean' || column.pg_type === 'boolean') {
			throw new Error(
				`[FormFieldDispatcher] "${column.key}" is boolean — booleans render via SwitchField in EntityFormPage, never through the dispatcher.`,
			);
		}
		const resolved = placement.widget ?? deriveControl();
		if (!CONTROLS.has(resolved)) {
			throw new Error(
				`[FormFieldDispatcher] unknown control "${resolved}" for "${column.key}" — register it in CONTROLS + add a template branch.`,
			);
		}
		return resolved;
	}

	function deriveControl(): string {
		const format = column.format;
		if (format === 'schedule_spec') return 'schedule_spec';
		if (format === 'json' || column.pg_type === 'jsonb' || column.pg_type === 'json') return 'json';
		if (format === 'nats_subject') {
			return placement.options_source === 'census.emits' ||
				placement.options_source === 'census.callables'
				? 'subject_combo'
				: 'text';
		}
		if (format === 'textarea' || column.type === 'textarea') return 'textarea';
		if (format === 'number' || format === 'money' || column.type === 'number') return 'number';
		if (format === 'email') return 'email';
		if (format === 'url') return 'url';
		if (format === 'phone') return 'phone';
		if (column.type === 'badge') return 'badge';
		return 'text';
	}

	/**
	 * Badge columns render the canonical `display="badge"` ComboSelect —
	 * the meta carries per-value `label_key`/`label_text`/`color`; the raw
	 * key list is never a valid option surface (it drops colors AND i18n).
	 */
	const badgeOptions = $derived(
		column.type === 'badge' && column.badge?.values
			? Object.entries(column.badge.values).map(([value, v]) => ({
					value,
					label: v.label_text ?? (v.label_key ? $t(v.label_key) : value),
					color: v.color,
				}))
			: [],
	);
	const stringValue = {
		get value(): string {
			return typeof value === 'string' ? value : value == null ? '' : toDisplayString(value);
		},
		set value(v: string) {
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

	/** Data-aware completions for this form's JSON editors, driven by the
	 *  SELECTED event's payload_schema (`sourceEmit`): `field`/`path` values
	 *  complete dot-paths, `value` completes candidates for the sibling
	 *  field, `meta` completes the DST meta vocabulary. Silent where the
	 *  shape doesn't match — plain JSON columns elsewhere are unaffected. */
	const ruleCompletions = $derived(
		sourceEmit?.payload_schema
			? [ruleJsonCompletions(sourceEmit.payload_schema as Record<string, unknown>)]
			: undefined,
	);

	/**
	 * `x_options` resolver for the payload_map editor — the only host that
	 * owns transport (`apiFetch` through the `/svc/` proxy) and the built-in
	 * vocabularies. Two declared source kinds, closed set:
	 *   - `api_url`      — GET via apiFetch; `{rows}` mapped through the
	 *                      declared `value_field`/`label_field`; `_raw`
	 *                      carries the row for `x_map_keys` hints.
	 *   - `values_source:"locales"` — `UI_LANGS` with autonym labels
	 *                      (`Intl.DisplayNames` in each tag's own language).
	 * Unknown sources resolve empty — the schema author sees a broken combo,
	 * never an uncontrolled fetch.
	 */
	const optionsResolver = async (
		src: PayloadOptionsSource,
	): Promise<
		{
			value: string;
			label: string;
			_desc?: string;
			_sub?: string;
			_icon?: string;
			_icon_color?: string;
			_icon_dashed?: boolean;
			_flag?: string;
			_raw?: Record<string, unknown>;
		}[]
	> => {
		// api_url sources declare verb+fields explicitly — the enrollment
		// validator rejects a catalog declaration missing any of them.
		if (src.api_url && src.api_verb && src.value_field && src.label_field) {
			const res = await apiFetch(src.api_url, { method: src.api_verb });
			if (!res.ok) return [];
			const data = (await res.json()) as { rows?: Record<string, unknown>[] };
			const vf = src.value_field;
			const lf = src.label_field;
			return (data.rows ?? []).map((row) => ({
				value: toDisplayString(row[vf] ?? ''),
				label: toDisplayString(row[lf] ?? row[vf] ?? ''),
				_desc: typeof row.description === 'string' ? row.description : undefined,
				_icon: src.icon,
				_icon_color: src.icon_color,
				_icon_dashed: src.icon_dashed,
				_raw: row,
			}));
		}
		if (src.values_source === 'locales') {
			return UI_LANGS.map((tag) => ({
				value: tag,
				label: new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag,
				_flag: flagCodeForBcp47(tag) ?? undefined,
			}));
		}
		return [];
	};
</script>

{#if control === 'schedule_spec'}
	<ScheduleSpecInput bind:value={stringValue.value} {readonly} {placeholder} {...controlProps} />
{:else if control === 'json'}
	<JsonValueEditor
		bind:value={stringValue.value}
		schema={column.json_schema}
		minRows={10}
		maxHeight="24rem"
		preview_open={false}
		{placeholder}
		{readonly}
		on_ai_assist={onJsonAiAssist}
		extra_completions={ruleCompletions}
		{...controlProps}
	/>
{:else if control === 'subject_combo'}
	<ComboSelect
		mode="single"
		bind:value={stringValue.value}
		options={placement.options_source === 'census.callables' ? callablesOptions : emitsOptions}
		valueField="value"
		labelField="label"
		descriptionField="_desc"
		secondaryField="_sub"
		iconField="_icon"
		iconColorField="_icon_color"
		display="detailed"
		allowCreate={placement.allow_create === true}
		{placeholder}
		disabled={readonly}
		{...controlProps}
	/>
	{#if placement.options_source === 'census.callables' && targetCallable?.permissions?.length}
		<p class="text-xs text-amber-600 dark:text-amber-400" data-testid="callable-permissions-warn">
			{$t('app.widgets.payload_map.permissions_warn.lead')}
			{#each targetCallable.permissions as perm (perm)}
				<code class="mx-0.5 inline-block rounded-sm border border-amber-500/40 bg-amber-500/15 px-1 py-0.5 font-mono text-[11px] font-semibold leading-none">{perm}</code>
			{/each}
			— {$t('app.widgets.payload_map.permissions_warn.tail')}
		</p>
	{/if}
{:else if control === 'payload_map'}
	<PayloadMapEditor
		bind:value={stringValue.value}
		target_schema={targetCallable?.payload_schema}
		source_schema={sourceEmit?.payload_schema}
		source_entity={sourceEmit?.entity}
		options_resolver={optionsResolver}
		{readonly}
		on_ai_assist={onJsonAiAssist}
		extra_completions={ruleCompletions}
		{...controlProps}
	/>
{:else if control === 'badge'}
	<ComboSelect
		mode="single"
		bind:value={stringValue.value}
		options={badgeOptions}
		valueField="value"
		labelField="label"
		colorField="color"
		isOptionDisabled={disabledBadgeValues?.length
			? (raw) => disabledBadgeValues.includes((raw as { value?: string }).value ?? '')
			: undefined}
		display="badge"
		{placeholder}
		disabled={readonly}
		{...controlProps}
	/>
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
