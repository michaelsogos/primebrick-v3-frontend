<script lang="ts">
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";

	type InputType = Exclude<HTMLInputTypeAttribute, "file">;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, "type"> &
			({ type: "file"; files?: FileList } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		"data-slot": dataSlot = "input",
		...restProps
	}: Props = $props();
</script>

{#if type === "file"}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"selection:bg-primary selection:text-primary-foreground ring-offset-background placeholder:text-muted-foreground flex h-9 w-full min-w-0 rounded-md border-primary-gradient px-3 pt-1.5 text-sm font-medium shadow-xs transition-all outline-hidden disabled:cursor-not-allowed disabled:opacity-50 hover:brightness-105",
			"disabled:hover:brightness-100",
			"focus-visible:ring-ring/50 focus-visible:ring-[3px]",
			"aria-invalid:border-destructive-gradient aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
			className
		)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<span data-animated-border class="relative block w-full">
		<input
			bind:this={ref}
			data-slot={dataSlot}
			class={cn(
				"selection:bg-primary selection:text-primary-foreground ring-offset-background placeholder:text-muted-foreground relative z-1 flex h-9 w-full min-w-0 rounded-md border-primary-gradient px-3 py-1 text-base shadow-xs transition-all outline-hidden disabled:cursor-not-allowed disabled:opacity-50 md:text-sm hover:brightness-105",
				"disabled:hover:brightness-100",
				"focus-visible:ring-ring/50 focus-visible:ring-[3px]",
				"aria-invalid:border-destructive-gradient aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
				className
			)}
			{type}
			bind:value
			{...restProps}
		/>
	</span>
{/if}
