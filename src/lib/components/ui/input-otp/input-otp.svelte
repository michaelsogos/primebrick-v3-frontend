<script lang="ts">
	import { PinInput as InputOTPPrimitive } from "bits-ui";
	import { cn, type WithElementRef } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		inputRef = $bindable(null),
		class: className,
		value = $bindable(""),
		...restProps
	}: WithElementRef<InputOTPPrimitive.RootProps, HTMLDivElement> = $props();
</script>

<InputOTPPrimitive.Root
	bind:ref
	bind:inputRef
	bind:value
	data-slot="input-otp"
	class={cn("flex items-center gap-2 has-disabled:opacity-50", className)}
	{...restProps}
/>
