<script lang="ts">
	import { PinInput as InputOTPPrimitive } from "bits-ui";
	import { cn, type WithElementRef } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		cell,
		class: className,
		...restProps
	}: WithElementRef<InputOTPPrimitive.CellProps, HTMLDivElement> = $props();
</script>

<InputOTPPrimitive.Cell
	{cell}
	bind:ref
	data-slot="input-otp-slot"
	class={cn(
		"relative flex size-10 items-center justify-center rounded-md border-primary-gradient text-lg font-medium shadow-xs transition-all outline-none hover:brightness-105",
		cell.isActive && "ring-ring/50 ring-[3px]",
		className
	)}
	{...restProps}
>
	{cell.char}
	{#if cell.hasFakeCaret}
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			<div class="bg-foreground h-5 w-px animate-pulse"></div>
		</div>
	{/if}
</InputOTPPrimitive.Cell>
