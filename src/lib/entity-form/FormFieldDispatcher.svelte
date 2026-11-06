<script lang="ts">
	/**
	 * FormFieldDispatcher — the entity-form twin of `ConfigValueInput`:
	 * selects the CONTROL for one declared field from the served column
	 * metadata (`format` first, then `type`, then `pg_type` fallback; the
	 * column also owns `widget`/`options_source`/`allow_create` — the
	 * semantic input contract every surface shares) plus the page-domain
	 * placement policy (`readonly`, `placeholder_key`).
	 *
	 * Rendered inside a `FormField` wrapper by EntityFormPage — this
	 * component emits only the control itself; label/constraints/errors are
	 * the wrapper's job.
	 *
	 * `surface: "filter"` re-uses the SAME resolution for the filters
	 * sheet — one control contract, two surface maps: multi-select variants
	 * where the filter feeds IN semantics (badge/subject/entity-ref), a
	 * boolean tri-state (any/true/false), and editor-only widgets
	 * (payload_map/json editors, schedule builder) degrade to plain text
	 * (a filter needs a value to match, not an authoring surface).
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
		DateWheelPicker,
		Button,
		ButtonGroup,
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
	import { useEntityRefOptions } from './use-entity-ref-options.svelte';
	import { useAuditActorOptions } from './use-audit-actor-options.svelte';
	import { ruleJsonCompletions } from './rule-schema-completions';
	import { CircleCheck, CircleX } from '@primebrick/ui/vendor/lucide';
	import type { CalendarDate, CalendarDateTime } from '@internationalized/date';

	interface Props {
		column: MetaColumn;
		/** Page-domain form placement — absent on the filter surface. */
		placement?: FormFieldPlacement;
		/** `form` (default) renders the editing control; `filter` renders the
		 *  match-value control from the same column contract. */
		surface?: 'form' | 'filter';
		value: unknown;
		/** Explicit placeholder — the filter surface has no placement to read
		 *  `placeholder_key` from. Form surfaces keep placement resolution. */
		placeholder?: string;
		/** Census-derived option vocabulary — `options_source:"census.emits"`
		 *  (pre-resolved `{value, label, _desc, _sub, _icon, _icon_color}` for
		 *  the 3-line `display="detailed"` event anatomy: translated display
		 *  name, italic description, raw subject, left icon). */
		emitsOptions?: {
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
		/** Bindable IANA timezone for the `date` filter control — the panel
		 *  converts CalendarDate→UTC at apply time using the picker's tz. */
		timezone?: string;
		/** The entity being filtered — required on the filter surface for
		 *  `options_source:"audit.actors"` columns (the vocabulary is the
		 *  entity's own audit writers, fetched from `{entity}/audit-actors`). */
		filterEntity?: string;
	}

	let {
		column,
		placement,
		surface = 'form',
		value = $bindable(),
		placeholder: placeholderProp,
		emitsOptions = [],
		callablesOptions = [],
		targetCallable,
		sourceEmit,
		controlProps,
		disabledBadgeValues,
		readonly = false,
		timezone = $bindable(),
		filterEntity,
	}: Props = $props();

	const control = $derived(
		surface === 'filter' ? resolveFilterControl() : resolveFormControl(),
	);

	/** Filter-surface placeholder defaults — the hint serves the ACTION:
	 *  picker controls say "select", free-value controls say "filter
	 *  value". `filterPlaceholder` ("No filter applied") was state copy
	 *  rendered as an input hint — wrong on every control. */
	function defaultFilterPlaceholder(ctl: string): string | undefined {
		if (ctl === 'boolean_tristate') return undefined;
		if (
			ctl === 'text' ||
			ctl === 'textarea' ||
			ctl === 'number' ||
			ctl === 'email' ||
			ctl === 'url' ||
			ctl === 'phone'
		)
			return $t('system.entities.list.filterValueHint');
		return $t('system.entities.list.selectValue');
	}
	const placeholder = $derived(
		placeholderProp ??
			(placement?.placeholder_key ? $t(placement.placeholder_key) : undefined) ??
			(surface === 'filter' ? defaultFilterPlaceholder(control) : undefined),
	);

	/**
	 * The control registry is CLOSED per surface — same enforcement
	 * posture as `validators` in build-entity-form-schema: a widget/control
	 * key that resolves to no template branch throws at construction
	 * instead of silently falling back to TextInput (silent drift was the
	 * source_subject/bare-Switch failure mode). Boolean columns never
	 * reach the form dispatcher — EntityFormPage renders them as
	 * SwitchField; on the filter surface they map to `boolean_tristate`.
	 */
	const FORM_CONTROLS = new Set([
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

	/** Filter-surface map — the DIFFERENCES from form (everything else is
	 *  identical): multi variants feed IN semantics, booleans gain the
	 *  "don't care" state, date columns get the real picker, `ref` columns
	 *  get the paged entity combobox, audit actors the governed
	 *  multi-select over the table's own writers. */
	const FILTER_CONTROLS = new Set([
		'date',
		'badge_multi',
		'subject_combo_multi',
		'boolean_tristate',
		'entity_ref',
		'actor_multi',
		'textarea',
		'number',
		'email',
		'url',
		'phone',
		'text',
	]);

	function resolveFormControl(): string {
		if (column.type === 'boolean' || column.pg_type === 'boolean') {
			throw new Error(
				`[FormFieldDispatcher] "${column.key}" is boolean — booleans render via SwitchField in EntityFormPage, never through the dispatcher.`,
			);
		}
		const resolved = column.widget ?? deriveControl();
		if (!FORM_CONTROLS.has(resolved)) {
			throw new Error(
				`[FormFieldDispatcher] unknown control "${resolved}" for "${column.key}" — register it in FORM_CONTROLS + add a template branch.`,
			);
		}
		return resolved;
	}

	/**
	 * Filter-surface resolution — `widget` is an EDITOR override and does
	 * not apply (a `payload_map`/json/schedule_spec column filters as
	 * contains-text); a `type`/`format` combo with no filter mapping throws
	 * — same closed posture as the form surface.
	 */
	function resolveFilterControl(): string {
		if (column.type === 'boolean' || column.pg_type === 'boolean') return 'boolean_tristate';
		if (column.type === 'badge') return 'badge_multi';
		if (column.type === 'ref' && column.ref?.entity) return 'entity_ref';
		if (column.options_source === 'audit.actors') return 'actor_multi';
		if (column.type === 'ref_count') return 'number';
		if (
			column.type === 'date' ||
			column.type === 'datetime' ||
			column.format === 'date' ||
			column.format === 'datetime'
		)
			return 'date';
		if (
			column.options_source === 'census.emits' ||
			column.options_source === 'census.callables'
		)
			return 'subject_combo_multi';
		const resolved = deriveControl();
		if (resolved === 'subject_combo' || resolved === 'json' || resolved === 'payload_map' || resolved === 'schedule_spec')
			return 'text';
		if (FILTER_CONTROLS.has(resolved)) return resolved;
		throw new Error(
			`[FormFieldDispatcher] "${column.key}" resolves "${resolved}" — no filter-surface control; add it to FILTER_CONTROLS + a template branch.`,
		);
	}

	function deriveControl(): string {
		const format = column.format;
		if (format === 'schedule_spec') return 'schedule_spec';
		if (format === 'json' || column.pg_type === 'jsonb' || column.pg_type === 'json') return 'json';
		if (format === 'nats_subject') {
			return column.options_source === 'census.emits' ||
				column.options_source === 'census.callables'
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
		get value(): string | bigint | number {
			return typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string'
				? value
				: '';
		},
		set value(v: string | bigint | number) {
			value = v === '' ? undefined : v;
		},
	};
	/** Multi-select surfaces (filter IN semantics) — an empty selection is
	 *  `undefined`, not `[]`, so the serializer drops the param entirely. */
	const arrayValue = {
		get value(): string[] {
			return Array.isArray(value) ? value : [];
		},
		set value(v: string[]) {
			value = v.length ? v : undefined;
		},
	};
	/** Filter `date` control — the panel owns ISO conversion at apply time;
	 *  the dispatcher passes the CalendarDate/CalendarDateTime through. */
	const dateValue = {
		get value(): CalendarDate | CalendarDateTime | null {
			return (value as CalendarDate | CalendarDateTime | null) ?? null;
		},
		set value(v: CalendarDate | CalendarDateTime | null) {
			value = v;
		},
	};

	/** `type:"ref"` filter options — server-paged combobox delegate over
	 *  `col.ref.entity`'s `/list` (no-op unless the filter surface resolves
	 *  `entity_ref`). Instantiated unconditionally: Svelte composables must
	 *  run at init; the fetch is gated on the resolved entity. */
	const entityRef = useEntityRefOptions(() => column);

	/** `options_source:"audit.actors"` options — the filtered entity's own
	 *  audit writers (single fetch, full vocabulary — client search inside
	 *  the combo is truthful here). `filterEntity` is required; without it
	 *  the delegate stays empty rather than fetching the wrong service. */
	const auditActors = useAuditActorOptions(() => filterEntity);

	// Restore display labels for `entity_ref` selections that pre-date the
	// loaded option pages (draft state, URL-restored filters).
	$effect(() => {
		if (control === 'entity_ref' && arrayValue.value.length > 0) {
			entityRef.ensureSelectedLabels(arrayValue.value);
		}
	});

	/** Boolean tri-state filter vocabulary — `any` clears the constraint. */
	const booleanOptions = [
		{ key: '', icon: null, labelKey: 'system.entities.list.booleanAny' },
		{ key: 'true', icon: 'true', labelKey: 'system.entities.list.booleanTrue' },
		{ key: 'false', icon: 'false', labelKey: 'system.entities.list.booleanFalse' },
	] as const;
	const triStateValue = {
		get value(): string {
			return value === 'true' || value === 'false' ? value : '';
		},
		set value(v: string) {
			value = v === '' ? undefined : v;
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
		options={column.options_source === 'census.callables' ? callablesOptions : emitsOptions}
		valueField="value"
		labelField="label"
		descriptionField="_desc"
		secondaryField="_sub"
		iconField="_icon"
		iconColorField="_icon_color"
		display="detailed"
		allowCreate={column.allow_create === true}
		{placeholder}
		disabled={readonly}
		{...controlProps}
	/>
	{#if column.options_source === 'census.callables' && targetCallable?.permissions?.length}
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
{:else if control === 'date'}
	<DateWheelPicker
		bind:value={dateValue.value}
		bind:timezone
		{placeholder}
		includeTime={column.type === 'datetime' || column.format === 'datetime'}
		disabled={readonly}
		{...controlProps}
	/>
{:else if control === 'badge_multi'}
	<ComboSelect
		mode="multi"
		bind:value={arrayValue.value}
		options={badgeOptions}
		valueField="value"
		labelField="label"
		colorField="color"
		display="badge"
		{placeholder}
		disabled={readonly}
		{...controlProps}
	/>
{:else if control === 'subject_combo_multi'}
	<ComboSelect
		mode="multi"
		bind:value={arrayValue.value}
		options={column.options_source === 'census.callables' ? callablesOptions : emitsOptions}
		valueField="value"
		labelField="label"
		descriptionField="_desc"
		secondaryField="_sub"
		iconField="_icon"
		iconColorField="_icon_color"
		display="detailed"
		allowCreate={column.allow_create === true}
		{placeholder}
		disabled={readonly}
		{...controlProps}
	/>
{:else if control === 'entity_ref'}
	<ComboSelect
		mode="multi"
		bind:value={arrayValue.value}
		options={entityRef.state.options as { value: string; label: string; _sub: string }[]}
		valueField="value"
		labelField="label"
		secondaryField="_sub"
		display="detailed"
		onSearchInput={entityRef.onSearchInput}
		onLoadMore={entityRef.onLoadMore}
		loadingMore={entityRef.state.loadingMore}
		loading={entityRef.state.loading}
		{placeholder}
		disabled={readonly}
		{...controlProps}
	/>
{:else if control === 'actor_multi'}
	<ComboSelect
		mode="multi"
		bind:value={arrayValue.value}
		options={auditActors.state.options as { value: string; label: string }[]}
		valueField="value"
		labelField="label"
		loading={auditActors.state.loading}
		{placeholder}
		disabled={readonly}
		{...controlProps}
	/>
{:else if control === 'boolean_tristate'}
	<ButtonGroup segmented class="w-full" {...controlProps}>
		{#each booleanOptions as opt (opt.key)}
			{@const active = triStateValue.value === opt.key}
			<Button
				variant="ghost"
				size="sm"
				type="button"
				class="flex-1 {active ? 'bg-foreground/10 text-foreground shadow-xs' : 'text-muted-foreground'}"
				aria-pressed={active}
				disabled={readonly}
				onclick={() => (triStateValue.value = opt.key)}
			>
				{#if opt.icon === 'true'}
					<CircleCheck class="size-4 text-green-600" />
				{:else if opt.icon === 'false'}
					<CircleX class="size-4 text-red-600" />
				{/if}
				{$t(opt.labelKey)}
			</Button>
		{/each}
	</ButtonGroup>
{:else}
	<TextInput bind:value={stringValue.value} {placeholder} {readonly} {...controlProps} />
{/if}
