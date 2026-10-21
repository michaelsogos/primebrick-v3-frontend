<script lang="ts">
  /**
   * RemoteMountSlot — the inbound direction of the cross-bundle bridge.
   *
   * Renders REMOTE-owned content inside a host render tree: this host
   * component provides the DOM anchor and lifecycle, then calls a
   * remote-provided `mount_fn` which mounts a root using the REMOTE
   * bundle's own svelte runtime (e.g. `mod.cell_mount`).
   *
   * Why not a remote snippet prop? A snippet invoked by the "wrong"
   * bundle's render reads that bundle's `active_effect` — null when the
   * other bundle is rendering — and dies on `.nodes`. Separate roots are
   * the only safe cross-boundary primitive (spike + live E2E proven).
   *
   * When `mount_fn` is absent (chunk predates the export) the optional
   * `fallback` snippet renders instead — graceful degradation.
   */
  import { onMount, untrack, type Snippet } from 'svelte';
  import type { HostMountHandle } from '@primebrick/ui';

  let {
    mount_fn = undefined,
    args = {},
    fallback = undefined,
  }: {
    /** Remote-provided mount: `(el, args) => {update?, destroy}`. */
    mount_fn?: (el: HTMLElement, args: Record<string, unknown>) => unknown;
    /** Plain-values prop object forwarded to the remote mount. */
    args?: Record<string, unknown>;
    /** Rendered when the remote does not provide `mount_fn`. */
    fallback?: Snippet;
  } = $props();

  let el = $state<HTMLSpanElement>();
  let handle: HostMountHandle | null = null;

  onMount(() => {
    const target = el;
    const fn = mount_fn;
    if (!target || !fn) return;
    // untrack: args is a snapshot — remote updates flow through
    // handle.update (below), not through re-mounting on identity churn.
    const initial = untrack(() => args);
    handle = (fn(target, initial) as HostMountHandle | undefined) ?? null;
    return () => {
      void handle?.destroy();
      handle = null;
    };
  });

  // Imperative prop channel — mirrors mount_host's update semantics.
  $effect(() => {
    handle?.update?.(args);
  });
</script>

{#if mount_fn}
  <span bind:this={el} class="contents"></span>
{:else if fallback}
  {@render fallback()}
{/if}
