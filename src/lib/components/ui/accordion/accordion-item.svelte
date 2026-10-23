<script lang="ts">
	import { Accordion as AccordionPrimitive } from '@primebrick/ui/vendor/bits-ui';
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: AccordionPrimitive.ItemProps = $props();
</script>

<AccordionPrimitive.Item
	bind:ref
	data-slot="accordion-item"
	class={cn("not-last:border-b", className)}
	{...restProps}
/>
