<script lang="ts">
	import { Portal as TooltipPrimitivePortal } from "$lib/vendor/bits-ui-tooltip-exports";
	import type { PortalProps } from "$lib/vendor/bits-ui-tooltip-exports";

	let { ...restProps }: PortalProps = $props();
</script>

<TooltipPrimitivePortal {...restProps} />
