<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";

	export const kbdVariants = tv({
		base: "inline-flex shrink-0 items-center justify-center rounded border border-border/80 bg-muted/50 font-mono font-semibold leading-none text-muted-foreground shadow-sm",
		variants: {
			size: {
				key: "h-5 min-w-[1.25rem] px-1 text-[11px]",
				modifier: "h-5 px-1.5 text-[10px]",
				icon: "size-5 [&>svg]:size-3.5",
			},
		},
		defaultVariants: {
			size: "key",
		},
	});

	export type KbdSize = VariantProps<typeof kbdVariants>["size"];
</script>

<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";

	type Props = WithElementRef<HTMLAttributes<HTMLElement>, HTMLElement> & {
		size?: KbdSize;
		children?: import("svelte").Snippet;
	};

	let { ref = $bindable(null), class: className, size = "key", children, ...restProps }: Props = $props();
</script>

<kbd bind:this={ref} data-slot="kbd" class={cn(kbdVariants({ size }), className)} {...restProps}>
	{@render children?.()}
</kbd>

