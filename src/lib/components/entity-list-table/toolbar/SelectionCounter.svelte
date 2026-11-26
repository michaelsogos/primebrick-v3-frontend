<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '@primebrick/ui';
  import { Eye } from '@primebrick/ui/vendor/lucide'
  import { EyeOff } from '@primebrick/ui/vendor/lucide';

  interface SelectionCounterProps {
    selectionCount: number;
    selectionLabelKey?: string;
    selectionLabelSingularKey?: string;
    selectionLabelText?: string;
    selectionLabelSingularText?: string;
    /** Trailing participle ("selected") — optional: predicate counters
     *  like "modified" carry their meaning in the label itself. */
    selectionPastParticipleKey?: string;
    /** Accent tone — `info` for selection (ELT default), `warning` for
     *  taint predicates. */
    tone?: 'info' | 'warning';
    /** Tooltip/aria keys — default to the canonical selected-only pair. */
    title_on_key?: string;
    title_off_key?: string;
    /** data-testid on the eye toggle (E2E convention). */
    test_id?: string;
    showSelectedOnly: boolean;
    onShowSelectedOnlyChange: (show: boolean) => void;
  }

  let {
    selectionCount,
    selectionLabelKey,
    selectionLabelSingularKey,
    selectionLabelText,
    selectionLabelSingularText,
    selectionPastParticipleKey,
    tone = 'info',
    title_on_key = 'system.entities.list.view_all_rows_title',
    title_off_key = 'system.entities.list.view_selected_only_title',
    test_id,
    showSelectedOnly,
    onShowSelectedOnlyChange
  }: SelectionCounterProps = $props();

  const selectionLabel = $derived.by(() => {
    const raw =
      selectionCount === 1
        ? selectionLabelSingularText ||
          (selectionLabelSingularKey && $t(selectionLabelSingularKey)) ||
          selectionLabelText ||
          (selectionLabelKey && $t(selectionLabelKey))
        : selectionLabelText || (selectionLabelKey && $t(selectionLabelKey));
    return raw ? ` ${raw} ` : '';
  });
</script>

{#if selectionCount > 0}
  <div class="flex items-center gap-1.5 {tone === 'warning' ? 'text-warning' : 'text-info'}">
    <span class="inline-flex flex-wrap items-baseline gap-x-1">
      {selectionCount}{selectionLabel}{selectionPastParticipleKey ? $t(selectionPastParticipleKey) : ''}
    </span>
    <Button
      type="button"
      variant="ghost"
      size="xs"
      class="shrink-0 {tone === 'warning' ? 'text-warning hover:bg-warning/10 hover:text-warning' : 'text-info hover:bg-info/10 hover:text-info'}"
      aria-pressed={showSelectedOnly}
      title={showSelectedOnly ? $t(title_on_key) : $t(title_off_key)}
      aria-label={showSelectedOnly ? $t(title_on_key) : $t(title_off_key)}
      onclick={() => onShowSelectedOnlyChange(!showSelectedOnly)}
      data-testid={test_id}
    >
      {#if showSelectedOnly}
        <EyeOff class="size-4" />
      {:else}
        <Eye class="size-4" />
      {/if}
    </Button>
  </div>
{/if}
