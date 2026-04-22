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
    "group/switch peer relative inline-flex h-5 w-11 shrink-0 cursor-pointer items-center rounded-full px-1 shadow-xs outline-none ring-offset-background transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
    // Input-like chrome (sky palette when unchecked / browser)
    "border border-sky-200/80 bg-background dark:border-sky-900/55 dark:bg-input/30",
    "hover:border-sky-300/85 hover:bg-sky-50/45 dark:hover:border-sky-700/70 dark:hover:bg-input/38",
    "disabled:hover:border-sky-200/80 disabled:hover:bg-background dark:disabled:hover:border-sky-900/55 dark:disabled:hover:bg-input/30",
    // Congruent amber palette when checked / record
    "data-[state=checked]:border-amber-200/85 data-[state=checked]:bg-amber-50/55 dark:data-[state=checked]:border-amber-900/55 dark:data-[state=checked]:bg-amber-950/30",
    "data-[state=checked]:hover:border-amber-300/85 data-[state=checked]:hover:bg-amber-50/70 dark:data-[state=checked]:hover:border-amber-700/70 dark:data-[state=checked]:hover:bg-amber-950/38",
    "data-[state=checked]:disabled:hover:border-amber-200/85 data-[state=checked]:disabled:hover:bg-background dark:data-[state=checked]:disabled:hover:border-amber-900/55 dark:data-[state=checked]:disabled:hover:bg-input/30",
    className
  )}
  {...restProps}
>
  <SwitchPrimitive.Thumb
    data-slot="switch-thumb"
    class={cn(
      "pointer-events-none relative z-10 flex size-4 translate-x-0 items-center justify-center rounded-full border bg-background text-foreground shadow-xs ring-0 transition-[transform,background-color,border-color,color]",
      "border-sky-200/80 dark:border-sky-900/55",
      "group-hover/switch:border-sky-300/85 dark:group-hover/switch:border-sky-700/70",
      "data-[state=checked]:border-amber-200/85 dark:data-[state=checked]:border-amber-900/55",
      "data-[state=checked]:group-hover/switch:border-amber-300/85 dark:data-[state=checked]:group-hover/switch:border-amber-700/70",
      "data-[state=checked]:translate-x-[18px]"
    )}
  >
    {#if thumbIcons}
      {@render thumbIcons({ checked })}
    {/if}
  </SwitchPrimitive.Thumb>
</SwitchPrimitive.Root>

