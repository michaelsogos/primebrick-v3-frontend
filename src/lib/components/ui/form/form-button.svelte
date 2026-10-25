<script lang="ts">
	import { Button, type ButtonProps } from '@primebrick/ui';

	let { ref = $bindable(null), ...restProps }: ButtonProps = $props();
</script>

<Button bind:ref type="submit" {...restProps} />
