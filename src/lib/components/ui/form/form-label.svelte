<script lang="ts">
	import * as FormPrimitive from "formsnap";
	import { Label } from "$lib/components/ui/label/index.js";
	import { cn, type WithoutChild } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		children,
		class: className,
		required = false,
		...restProps
	}: WithoutChild<FormPrimitive.LabelProps> & { required?: boolean } = $props();
</script>

<FormPrimitive.Label {...restProps} bind:ref>
	{#snippet child({ props })}
		<Label
			{...props}
			data-slot="form-label"
			class={cn("data-[fs-error]:text-destructive", required && "font-medium text-foreground", className)}
		>
			{@render children?.()}
			{#if required}<span class="text-destructive">*</span>{/if}
		</Label>
	{/snippet}
</FormPrimitive.Label>
