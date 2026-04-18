<script lang="ts">
	import { Checkbox } from "bits-ui";
	import type { CheckboxRootProps } from "bits-ui";
	import CheckIcon from "@lucide/svelte/icons/check";
	import MinusIcon from "@lucide/svelte/icons/minus";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		indeterminate = $bindable(false),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<CheckboxRootProps> = $props();
</script>

<Checkbox.Root
	bind:ref
	data-slot="checkbox"
	class={cn(
		/* Match form inputs: solid surface in light mode so borders stay visible on tinted/sticky table cells. */
		"border-input bg-background dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary ring-offset-background focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive peer flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
		className
	)}
	bind:checked
	bind:indeterminate
	{...restProps}
>
	{#snippet children({ checked: c, indeterminate: ind })}
		<div data-slot="checkbox-indicator" class="text-current transition-none">
			{#if c}
				<CheckIcon class="size-3.5" />
			{:else if ind}
				<MinusIcon class="size-3.5" />
			{/if}
		</div>
	{/snippet}
</Checkbox.Root>
