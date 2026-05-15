<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import BorderedDialog from '$lib/components/ui/dialog-bordered.svelte';
  import { Button } from '$lib/components/ui/button';

  type RFC7807Error = {
    type: string;
    title: string;
    status: number;
    detail: string;
    instance?: string;
    internal_code?: string;
    severity?: string;
    [key: string]: any;
  };

  let {
    open = $bindable(),
    error,
    showCloseButton = false
  }: {
    open: boolean;
    error: RFC7807Error | null;
    showCloseButton?: boolean;
  } = $props();

  function closeDialog() {
    open = false;
  }
</script>

<BorderedDialog
  bind:open={open}
  color="destructive"
  class="!w-[95vw] !h-[95vh] !max-w-none !max-h-none !p-0 flex flex-col [&>div:nth-child(2)]:flex [&>div:nth-child(2)]:flex-col [&>div:nth-child(2)]:flex-1 [&>div:nth-child(2)]:min-h-0 [&>div:nth-child(2)]:!p-4"
  {showCloseButton}
>
  <Dialog.Header class="pb-4 shrink-0">
    <Dialog.Title>Error Details</Dialog.Title>
    {#if error?.internal_code}
      <Dialog.Description class="text-sm text-muted-foreground">
        Code: {error.internal_code}
      </Dialog.Description>
    {/if}
  </Dialog.Header>

  {#if error}
    <div class="flex-1 overflow-auto min-h-0 my-4">
      <pre class="text-xs bg-muted p-4 rounded-lg overflow-auto h-full">{JSON.stringify(error, null, 2)}</pre>
    </div>
  {/if}

  <Dialog.Footer class="gap-2 sm:space-x-0 shrink-0">
    <Button
      variant="secondary"
      class="border border-neutral-300 hover:border-neutral-400 hover:bg-accent hover:text-accent-foreground hover:scale-105 transition-all"
      onclick={closeDialog}
    >
      Close
    </Button>
  </Dialog.Footer>
</BorderedDialog>
