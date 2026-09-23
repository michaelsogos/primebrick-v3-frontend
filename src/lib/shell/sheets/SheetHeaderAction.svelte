<script lang="ts">
  /**
   * SheetHeaderAction — the ONE canonical chrome for every CTA in a sheet
   * header. Same visual language as the standard close button
   * (`Sheet.Close` in SheetPanelLayout): 32px icon button, muted → accent
   * on hover. Never use `Button` variants or custom classes in sheet HEADs.
   *
   *   <SheetHeaderAction title={$t('app.common.reset')} onclick={reset}>
   *     <RotateCcw class="size-4" />
   *   </SheetHeaderAction>
   */
  import type { Snippet } from 'svelte';

  let {
    onclick,
    title,
    testid,
    disabled = false,
    children,
  }: {
    onclick: () => void;
    title: string;
    testid?: string;
    disabled?: boolean;
    children: Snippet;
  } = $props();
</script>

<button
  type="button"
  class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-30"
  {title}
  {onclick}
  {disabled}
  data-testid={testid}
>
  {@render children()}
</button>
