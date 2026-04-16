<script lang="ts">
	import { Dialog as SheetPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: SheetPrimitive.OverlayProps = $props();
</script>

<SheetPrimitive.Overlay
	bind:ref
	data-slot="sheet-overlay"
	class={cn(
		"data-[state=open]:animate-in data-[state=closed]:animate-out fixed inset-0 z-50 bg-black/50 transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=closed]:pointer-events-none will-change-transform",
		className
	)}
	{...restProps}
/>
