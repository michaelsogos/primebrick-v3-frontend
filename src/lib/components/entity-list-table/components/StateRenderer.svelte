<script lang="ts" generics="TRow extends Record<string, unknown>">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import ArrowUpFromLine from '@lucide/svelte/icons/arrow-up-from-line';
  import { t } from '$lib/i18n';

  let {
    row,
    isDeleted,
    onDelete,
    onRestore
  }: {
    row: TRow;
    isDeleted: boolean;
    onDelete: (row: TRow) => void;
    onRestore: (row: TRow) => void;
  } = $props();

  function handleDelete(e: MouseEvent) {
    e.stopPropagation();
    onDelete(row);
  }

  function handleRestore(e: MouseEvent) {
    e.stopPropagation();
    onRestore(row);
  }
</script>

{#if isDeleted}
  <DropdownMenu.Item onclick={handleRestore} class="text-warning">
    <div class="flex items-center gap-2">
      <span class="relative flex items-center justify-center">
        <Trash2 class="size-4 text-warning/70" />
        <ArrowUpFromLine class="absolute -bottom-[1px] size-3 text-warning/70" />
      </span>
      <span>{$t('common.restore')}</span>
    </div>
  </DropdownMenu.Item>
{:else}
  <DropdownMenu.Item onclick={handleDelete} class="text-destructive">
    <div class="flex items-center gap-2">
      <Trash2 class="size-4 text-destructive/70" />
      <span>{$t('common.delete')}</span>
    </div>
  </DropdownMenu.Item>
{/if}
