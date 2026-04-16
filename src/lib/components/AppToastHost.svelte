<script lang="ts">
  import { appToasts } from '$lib/errors/app-errors';

  type Toast = {
    id: string;
    message: string;
    scope?: string;
    createdAt: number;
  };
</script>

<div class="pointer-events-none fixed bottom-4 right-4 z-[70] flex max-w-sm flex-col gap-2">
  {#each ($appToasts as unknown as Toast[]) as t (t.id)}
    <div class="pointer-events-auto rounded-md border bg-background/95 p-3 shadow-lg backdrop-blur">
      {#if t.scope}
        <div class="text-[11px] font-medium text-muted-foreground">{t.scope}</div>
      {/if}
      <div class="text-sm font-medium text-foreground">{t.message}</div>
    </div>
  {/each}
</div>

