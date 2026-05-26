<script lang="ts">
  import { t } from '$lib/i18n';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import { ArrowUpFromLine, Trash2 } from 'lucide-svelte';

  let {
    open,
    count,
    onConfirm,
    onCancel,
    isRestoring
  }: {
    open: boolean;
    count: number;
    onConfirm: () => void;
    onCancel: () => void;
    isRestoring: boolean;
  } = $props();
</script>

<Dialog.Root bind:open={open}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header class="pb-4">
      <Dialog.Title>{$t('entities.list.bulkActions.restoreConfirmTitle')}</Dialog.Title>
      <Dialog.Description>
        {$t('entities.list.bulkActions.restoreConfirm')} {count} {$t('entities.list.bulkActions.items')}?
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer class="gap-2 sm:space-x-0">
      <Button
        variant="secondary-outline"
        class="hover:scale-105 transition-all"
        onclick={onCancel}
        disabled={isRestoring}
      >
        {$t('common.cancel')}
      </Button>
      <Button
        variant="secondary"
        class="hover:scale-105 transition-all bg-warning/10 text-warning hover:bg-warning/20 border-warning/20"
        onclick={onConfirm}
        disabled={isRestoring}
      >
        {#if isRestoring}
          {$t('common.restoring')}
        {:else}
          <span class="relative flex items-center justify-center mr-2">
            <Trash2 class="size-4 text-warning/70" />
            <ArrowUpFromLine class="absolute -bottom-[1px] size-2.5 text-warning/70" />
          </span>
          {$t('common.restore')}
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
