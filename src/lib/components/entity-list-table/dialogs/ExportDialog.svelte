<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Download } from 'lucide-svelte';

  let {
    open,
    count,
    total,
    scope,
    onConfirm,
    onCancel,
    isExporting,
    fileType
  }: {
    open: boolean;
    count: number;
    total: number;
    scope: 'selected' | 'all';
    onConfirm: (fileType: 'xlsx' | 'csv') => void;
    onCancel: () => void;
    isExporting: boolean;
    fileType: 'xlsx' | 'csv' | null;
  } = $props();

  function handleConfirm(type: 'xlsx' | 'csv') {
    onConfirm(type);
  }
</script>

<Dialog.Root bind:open={open}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header class="pb-4">
      <Dialog.Title>{$t('common.exportConfirmTitle')}</Dialog.Title>
      <Dialog.Description>
        {#if scope === 'selected' && count > 0}
          {$t('common.exportConfirm')} {count} {$t('entities.list.bulkActions.items')}?
        {:else}
          {$t('common.exportConfirm')} {total} {$t('entities.list.bulkActions.items')}?
        {/if}
      </Dialog.Description>
    </Dialog.Header>
    <div class="flex gap-3 py-4">
      <Button
        variant={fileType === 'xlsx' ? 'default' : 'outline'}
        class="flex-1"
        onclick={() => handleConfirm('xlsx')}
        disabled={isExporting}
      >
        XLSX
      </Button>
      <Button
        variant={fileType === 'csv' ? 'default' : 'outline'}
        class="flex-1"
        onclick={() => handleConfirm('csv')}
        disabled={isExporting}
      >
        CSV
      </Button>
    </div>
    <Dialog.Footer class="gap-2 sm:space-x-0">
      <Button
        variant="secondary-outline"
        class="hover:scale-105 transition-all"
        onclick={onCancel}
        disabled={isExporting}
      >
        {$t('common.cancel')}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
