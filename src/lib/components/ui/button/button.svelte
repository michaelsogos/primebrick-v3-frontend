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
					"bg-linear-to-br from-sky-400 to-indigo-400 text-white shadow-xs hover:from-sky-500 hover:to-indigo-500 hover:brightness-105",
				// MANTENUTO: Il tuo stile originale glass
				glass:
					"bg-primary/80 text-primary-foreground shadow-xs backdrop-blur-xs ring-1 ring-white/15 hover:bg-primary/75 active:bg-primary/85",
				// AGGIUNTO: aria-invalid del suggerito incorporato nel tuo destructive
				destructive:
					"bg-linear-to-br from-rose-400 to-red-600 text-white shadow-xs hover:from-rose-500 hover:to-red-700 hover:brightness-105 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 focus-visible:border-destructive/40",
				warning:
					"bg-linear-to-br from-yellow-300 to-yellow-500 text-yellow-950 shadow-xs hover:from-yellow-400 hover:to-yellow-600 hover:brightness-105",
				success:
					"bg-linear-to-br from-emerald-400 to-emerald-600 text-white shadow-xs hover:from-emerald-500 hover:to-emerald-700 hover:brightness-105",
				info:
					"bg-linear-to-br from-sky-400 to-blue-600 text-white shadow-xs hover:from-sky-500 hover:to-blue-700 hover:brightness-105",
				// Soft: structural base only — color/border come from tone compound variants
				soft: "shadow-xs",
				// AGGIUNTO: aria-expanded dal suggerito
				outline:
					"bg-background hover:brightness-105 dark:bg-input/30 dark:hover:bg-input/50 border-primary-gradient shadow-xs aria-expanded:bg-muted aria-expanded:text-foreground",
				// AGGIUNTO: aria-expanded dal suggerito
				secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-xs aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
				// MANTENUTO: Il tuo stile originale secondary-outline
				"secondary-outline": "bg-neutral-100 border border-neutral-300 hover:bg-neutral-200 hover:text-neutral-900 dark:bg-neutral-800 dark:border-neutral-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-100 shadow-xs",
				// AGGIUNTO: aria-expanded dal suggerito
				ghost: "hover:bg-neutral-200/80 hover:text-neutral-900 dark:hover:bg-neutral-700/80 dark:hover:text-neutral-100 aria-expanded:bg-muted aria-expanded:text-foreground",
				link: "text-primary underline-offset-4 hover:underline",
			},
			tone: {
				primary: "",
				destructive: "",
				warning: "",
				success: "",
				info: "",
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
		compoundVariants: [
			// Soft + primary: gradient border + tenue gradient background, dark text (not in tinta)
			{
				variant: "soft",
				tone: "primary",
				class: "border-primary-gradient-soft text-foreground hover:brightness-105",
			},
			// Soft + success: emerald gradient border + tenue emerald background
			{
				variant: "soft",
				tone: "success",
				class: "border-success-gradient-soft text-foreground hover:brightness-105",
			},
			// Soft + info: sky→blue gradient border + tenue sky/blue background
			{
				variant: "soft",
				tone: "info",
				class: "border-info-gradient-soft text-foreground hover:brightness-105",
			},
			// Soft + destructive: rose→red gradient border + tenue rose/red background
			{
				variant: "soft",
				tone: "destructive",
				class: "border-destructive-gradient-soft text-foreground hover:brightness-105",
			},
			// Soft + warning: yellow gradient border + tenue yellow background
			{
				variant: "soft",
				tone: "warning",
				class: "border-warning-gradient-soft text-foreground hover:brightness-105",
			},
			// Outline + primary: sky→indigo gradient border (default, already in variant base)
			{
				variant: "outline",
				tone: "primary",
				class: "border-primary-gradient",
			},
			// Outline + destructive: rose→red gradient border
			{
				variant: "outline",
				tone: "destructive",
				class: "border-destructive-gradient",
			},
			// Outline + warning: yellow gradient border
			{
				variant: "outline",
				tone: "warning",
				class: "border-warning-gradient",
			},
			// Outline + success: emerald gradient border
			{
				variant: "outline",
				tone: "success",
				class: "border-success-gradient",
			},
			// Outline + info: sky→blue gradient border
			{
				variant: "outline",
				tone: "info",
				class: "border-info-gradient",
			},
		],
		defaultVariants: {
			variant: "default",
			size: "default",
			tone: "primary",
		},
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
	export type ButtonSize = VariantProps<typeof buttonVariants>["size"];
	export type ButtonTone = VariantProps<typeof buttonVariants>["tone"];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
			tone?: ButtonTone;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = "default",
		size = "default",
		tone = "primary",
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
		class={cn(buttonVariants({ variant, size, tone }), className)}
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
		class={cn(buttonVariants({ variant, size, tone }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
