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
			"selection:bg-primary bg-background dark:bg-input/30 selection:text-primary-foreground border-input ring-offset-background placeholder:text-muted-foreground flex h-9 w-full min-w-0 rounded-md border px-3 pt-1.5 text-sm font-medium shadow-xs transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50",
			"hover:border-ring/40 hover:bg-sky-50/45 dark:hover:border-ring/35 dark:hover:bg-input/38",
			"disabled:hover:border-input disabled:hover:bg-background dark:disabled:hover:border-input dark:disabled:hover:bg-input/30",
			"focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
			"aria-invalid:border-destructive aria-invalid:hover:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
			className
		)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"border-input bg-background selection:bg-primary dark:bg-input/30 selection:text-primary-foreground ring-offset-background placeholder:text-muted-foreground flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
			"hover:border-ring/40 hover:bg-sky-50/45 dark:hover:border-ring/35 dark:hover:bg-input/38",
			"disabled:hover:border-input disabled:hover:bg-background dark:disabled:hover:border-input dark:disabled:hover:bg-input/30",
			"focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
			"aria-invalid:border-destructive aria-invalid:hover:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
			className
		)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
