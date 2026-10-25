<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from '@primebrick/ui/vendor/bits-ui';
	import { Circle as CircleIcon } from '@primebrick/ui/vendor/lucide';
	import { cn, type WithoutChild } from "$lib/utils.js";
	import { menuSoftRowBorderBase, menuSoftFocusKeyboard, menuSoftRowHighlightData } from '@primebrick/ui';

	let {
		ref = $bindable(null),
		class: className,
		children: childrenProp,
		...restProps
	}: WithoutChild<DropdownMenuPrimitive.RadioItemProps> = $props();
</script>

<DropdownMenuPrimitive.RadioItem
	bind:ref
	data-slot="dropdown-menu-radio-item"
	class={cn(
		"relative flex cursor-pointer select-none items-center gap-2 rounded-md py-1.5 ps-8 pe-2 text-sm outline-hidden data-disabled:cursor-not-allowed data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		menuSoftRowBorderBase,
		menuSoftRowHighlightData,
		menuSoftFocusKeyboard,
		className
	)}
	{...restProps}
>
	{#snippet children({ checked })}
		<span
			class="pointer-events-none absolute inset-s-2 flex size-3.5 items-center justify-center"
		>
			{#if checked}
				<CircleIcon class="size-2 fill-current" />
			{/if}
		</span>
		{@render childrenProp?.({ checked })}
	{/snippet}
</DropdownMenuPrimitive.RadioItem>
