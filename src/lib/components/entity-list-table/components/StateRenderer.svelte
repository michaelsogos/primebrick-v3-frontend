<script lang="ts" generics="TRow extends Record<string, unknown>">
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Trash2 } from '@primebrick/ui/vendor/lucide'
  import { DynamicIcon } from '@primebrick/ui';
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
      <DynamicIcon name="trash-arrow-up" class="size-4 text-warning/70" />
      <span>{$t('app.common.restore')}</span>
    </div>
  </DropdownMenu.Item>
{:else}
  <DropdownMenu.Item onclick={handleDelete} class="text-destructive">
    <div class="flex items-center gap-2">
      <Trash2 class="size-4 text-destructive/70" />
      <span>{$t('app.common.delete')}</span>
    </div>
  </DropdownMenu.Item>
{/if}
