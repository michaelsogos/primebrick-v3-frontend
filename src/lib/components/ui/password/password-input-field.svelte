<script lang="ts">
	import type { PasswordInputProps } from "./types.js";
	import * as Password from "./index.js";

	type Props = Omit<PasswordInputProps, "value"> & {
		value?: string;
		// Minimum password strength score (0-4). Only relevant if a Strength meter is mounted.
		minScore?: 0 | 1 | 2 | 3 | 4;
	};

	let {
		ref = $bindable(null),
		value = $bindable(""),
		minScore = 3,
		class: className,
		...restProps
	}: Props = $props();
</script>

<Password.Root {minScore} class={className}>
	<Password.Input bind:ref bind:value {...restProps} />
	<Password.ToggleVisibility />
</Password.Root>
