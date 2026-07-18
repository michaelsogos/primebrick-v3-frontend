<script lang="ts">
	import { Checkbox } from "bits-ui";
	import type { CheckboxRootProps } from "bits-ui";
	import CheckIcon from '@lucide/svelte/icons/check';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

	export type CheckboxTone = "primary" | "destructive" | "warning";

	const toneCheckedClasses: Record<CheckboxTone, string> = {
		primary: "data-[state=checked]:bg-linear-to-br data-[state=checked]:from-sky-400 data-[state=checked]:to-indigo-400 data-[state=checked]:text-white data-[state=checked]:border-transparent",
		destructive: "data-[state=checked]:bg-linear-to-br data-[state=checked]:from-rose-400 data-[state=checked]:to-red-600 data-[state=checked]:text-white data-[state=checked]:border-transparent",
		warning: "data-[state=checked]:bg-linear-to-br data-[state=checked]:from-yellow-300 data-[state=checked]:to-yellow-500 data-[state=checked]:text-yellow-950 data-[state=checked]:border-transparent",
	};

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		indeterminate = $bindable(false),
		tone = "primary",
		class: className,
		...restProps
	}: WithoutChildrenOrChild<CheckboxRootProps> & { tone?: CheckboxTone } = $props();
</script>

<Checkbox.Root
	bind:ref
	data-slot="checkbox"
	class={cn(
		/* Match form inputs: solid surface in light mode so borders stay visible on tinted/sticky table cells. */
		"border-input bg-background dark:bg-input/30 ring-offset-background focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive peer flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
		toneCheckedClasses[tone],
		className
	)}
	checked={checked}
	indeterminate={indeterminate}
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
