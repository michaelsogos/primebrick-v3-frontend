<script lang="ts">
  import { untrack } from 'svelte';
  let { initial = 0 }: { initial?: number } = $props();
  // count is local mutable state initialized from a prop — intentionally captures the initial value
  let count = $state(untrack(() => initial));
  let doubled = $derived(count * 2);

  function increment() {
    count += 1;
  }
</script>

<p>Count: {count}</p>
<p>Doubled: {doubled}</p>
<button type="button" onclick={increment}>Increment</button>
