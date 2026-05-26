<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Copy } from 'lucide-svelte';

  let {
    open,
    count,
    scope,
    onConfirm,
    onCancel,
    isDuplicating
  }: {
    open: boolean;
    count: number;
    scope: 'selected' | 'single';
    onConfirm: () => void;
    onCancel: () => void;
    isDuplicating: boolean;
  } = $props();
</script>

<Dialog.Root bind:open={open}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header class="pb-4">
      <Dialog.Title>{$t('common.duplicateConfirmTitle')}</Dialog.Title>
      <Dialog.Description>
        {#if scope === 'single'}
          {$t('common.duplicateConfirmSingle')}?
        {:else}
          {$t('common.duplicateConfirm')} {count} {$t('entities.list.bulkActions.items')}?
        {/if}
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer class="gap-2 sm:space-x-0">
      <Button
        variant="secondary-outline"
        class="hover:scale-105 transition-all"
        onclick={onCancel}
        disabled={isDuplicating}
      >
        {$t('common.cancel')}
      </Button>
      <Button
        variant="default"
        class="hover:scale-105 transition-all"
        onclick={onConfirm}
        disabled={isDuplicating}
      >
        {#if isDuplicating}
          {$t('common.duplicating')}
        {:else}
          <Copy class="size-4 mr-2" />
          {$t('common.duplicate')}
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
