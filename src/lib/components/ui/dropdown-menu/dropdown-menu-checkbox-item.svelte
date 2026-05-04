<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
	import { Checkbox, checkboxBaseClass } from "$lib/components/ui/checkbox";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";
	import { menuSoftRowBorderBase, menuSoftFocusKeyboard, menuSoftRowHighlightData } from "../menu-row-chrome.js";
	import type { Snippet } from "svelte";

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		indeterminate = $bindable(false),
		class: className,
		children: childrenProp,
		...restProps
	}: WithoutChildrenOrChild<DropdownMenuPrimitive.CheckboxItemProps> & {
		children?: Snippet;
	} = $props();
</script>

<DropdownMenuPrimitive.CheckboxItem
	bind:ref
	bind:checked
	bind:indeterminate
	data-slot="dropdown-menu-checkbox-item"
	class={cn(
		"relative flex cursor-default select-none items-center gap-2 rounded-md py-1.5 ps-8 pe-2 text-sm outline-hidden data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		menuSoftRowBorderBase,
		menuSoftRowHighlightData,
		menuSoftFocusKeyboard,
		className
	)}
	{...restProps}
>
	{#snippet children({ checked, indeterminate })}
		<span class="pointer-events-none absolute inset-s-2 flex size-4 items-center justify-center">
			<Checkbox checked={checked} indeterminate={indeterminate} class={checkboxBaseClass} />
		</span>
		{@render childrenProp?.()}
	{/snippet}
</DropdownMenuPrimitive.CheckboxItem>
