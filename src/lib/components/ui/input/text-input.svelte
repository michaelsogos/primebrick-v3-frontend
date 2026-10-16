<script lang="ts">
	/**
	 * TextInput — canonical single-line text input.
	 *
	 * Trailing contract (multi-CTA): the built-in clear button (`Eraser`,
	 * `clearable` default true, hidden when readonly/disabled/empty) always
	 * owns the right edge (`right-1.5` = rightmost, glyph 12px from border).
	 * `trailing` snippet content
	 * must self-position to the LEFT of the clear zone (e.g. `right-10`, like
	 * `async-validated-input`'s status icon). Readonly mode shows the copy
	 * button at the same right edge instead of clear.
	 */
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from "svelte/elements";
	import type { Snippet } from "svelte";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import Input from "./input.svelte";
	import { CopyButton } from "$lib/components/ui/copy-button";
	import * as Tooltip from "$lib/components/ui/tooltip";
	import Eraser from "@lucide/svelte/icons/eraser";
	import { inputTrailingIconButtonClasses } from "./input-chrome.js";

	type InputType = Exclude<HTMLInputTypeAttribute, "file">;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, "type" | "files"> & {
			type?: InputType;
			value?: string;
			// --- Clear button (editable mode) ---
			clearable?: boolean;
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
		clearable = true,
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

	let showClear = $derived(mode === "editable" && clearable && (value ?? "").length > 0);
	let showCopy = $derived(mode === "readonly" && (value ?? "").length > 0);
	let showTrailing = $derived(showClear || showCopy);

	let inputClass = $derived(
		cn(
			showTrailing && "pr-9",
			mode === "readonly" && "border-readonly-gradient",
			mode === "disabled" && "border-readonly-gradient",
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

	{#if showCopy}
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
								class={cn(inputTrailingIconButtonClasses, "text-foreground")}
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
					class={cn(inputTrailingIconButtonClasses, "text-foreground")}
				/>
			{/if}
	{/if}

	{#if trailing}
		{@render trailing()}
	{/if}

	{#if showClear}
		<button
			type="button"
			onclick={handleClear}
			aria-label={clearLabel}
			title={clearLabel}
			tabindex={-1}
			class={inputTrailingIconButtonClasses}
		>
			<Eraser class="size-4" />
		</button>
	{/if}
</div>
