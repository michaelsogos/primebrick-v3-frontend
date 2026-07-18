<script lang="ts">
	import * as FormPrimitive from "formsnap";
	import { cn, type WithoutChild } from "$lib/utils.js";
	import { t } from "$lib/i18n";

	let {
		ref = $bindable(null),
		class: className,
		errorClasses,
		children: childrenProp,
		...restProps
	}: WithoutChild<FormPrimitive.FieldErrorsProps> & {
		errorClasses?: string | undefined | null;
	} = $props();

	function translateError(error: string): string {
		// Generic format: `translationKey|jsonParams` (e.g., `validation.tooShort|{"min": 3}`)
		// If no `|` separator, the error is a plain translation key with no params.
		if (!error.includes('|')) return $t(error);

		const [key, jsonParams] = error.split('|', 2);
		try {
			const params = JSON.parse(jsonParams);
			return $t(key, params);
		} catch {
			// Malformed JSON — fall back to translating the key without params
			return $t(key);
		}
	}
</script>

<FormPrimitive.FieldErrors
	bind:ref
	class={cn("text-destructive text-xs font-medium", className)}
	{...restProps}
>
	{#snippet children({ errors, errorProps })}
		{#if childrenProp}
			{@render childrenProp({ errors, errorProps })}
		{:else}
			{#each errors as error (error)}
				<div {...errorProps} class={cn(errorClasses)}>{translateError(error)}</div>
			{/each}
		{/if}
	{/snippet}
</FormPrimitive.FieldErrors>
