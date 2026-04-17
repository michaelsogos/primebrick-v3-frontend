<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";

	/**
	 * shadcn-svelte–style alert; `impact*` variants mirror the shell error impact palette
	 * (borders / icon tint) while keeping `bg-background` and `text-foreground` for readability.
	 */
	export const alertVariants = tv({
		base: "relative flex w-full items-start gap-3 rounded-lg border p-3 text-sm shadow-sm [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:translate-y-0.5",
		variants: {
			variant: {
				default: "border-border bg-background text-foreground [&>svg]:text-foreground",
				destructive:
					"border-destructive/30 bg-destructive/5 text-foreground [&>svg]:text-destructive dark:border-destructive/40 dark:bg-destructive/10",
				impactCritical:
					"border-red-500/30 bg-background text-foreground [&>svg]:text-red-600 dark:[&>svg]:text-red-500",
				impactHigh:
					"border-amber-500/30 bg-background text-foreground [&>svg]:text-amber-600 dark:[&>svg]:text-amber-500",
				impactMedium:
					"border-sky-500/25 bg-background text-foreground [&>svg]:text-sky-600 dark:[&>svg]:text-sky-400",
				impactLow:
					"border-emerald-500/25 bg-background text-foreground [&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-500",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	});

	export type AlertVariant = VariantProps<typeof alertVariants>["variant"];
</script>

<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		variant = "default",
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		variant?: AlertVariant;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="alert"
	role="alert"
	class={cn(alertVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</div>
