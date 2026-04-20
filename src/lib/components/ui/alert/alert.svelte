<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";

	/**
	 * shadcn-svelte–style alert; `impact*` variants mirror toast / Sonner semantics: tinted
	 * surface + border (persistent “toast-like” cards, no auto-dismiss).
	 */
	export const alertVariants = tv({
		base: "relative flex w-full items-start gap-3 rounded-lg border p-3 text-sm shadow-sm ring-1 ring-black/5 dark:ring-white/10 [&>svg]:shrink-0 [&>svg]:translate-y-0.5",
		variants: {
			variant: {
				default:
					"border-border bg-background text-foreground [&>svg]:size-4 [&>svg]:text-foreground",
				destructive:
					"border-destructive/30 bg-destructive/5 text-foreground [&>svg]:size-4 [&>svg]:text-destructive dark:border-destructive/40 dark:bg-destructive/10",
				/** Surfaces in `app.css` — match Sonner toasts (critical solid + rich error/warning/info). */
				impactCritical:
					"pb-shell-error-card--critical [&>svg]:size-5 border-0 ring-0 shadow-none",
				impactHigh: "pb-shell-error-card--error [&>svg]:size-5 border-0 ring-0 shadow-none",
				impactMedium: "pb-shell-error-card--warning [&>svg]:size-5 border-0 ring-0 shadow-none",
				impactLow: "pb-shell-error-card--info [&>svg]:size-5 border-0 ring-0 shadow-none",
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
