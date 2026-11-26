<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { useEntityList } from '../composables/useEntityList.svelte';

  /**
   * Test-only host — mounts useEntityList exactly like EntityTablePage does
   * (fire-and-forget init in onMount) and exposes the instance so the test
   * can assert what async continuations do after the host is destroyed.
   */
  let { capture }: { capture: (list: ReturnType<typeof useEntityList<Record<string, unknown>>>) => void } = $props();

  const list = useEntityList<Record<string, unknown>>({
    basePath: '/svc/crm/api/v1/entities/sequence',
    storageKeyPrefix: 'pb:test-destroy-guard:list:'
  });
  // Capture once at creation — the instance identity never changes.
  void untrack(() => capture(list));
  onMount(() => {
    void list.init();
  });
</script>

<div>destroy-guard host</div>
