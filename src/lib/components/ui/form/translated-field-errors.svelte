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

	function translateError(error: string, errorObj?: any): string {
		// If the error is a translation key, translate it with parameters
		if (error.startsWith('validation.')) {
			// Extract parameters from Zod error object
			const params: Record<string, any> = {};
			
			if (errorObj) {
				// Handle Zod error parameters
				if (errorObj.minimum !== undefined) params.min = errorObj.minimum;
				if (errorObj.maximum !== undefined) params.max = errorObj.maximum;
			}
			
			return $t(error, params);
		}
		// Otherwise return as-is
		return error;
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
