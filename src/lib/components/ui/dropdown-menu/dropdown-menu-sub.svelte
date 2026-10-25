<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from '@primebrick/ui/vendor/bits-ui';

	let { open = $bindable(false), ...restProps }: DropdownMenuPrimitive.SubProps = $props();
</script>

<DropdownMenuPrimitive.Sub bind:open {...restProps} />
