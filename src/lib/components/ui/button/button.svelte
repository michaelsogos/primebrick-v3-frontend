<script lang="ts" module>
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
	import { type VariantProps, tv } from "tailwind-variants";

	export const buttonVariants = tv({
		// AGGIUNTO: group/button e active:not-aria-[haspopup]:translate-y-px dal suggerito
		base: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-hidden focus-visible:ring-[3px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 active:not-aria-[haspopup]:translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
				// MANTENUTO: Il tuo stile originale glass
				glass:
					"bg-primary/80 text-primary-foreground shadow-xs backdrop-blur-xs ring-1 ring-white/15 hover:bg-primary/75 active:bg-primary/85",
				// AGGIUNTO: aria-invalid del suggerito incorporato nel tuo destructive
				destructive:
					"bg-destructive hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 text-white shadow-xs focus-visible:border-destructive/40",
				// MANTENUTO: Il tuo stile originale soft
				soft:
					"border border-input bg-sky-100/50 text-foreground shadow-xs hover:bg-sky-100 hover:border-ring/50 dark:border-input dark:bg-input/40 dark:hover:bg-input/55 dark:hover:border-ring/45",
				// AGGIUNTO: aria-expanded dal suggerito
				outline:
					"bg-background hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 border shadow-xs aria-expanded:bg-muted aria-expanded:text-foreground",
				// AGGIUNTO: aria-expanded dal suggerito
				secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-xs aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
				// MANTENUTO: Il tuo stile originale secondary-outline
				"secondary-outline": "bg-neutral-100 border border-neutral-300 hover:bg-neutral-200 hover:text-neutral-900 dark:bg-neutral-800 dark:border-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-100 shadow-xs",
				// AGGIUNTO: aria-expanded dal suggerito
				ghost: "hover:bg-neutral-200/80 hover:text-neutral-900 dark:hover:bg-neutral-700/80 dark:hover:text-neutral-100 aria-expanded:bg-muted aria-expanded:text-foreground",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				// AGGIUNTI: in-data-[slot] e has-data-[icon] dal suggerito per spaziare i gruppi e le icone
				default: "h-9 px-4 py-2 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 has-[>svg]:px-3",
				sm: "h-8 gap-1.5 rounded-md px-3 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 has-[>svg]:px-2.5",
				xs: "h-7 gap-1 px-2 text-xs in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3.5",
				lg: "h-10 rounded-md px-6 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 has-[>svg]:px-4",
				icon: "size-9",
				"icon-xs": "size-6 rounded-[min(var(--radius-md),8px)] in-data-[slot=button-group]:rounded-md [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-8 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-md",
				"icon-lg": "size-10",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
	export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = "default",
		size = "default",
		ref = $bindable(null),
		href = undefined,
		type = "button",
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? "link" : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
