<script lang="ts" module>
	import { tv, type VariantProps } from "tailwind-variants";

	export const buttonGroupVariants = tv({
		base: "has-[>[data-slot=button-group]]:gap-2 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-lg flex w-fit items-stretch [&>*]:focus-visible:relative [&>*]:focus-visible:z-10 [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
		variants: {
			orientation: {
				horizontal:
					"[&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-md! [&>[data-slot]]:rounded-r-none [&>[data-slot]~[data-slot]]:rounded-l-none [&>[data-slot]~[data-slot]]:border-l-0",
				vertical:
					"[&>[data-slot]:not(:has(~[data-slot]))]:rounded-b-md! flex-col [&>[data-slot]]:rounded-b-none [&>[data-slot]~[data-slot]]:rounded-t-none [&>[data-slot]~[data-slot]]:border-t-0",
			},
			// segmented = frameless cluster for borderless variants (ghost):
			// children keep their own full radius, no inner borders, minimal gap.
			segmented: {
				true: "gap-0.5",
			},
		},
		compoundVariants: [
			// segmented children keep full radius on every corner — the join
			// flattening is only meaningful for joined (border-sharing) groups.
			{ orientation: "horizontal", segmented: true, class: "[&>[data-slot]]:rounded-md!" },
			{ orientation: "vertical", segmented: true, class: "flex-col [&>[data-slot]]:rounded-md!" },
		],
		defaultVariants: {
			orientation: "horizontal",
			segmented: false,
		},
	});

	export type ButtonGroupOrientation = VariantProps<typeof buttonGroupVariants>["orientation"];
	export type ButtonGroupSegmented = VariantProps<typeof buttonGroupVariants>["segmented"];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		orientation = "horizontal",
		segmented = false,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		orientation?: ButtonGroupOrientation;
		segmented?: ButtonGroupSegmented;
	} = $props();
</script>

<div
	bind:this={ref}
	role="group"
	data-slot="button-group"
	data-orientation={orientation}
	class={cn(buttonGroupVariants({ orientation, segmented }), className)}
	{...restProps}
>
	{@render children?.()}
</div>
