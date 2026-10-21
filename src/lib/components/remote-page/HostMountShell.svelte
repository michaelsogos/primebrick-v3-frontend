<script lang="ts">
  import type { Component } from 'svelte';

  /**
   * HostMountShell — internal wrapper used by `mountHostComponent` to give a
   * host component a mutable props channel. Mounted as a separate Svelte root
   * inside remote-owned DOM (see `ModulePageHost.mount_host`), it exposes an
   * imperative `update(patch)` export on the mount instance so the remote can
   * push prop changes without rune signals crossing the bundle boundary.
   */
  import { untrack } from 'svelte';

  let {
    comp,
    initial,
  }: {
    comp: Component<Record<string, unknown>>;
    initial: Record<string, unknown>;
  } = $props();

  // untrack: `initial` is a snapshot by contract — subsequent prop changes
  // arrive through the exported `update()` channel, not prop re-flow.
  let current = $state<Record<string, unknown>>(untrack(() => initial));

  export function update(patch: Record<string, unknown>) {
    current = { ...current, ...patch };
  }
</script>

{#if comp}
  {@const C = comp}
  <C {...current} />
{/if}
