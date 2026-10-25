<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from '@primebrick/ui/vendor/bits-ui';

	let {
		ref = $bindable(null),
		value = $bindable(),
		...restProps
	}: DropdownMenuPrimitive.RadioGroupProps = $props();
</script>

<DropdownMenuPrimitive.RadioGroup
	bind:ref
	bind:value
	data-slot="dropdown-menu-radio-group"
	{...restProps}
/>
