<script lang="ts">
  /**
   * DictFieldCell — the canonical form-field anatomy for dict cells:
   * translated label + priority help + control + inline error line.
   *
   * Same anatomy `PrimeField` owns (plain `<label for>` + generated id +
   * `control` snippet receiving the id): help resolves from the column
   * meta via `resolveFieldHelp` in the 'form' context (`tooltip`/
   * `tooltip_title`/`tooltip_priority` gated by `show_form_tooltip`).
   * The `suggestion_optional` variant is the label_key convention:
   * "(optional)" chip + "suggested automatically" copy — the empty value
   * commits the `custom.entities.<tk>.rows.<code>` suggestion at save.
   *
   * `FormLabel` (the Field.Label primitive) is NOT used here — it needs
   * the `Field.Root` context that form primitives provide and dict cells
   * don't have; `PrimeField` labels are plain `<label for>` elements.
   */
  import { t } from '$lib/i18n';
  import { FormLabelWithPriorityHelp, resolveFieldHelp } from '@primebrick/ui';
  import type { MetaColumn } from '$lib/entity-list/types';
  import type { Snippet } from 'svelte';

  let {
    column,
    errors = [],
    required = false,
    suggestion_optional = false,
    control,
  }: {
    column: MetaColumn;
    /** Inline errors — first one renders under the control (destructured
     *  array so multiple rules can co-exist on one column). */
    errors?: string[];
    required?: boolean;
    /** label_key convention — "(optional)" qualifier + suggested-value help. */
    suggestion_optional?: boolean;
    /** The cell control — receives the generated id for label wiring. */
    control: Snippet<[{ id: string }]>;
  } = $props();

  const id = $props.id();

  const help = $derived(
    suggestion_optional
      ? {
          text: $t('app.common.optional_tooltip_text'),
          title: $t('app.common.optional_tooltip_title'),
          labelKey: 'app.common.optional',
        }
      : resolveFieldHelp(column, 'form', $t),
  );
</script>

<div class="min-w-0 space-y-1.5">
  <label for={id} class="inline-flex items-center gap-1.5 text-sm font-medium">
    <span class="truncate">{$t(column.label_key)}</span>
    {#if required}<span class="text-destructive" aria-hidden="true">*</span>{/if}
    {#if help}
      <FormLabelWithPriorityHelp
        text={help.text}
        title={help.title}
        priority={help.priority}
        labelKey={help.labelKey}
      />
    {/if}
  </label>
  {@render control({ id })}
  {#if errors.length}
    <p
      id="{id}-error"
      class="text-xs font-medium text-destructive"
      data-testid="dict-cell-error"
    >
      {errors[0]}
    </p>
  {/if}
</div>
