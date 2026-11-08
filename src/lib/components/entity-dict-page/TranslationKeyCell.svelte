<script lang="ts">
  /**
   * TranslationKeyCell — the dict `label_key` control: ComboSelect of the
   * entity's row-label vocabulary (`*.entities.<tk>.rows.*` across every
   * namespace) + free-text create constrained to `custom.*` (the only
   * user-writable namespace) + the languages CTA that opens
   * `i18n.translationEditor` on the selected key.
   */
  import { SvelteSet } from 'svelte/reactivity';
  import { t, dict } from '$lib/i18n';
  import { ComboSelect, Badge } from '@primebrick/ui';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import { getPendingTranslation } from '$lib/i18n/pending-translations.svelte';
  import type { MetaColumn } from '$lib/entity-list/types';

  let {
    column,
    value,
    record,
    translation_key,
    readonly = false,
    onchange,
  }: {
    column: MetaColumn;
    value: string;
    record: Record<string, unknown>;
    /** meta.translation_key — the entity's i18n table key (e.g. 'customer_type'). */
    translation_key: string;
    readonly?: boolean;
    onchange: (value: string) => void;
  } = $props();

  const rowsPrefix = $derived(`entities.${translation_key}.rows.`);

  function slugify(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /** Convention suggestion — `custom.*` is the only user-writable namespace. */
  const suggestedKey = $derived.by(() => {
    const code = slugify(String(record['code'] ?? ''));
    return code ? `custom.${rowsPrefix}${code}` : '';
  });

  const options = $derived.by(() => {
    const list = new SvelteSet(
      Object.keys($dict as Record<string, string>).filter((k) => k.includes(rowsPrefix)),
    );
    if (suggestedKey) list.add(suggestedKey);
    if (value) list.add(value);
    // Every item carries the i18n archetype icon — `languages` in the same
    // `sky-500` token as the trigger-page `send` icon (census callables).
    return [...list].sort().map((key) => ({ key, _icon: 'languages', _icon_color: 'sky-500' }));
  });

  /**
   * Select or create. A FULL key — `custom.*` or any existing
   * `*.entities.<tk>.rows.*` option (system/module namespaces) — passes
   * verbatim: selecting an existing key selects IT, it never rewrites
   * it. Only free text becomes a new `custom.*` convention key
   * (the only user-writable namespace).
   */
  function handleChange(v: string | string[]) {
    const raw = Array.isArray(v) ? (v[0] ?? '') : v;
    const trimmed = raw.trim();
    if (!trimmed) return onchange('');
    if (trimmed.startsWith('custom.') || trimmed.includes(rowsPrefix)) {
      return onchange(trimmed);
    }
    const slug = slugify(trimmed);
    onchange(slug ? `custom.${rowsPrefix}${slug}` : trimmed);
  }

  function openTranslations() {
    if (!value) return;
    openSheet('i18n.translationEditor', { i18n_key: value });
  }

  const pendingLangs = $derived(value ? Object.keys(getPendingTranslation(value) ?? {}) : []);

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
      defaultSearch={rowsPrefix}
      placeholder={suggestedKey || $t('app.common.selectValue')}
      searchPlaceholder={rowsPrefix}
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
