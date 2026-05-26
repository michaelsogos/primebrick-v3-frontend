<script lang="ts">
	import { cn } from "$lib/utils.js";
	import Input from "$lib/components/ui/input/input.svelte";
	import { CircleCheckBig, TicketX, LoaderCircle, AlertTriangle } from "lucide-svelte";
	import type { ValidationResult, ValidationStatus } from "$lib/types/validation.js";
	import type { HTMLInputTypeAttribute } from "svelte/elements";

	// Accept all standard input attributes + our custom props
	type Props = {
		value?: string;
		onChange?: (value: string) => void;
		validateFn: (value: string) => Promise<ValidationResult>;
		onStatusChange?: (status: ValidationStatus) => void;
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

	let isValid = $derived(
		status === "valid" || status === "idle" || status === "api-error"
	);

	let isLoading = $derived(status === "loading");

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

		// Reset to idle if value is too short
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

	// Cleanup timer on unmount
	$effect(() => {
		return () => {
			if (debounceTimer) {
				clearTimeout(debounceTimer);
			}
		};
	});
</script>

<div class="relative">
	<Input
		{id}
		{name}
		{value}
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
		class={cn("pr-10", className)}
		oninput={handleInputChange}
		onblur={handleBlur}
		onchange={handleChange}
	/>

	<div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
		{#if status === "idle"}
			<CircleCheckBig class="h-4 w-4 text-muted-foreground/50" />
		{:else if status === "loading"}
			<LoaderCircle class="h-4 w-4 animate-spin text-muted-foreground" />
		{:else if status === "valid"}
			<CircleCheckBig class="h-4 w-4 text-green-500" />
		{:else if status === "not-valid"}
			<TicketX class="h-4 w-4 text-destructive" />
		{:else if status === "api-error"}
			<AlertTriangle class="h-4 w-4 text-yellow-500" />
		{/if}
	</div>
</div>
