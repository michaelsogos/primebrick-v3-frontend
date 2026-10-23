<script lang="ts">
	import { Dialog as DialogPrimitive } from '@primebrick/ui/vendor/bits-ui';

	let { open = $bindable(false), ...restProps }: DialogPrimitive.RootProps = $props();
</script>

<DialogPrimitive.Root bind:open {...restProps} />
