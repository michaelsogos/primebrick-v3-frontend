<script lang="ts">
  let { initial = 0 }: { initial?: number } = $props();
  let count = $state(initial);
  let doubled = $derived(count * 2);

  function increment() {
    count += 1;
  }
</script>

<p>Count: {count}</p>
<p>Doubled: {doubled}</p>
<button type="button" onclick={increment}>Increment</button>
