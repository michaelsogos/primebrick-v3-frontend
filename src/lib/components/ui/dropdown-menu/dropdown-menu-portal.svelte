<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from '@primebrick/ui/vendor/bits-ui';

	let { ...restProps }: DropdownMenuPrimitive.PortalProps = $props();
</script>

<DropdownMenuPrimitive.Portal {...restProps} />
