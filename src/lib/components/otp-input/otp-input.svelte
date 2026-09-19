<script lang="ts">
	/**
	 * OtpInput — digits-only segmented OTP input built on bits-ui PinInput
	 * (shadcn-svelte input-otp wrapper).
	 *
	 * Behavior contract (shared by all OTP flows — MFA challenge, step-up,
	 * enrollment, welcome):
	 *   - accepts digits only (`REGEXP_ONLY_DIGITS`)
	 *   - paste fills all cells (`pasteTransformer` strips non-digits, no lag)
	 *   - `onsubmit(value)` fires on Enter AND when all cells are filled
	 *     (auto-verify) — the caller's submit decides validity
	 *   - `disabled` blocks interaction while a request is in flight
	 *   - autofocuses the hidden input on mount
	 *
	 * Pair with `useOtpInput` for the shared code/submit/reset controller.
	 */
	import * as InputOTP from "$lib/components/ui/input-otp/index.js";
	import { REGEXP_ONLY_DIGITS } from "bits-ui";
	import { cn } from "$lib/utils.js";
	import { onMount, tick } from "svelte";

	let {
		value = $bindable(""),
		maxlength = 6,
		disabled = false,
		autofocus = true,
		id,
		class: className,
		"data-testid": dataTestid,
		onsubmit,
	}: {
		value?: string;
		maxlength?: number;
		disabled?: boolean;
		autofocus?: boolean;
		id?: string;
		class?: string;
		"data-testid"?: string;
		onsubmit?: (value: string) => void;
	} = $props();

	let inputRef = $state<HTMLInputElement | null>(null);

	onMount(async () => {
		if (autofocus) {
			await tick();
			inputRef?.focus();
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === "Enter") {
			e.preventDefault();
			if (!disabled) onsubmit?.(value);
		}
	}

	// Paste: keep digits only, clamp to maxlength — fills cells instantly.
	function pasteTransformer(text: string): string {
		return text.replace(/\D/g, "").slice(0, maxlength);
	}
</script>

<InputOTP.Root
	{maxlength}
	bind:value
	bind:inputRef
	{disabled}
	pattern={REGEXP_ONLY_DIGITS}
	{pasteTransformer}
	onComplete={() => { if (!disabled) onsubmit?.(value); }}
	onkeydown={handleKeydown}
	inputId={id}
	textalign="center"
	data-testid={dataTestid}
	class={cn("justify-center", className)}
>
	{#snippet children({ cells })}
		<InputOTP.Group class="gap-2">
			{#each cells.slice(0, 3) as cell (cell)}
				<InputOTP.Slot {cell} />
			{/each}
		</InputOTP.Group>
		{#if maxlength > 3}
			<InputOTP.Separator />
			<InputOTP.Group class="gap-2">
				{#each cells.slice(3) as cell (cell)}
					<InputOTP.Slot {cell} />
				{/each}
			</InputOTP.Group>
		{/if}
	{/snippet}
</InputOTP.Root>
