<script lang="ts">
  import type { Snippet } from "svelte";
  import { Switch as SwitchPrimitive } from "bits-ui";
  import type { SwitchRootProps } from "bits-ui";
  import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    checked = $bindable(false),
    thumbIcons,
    class: className,
    ...restProps
  }: WithoutChildrenOrChild<SwitchRootProps> & {
    /** Optional icons rendered inside the thumb (e.g. left/right affordances). */
    thumbIcons?: Snippet<[{ checked: boolean }]>;
  } = $props();
</script>

<SwitchPrimitive.Root
  bind:ref
  bind:checked
  data-slot="switch"
  class={cn(
    "group/switch peer relative inline-flex h-5 w-11 shrink-0 cursor-pointer items-center rounded-full px-1 shadow-xs outline-hidden ring-offset-background transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
    // Neutral palette (unchecked)
    "border border-input bg-background dark:bg-input/30",
    "hover:border-ring/40 hover:bg-muted/40 dark:hover:bg-input/38",
    "disabled:hover:border-input disabled:hover:bg-background dark:disabled:hover:bg-input/30",
    // Checked palette — use primary (neutral)
    "data-[state=checked]:border-primary data-[state=checked]:bg-primary",
    "data-[state=checked]:hover:border-primary/80 data-[state=checked]:hover:bg-primary/90",
    "data-[state=checked]:disabled:hover:border-primary data-[state=checked]:disabled:hover:bg-primary",
    className
  )}
  {...restProps}
>
  <SwitchPrimitive.Thumb
    data-slot="switch-thumb"
    class={cn(
      "pointer-events-none relative z-10 flex size-4 translate-x-0 items-center justify-center rounded-full border bg-background text-foreground shadow-xs ring-0 transition-[transform,background-color,border-color,color]",
      "border-input",
      "group-hover/switch:border-ring/40",
      "data-[state=checked]:border-primary",
      "group-hover/switch:data-[state=checked]:border-primary/80",
      "data-[state=checked]:translate-x-[18px]"
    )}
  >
    {#if thumbIcons}
      {@render thumbIcons({ checked })}
    {/if}
  </SwitchPrimitive.Thumb>
</SwitchPrimitive.Root>

