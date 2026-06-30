<script lang="ts">
	import { cn } from "$lib/utils.js";
	import TextInput from "$lib/components/ui/input/text-input.svelte";
	import CircleCheckBig from '@lucide/svelte/icons/circle-check-big'
  import TicketX from '@lucide/svelte/icons/ticket-x'
  import LoaderCircle from '@lucide/svelte/icons/loader-circle'
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import type { ValidationResult, ValidationStatus } from "$lib/types/validation.js";
	import type { HTMLInputTypeAttribute } from "svelte/elements";

	// Accept all standard input attributes + our custom props
	type Props = {
		value?: string;
		onChange?: (value: string) => void;
		validateFn: (value: string) => Promise<ValidationResult>;
		onStatusChange?: (status: ValidationStatus) => void;
		externalInvalid?: boolean;
		// All standard input attributes
		name?: string;
		id?: string;
		placeholder?: string;
		disabled?: boolean;
		class?: string;
		type?: HTMLInputTypeAttribute;
		required?: boolean;
		minlength?: number;
		maxlength?: number;
		pattern?: string;
		"aria-invalid"?: string | boolean;
		"aria-describedby"?: string;
		"aria-required"?: string | boolean;
		"data-fs-error"?: string;
		// Event handlers - we will compose these
		oninput?: (e: Event) => void;
		onblur?: (e: FocusEvent) => void;
		onchange?: (e: Event) => void;
	};

	let {
		value = $bindable(""),
		onChange,
		validateFn,
		onStatusChange,
		externalInvalid = false,
		name,
		id,
		placeholder,
		disabled = false,
		class: className,
		type = "text",
		required,
		minlength,
		maxlength,
		pattern,
		"aria-invalid": ariaInvalid,
		"aria-describedby": ariaDescribedby,
		"aria-required": ariaRequired,
		"data-fs-error": dataFsError,
		oninput,
		onblur,
		onchange,
	}: Props = $props();

	let status = $state<ValidationStatus>("idle");
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	const DEBOUNCE_DELAY = 300;
	const MIN_CHARS = 3;

	let uiStatus = $derived(externalInvalid ? 'not-valid' : status);

	let isValid = $derived(
		status === "valid" || status === "idle" || status === "api-error"
	);

	let isLoading = $derived(status === "loading");

	// When the clear X is visible (value present, not disabled), the status icon
	// shifts left to avoid overlapping it. Padding adjusts accordingly.
	let hasValue = $derived((value ?? "").length > 0 && !disabled);
	let inputPadding = $derived(hasValue ? "pr-14" : "pr-10");
	let statusIconPos = $derived(hasValue ? "right-9" : "right-3");

	// Notify parent when status changes
	$effect(() => {
		if (onStatusChange) {
			onStatusChange(status);
		}
	});

	async function performValidation(val: string) {
		status = "loading";

		try {
			const result = await validateFn(val);

			switch (result) {
				case "VALID":
					status = "valid";
					break;
				case "NOT_VALID":
					status = "not-valid";
					break;
				case "ERROR_API":
					status = "api-error";
					break;
			}
		} catch (error) {
			// Network error or unexpected error
			status = "api-error";
		}
	}

	function handleInputChange(e: Event) {
		// Call parent's oninput first
		oninput?.(e);
		const val = (e.currentTarget as HTMLInputElement).value;
		value = val;
		onChange?.(val);

		// Clear existing timer
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}

		// Only the ASYNC check is gated by MIN_CHARS.
		// The zod min(3) error is owned by superforms and will show via aria-invalid
		// when the parent form validates on input (validationMethod: 'oninput').
		if (val.length < MIN_CHARS) {
			status = "idle";
			return;
		}

		// Start debounce timer
		debounceTimer = setTimeout(() => {
			performValidation(val);
		}, DEBOUNCE_DELAY);
	}

	function handleBlur(e: FocusEvent) {
		onblur?.(e);
	}

	function handleChange(e: Event) {
		onchange?.(e);
	}

	function handleClear() {
		value = "";
		onChange?.("");
		status = "idle";
	}

	// Cleanup timer on unmount
	$effect(() => {
		return () => {
			if (debounceTimer) {
				clearTimeout(debounceTimer);
			}
		};
	});
</script>

<TextInput
	{id}
	{name}
	bind:value
	{placeholder}
	{disabled}
	{type}
	{required}
	{minlength}
	{maxlength}
	{pattern}
	aria-invalid={ariaInvalid === "true" || ariaInvalid === true}
	aria-describedby={ariaDescribedby}
	aria-required={ariaRequired === "true" || ariaRequired === true}
	data-fs-error={dataFsError}
	class={cn(inputPadding, className)}
	onClear={handleClear}
	oninput={handleInputChange}
	onblur={handleBlur}
	onchange={handleChange}
>
	{#snippet trailing()}
		<div class={cn("absolute top-1/2 -translate-y-1/2 pointer-events-none", statusIconPos)}>
			{#if uiStatus === "idle"}
				<CircleCheckBig class="h-4 w-4 text-muted-foreground/50" />
			{:else if uiStatus === "loading"}
				<LoaderCircle class="h-4 w-4 animate-spin text-muted-foreground" />
			{:else if uiStatus === "valid"}
				<CircleCheckBig class="h-4 w-4 text-green-500" />
			{:else if uiStatus === "not-valid"}
				<TicketX class="h-4 w-4 text-destructive" />
			{:else if uiStatus === "api-error"}
				<AlertTriangle class="h-4 w-4 text-yellow-500" />
			{/if}
		</div>
	{/snippet}
</TextInput>
