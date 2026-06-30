<script lang="ts">
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from "svelte/elements";
	import type { Snippet } from "svelte";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import Input from "./input.svelte";
	import { CopyButton } from "$lib/components/ui/copy-button";
	import * as Tooltip from "$lib/components/ui/tooltip";
	import X from "@lucide/svelte/icons/x";
	import { inputTrailingIconButtonClasses } from "./input-chrome.js";

	type InputType = Exclude<HTMLInputTypeAttribute, "file">;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, "type" | "files"> & {
			type?: InputType;
			value?: string;
			// --- Clear button (editable mode) ---
			onClear?: () => void;
			clearLabel?: string;
			// --- Copy button (readonly mode) ---
			onCopy?: (status: "success" | "failure" | undefined) => void;
			copyTooltipLabel?: string;
			copyAnimationDuration?: number;
			// --- Extra trailing content (e.g. async status icon) ---
			trailing?: Snippet;
		}
	>;

	let {
		ref = $bindable(null),
		value = $bindable(""),
		type,
		readonly = false,
		disabled = false,
		onClear,
		clearLabel = "Clear",
		onCopy,
		copyTooltipLabel,
		copyAnimationDuration = 2000,
		trailing,
		class: className,
		...restProps
	}: Props = $props();

	let mode = $derived(disabled ? "disabled" : readonly ? "readonly" : "editable");

	let showTrailing = $derived(mode !== "disabled" && (value ?? "").length > 0);

	let inputClass = $derived(
		cn(
			showTrailing && "pr-9",
			mode === "readonly" && "bg-muted",
			className,
		),
	);

	function handleClear() {
		value = "";
		onClear?.();
		ref?.focus();
	}
</script>

<div class="relative">
	<Input
		bind:ref
		bind:value
		{type}
		{readonly}
		{disabled}
		class={inputClass}
		{...restProps}
	/>

	{#if showTrailing}
		{#if mode === "readonly"}
			{#if copyTooltipLabel}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props: tooltipProps })}
							<CopyButton
								text={value ?? ""}
								variant="ghost"
								size="icon"
								animationDuration={copyAnimationDuration}
								onCopy={onCopy}
								class={inputTrailingIconButtonClasses}
								{...tooltipProps}
							/>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>{copyTooltipLabel}</Tooltip.Content>
				</Tooltip.Root>
			{:else}
				<CopyButton
					text={value ?? ""}
					variant="ghost"
					size="icon"
					animationDuration={copyAnimationDuration}
					onCopy={onCopy}
					class={inputTrailingIconButtonClasses}
				/>
			{/if}
		{:else if mode === "editable"}
			<button
				type="button"
				onclick={handleClear}
				aria-label={clearLabel}
				title={clearLabel}
				class={inputTrailingIconButtonClasses}
			>
				<X class="size-4" />
			</button>
		{/if}
	{/if}

	{#if trailing}
		{@render trailing()}
	{/if}
</div>
