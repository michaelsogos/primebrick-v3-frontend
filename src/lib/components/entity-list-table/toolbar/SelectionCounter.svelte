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
    selectionPastParticipleKey: string;
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
  <div class="flex items-center gap-1.5 text-info">
    <span class="inline-flex flex-wrap items-baseline gap-x-1">
      {selectionCount}{selectionLabel}{$t(selectionPastParticipleKey)}
    </span>
    <Button
      type="button"
      variant="ghost"
      size="xs"
      class="shrink-0 text-info hover:bg-info/10 hover:text-info"
      aria-pressed={showSelectedOnly}
      title={showSelectedOnly ? $t('system.entities.list.viewAllRowsTitle') : $t('system.entities.list.viewSelectedOnlyTitle')}
      aria-label={showSelectedOnly ? $t('system.entities.list.viewAllRowsTitle') : $t('system.entities.list.viewSelectedOnlyTitle')}
      onclick={() => onShowSelectedOnlyChange(!showSelectedOnly)}
    >
      {#if showSelectedOnly}
        <EyeOff class="size-4" />
      {:else}
        <Eye class="size-4" />
      {/if}
    </Button>
  </div>
{/if}
