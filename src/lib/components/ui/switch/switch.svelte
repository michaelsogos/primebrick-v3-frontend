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
    // Unchecked palette — gradient border (sky→indigo) on white fill, reusing the
    // border-primary-gradient utility (DRY). Disabled uses border-readonly-gradient
    // (50% opacity gradient border) to match the disabled-checkbox convention.
    "border-primary-gradient dark:border-primary-gradient",
    "hover:border-primary-gradient-soft dark:hover:border-primary-gradient-soft",
    "disabled:border-readonly-gradient dark:disabled:border-readonly-gradient",
    // Checked palette — full primary gradient fill (matches Checkbox checked +
    // Button default CTA: bg-linear-to-br from-sky-400 to-indigo-400).
    "data-[state=checked]:border-transparent data-[state=checked]:bg-linear-to-br data-[state=checked]:from-sky-400 data-[state=checked]:to-indigo-400",
    "data-[state=checked]:hover:from-sky-500 data-[state=checked]:hover:to-indigo-500 data-[state=checked]:hover:brightness-105",
    "data-[state=checked]:disabled:hover:from-sky-400 data-[state=checked]:disabled:hover:to-indigo-400",
    className
  )}
  {...restProps}
>
  <SwitchPrimitive.Thumb
    data-slot="switch-thumb"
    class={cn(
      "pointer-events-none relative z-10 flex size-3.5 translate-x-0 items-center justify-center rounded-full border bg-background text-foreground shadow-xs ring-0 transition-[transform,background-color,border-color,color]",
      // Unchecked thumb — primary gradient fill (like primary CTA), white icons.
      "border-transparent bg-linear-to-br from-sky-400 to-indigo-400 text-white",
      "group-hover/switch:from-sky-500 group-hover/switch:to-indigo-500 group-hover/switch:brightness-105",
      // Checked thumb — white circle with gradient border (border-primary-gradient
      // utility: white fill from --background + sky→indigo gradient 1px border).
      "data-[state=checked]:border-primary-gradient data-[state=checked]:text-foreground",
      "data-[state=checked]:translate-x-[20px]"
    )}
  >
    {#if thumbIcons}
      {@render thumbIcons({ checked })}
    {/if}
  </SwitchPrimitive.Thumb>
</SwitchPrimitive.Root>

