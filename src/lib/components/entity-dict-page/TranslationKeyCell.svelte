<script lang="ts">
  /**
   * TranslationKeyCell — the dict `label_key` control: ComboSelect of the
   * entity's row-label vocabulary (`*.entities.<tk>.rows.*` across every
   * namespace) + free-text create constrained to `custom.*` (the only
   * user-writable namespace) + the languages CTA that opens
   * `i18n.translationEditor` on the selected key.
   */
  import { t, dict } from '$lib/i18n';
  import { ComboSelect, Badge, toDisplayString } from "@primebrick/ui";
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import { getPendingTranslation } from '$lib/i18n/pending-translations.svelte';
  import { slugifyKey, suggestedKeyFor } from '$lib/i18n/dict-suggestion';
  import { i18nKeyOptions, coerceI18nKeyChange, I18N_KEY_OPTION_ICON, I18N_KEY_OPTION_COLOR } from '$lib/i18n/i18n-key-options';
  import type { MetaColumn } from '$lib/entity-list/types';

  let {
    column,
    value,
    record,
    translation_key,
    pending_owner,
    readonly = false,
    id,
    onchange,
  }: {
    column: MetaColumn;
    value: string;
    record: Record<string, unknown>;
    /** meta.translation_key — the entity's i18n table key (e.g. 'customer_type'). */
    translation_key: string;
    /** Pending-queue owner — queued entries flush with the page that supplied it. */
    pending_owner: string;
    readonly?: boolean;
    /** DictFieldCell-generated id — `for`/`id` label wiring. */
    id?: string;
    onchange: (value: string) => void;
  } = $props();

  const rowsPrefix = $derived(`entities.${translation_key}.rows.`);

  /** Convention suggestion — `custom.*` is the only user-writable namespace. */
  const suggestedKey = $derived(suggestedKeyFor(translation_key, record['code']));

  /**
   * Config-entry-create pattern: placeholder/searchPlaceholder carry the
   * FULL computed leaf key (sample while code is empty), `defaultSearch`
   * carries the prefix INCLUDING the key segment — it pre-filters to the
   * keys of THIS code and the Create row offers the scoped path.
   */
  const keyLeaf = $derived(slugifyKey(toDisplayString(record['code'] ?? '')) || 'my_custom_code');
  const placeholderKey = $derived(`custom.${rowsPrefix}${keyLeaf}`);
  const defaultSearch = $derived(`${rowsPrefix}${keyLeaf}`);

  /**
   * The suggestion is the ASSIGNED value, not a placeholder — a real value
   * activates the translate CTA and renders the ComboSelect created-value
   * chip (multi-mode parity). The assignment tracks the code: a previous
   * suggestion is replaced when the code changes; an explicit user choice
   * or a manual clear is respected until the code moves.
   */
  let lastSuggested = '';
  $effect(() => {
    const s = suggestedKey;
    const prev = lastSuggested;
    lastSuggested = s;
    if (!s || s === prev) return;
    if (!value || value === prev) onchange(s);
  });

  const options = $derived(
    // The suggestion never enters the vocabulary list — it's the assigned
    // value rendered as the created-value chip. Other explicit values
    // (existing custom keys) stay selectable via `extra`.
    i18nKeyOptions(
      $dict as Record<string, string>,
      { contains: rowsPrefix },
      value && value !== suggestedKey ? [value] : [],
    ),
  );

  /**
   * Select or create. A FULL key — `custom.*` or any existing
   * `*.entities.<tk>.rows.*` option (system/module namespaces) — passes
   * verbatim: selecting an existing key selects IT, it never rewrites
   * it. Only free text becomes a new `custom.*` convention key
   * (the only user-writable namespace).
   */
  function handleChange(v: string | string[]) {
    const raw = Array.isArray(v) ? (v[0] ?? '') : v;
    onchange(coerceI18nKeyChange(raw, rowsPrefix, slugifyKey));
  }

  function openTranslations() {
    if (!value) return;
    openSheet('i18n.translationEditor', { i18n_key: value, pending_owner });
  }

  const pendingLangs = $derived(value ? Object.keys(getPendingTranslation(pending_owner, value) ?? {}) : []);

  const languagesCta = $derived([{
    icon: 'languages',
    label: $t('system.settings.translations.title'),
    onclick: openTranslations,
    disabled: !value || readonly,
    'data-testid': 'dict-cell-translations',
  }]);
</script>

<div class="min-w-0 flex-1">
  <ComboSelect
      mode="single"
      {id}
      {value}
      onChange={handleChange}
      {options}
      valueField="key"
      labelField="key"
      isLabelTranslated={true}
      display="detailed"
      iconField="_icon"
      iconColorField="_icon_color"
      allowCreate
      createdIcon={I18N_KEY_OPTION_ICON}
      createdIconColor={I18N_KEY_OPTION_COLOR}
      defaultSearch={defaultSearch}
      placeholder={placeholderKey}
      searchPlaceholder={placeholderKey}
      truncateFrom="start"
      disabled={readonly}
      trailing_ctas={languagesCta}
      aria-label={$t(column.label_key)}
      data-testid="dict-cell-label-key"
    >
      {#snippet trailing()}
        {#if pendingLangs.length}
          <Badge variant="outline" class="border-primary/50 px-1 text-[10px]" title={pendingLangs.join(', ')}>
            +{pendingLangs.length}
          </Badge>
        {/if}
      {/snippet}
    </ComboSelect>
</div>
