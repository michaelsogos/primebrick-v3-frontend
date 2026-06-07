with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'r', encoding='utf-8') as f:
    content = f.read()

# Step 1: Add import
content = content.replace(
    "import { usePreviewPanel } from './composables/usePreviewPanel.svelte.js';\n  import type { MetaColumn, SortDir, ListMetaViewVisibility, ViewName, AdvancedFilter } from '$lib/entity-list/types';",
    "import { usePreviewPanel } from './composables/usePreviewPanel.svelte.js';\n  import { useDeletionFilter } from './composables/useDeletionFilter.svelte';\n  import type { MetaColumn, SortDir, ListMetaViewVisibility, ViewName, AdvancedFilter } from '$lib/entity-list/types';"
)

# Step 2: Replace old deletion filter code with composable
old_block = """  type DeletionFilterMode = 'non_deleted' | 'deleted' | 'all';
  const deletionFilterStorageKey = $derived(
    columnOrderStorageKey ? `${columnOrderStorageKey}:deletionFilter` : `pb.entityList:${uid}:deletionFilter`
  );
  // Read from sessionStorage eagerly (before effects run) to avoid the effect overwriting the stored value
  const _rawDeletion = (() => {
    if (typeof window === 'undefined') return null;
    const key = columnOrderStorageKey ? `${columnOrderStorageKey}:deletionFilter` : `pb.entityList:${uid}:deletionFilter`;
    return window.sessionStorage.getItem(key);
  })();
  const _initialDeletionMode: DeletionFilterMode | null =
    _rawDeletion === 'non_deleted' || _rawDeletion === 'deleted' || _rawDeletion === 'all' ? _rawDeletion : null;
  let deletionFilterMode = $state<DeletionFilterMode>(_initialDeletionMode ?? deletionFilterModeProp ?? 'non_deleted');

  function readDeletionFilter(): DeletionFilterMode | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.sessionStorage.getItem(deletionFilterStorageKey);
      if (raw === 'non_deleted' || raw === 'deleted' || raw === 'all') return raw;
      return null;
    } catch {
      return null;
    }
  }

  function writeDeletionFilter(next: DeletionFilterMode) {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(deletionFilterStorageKey, next);
    } catch {
      // ignore quota / blocked storage
    }
  }"""

new_block = """  // Deletion filter management using composable
  const deletionFilterComposable = useDeletionFilter(
    uid,
    columnOrderStorageKey,
    deletionFilterModeProp ?? 'non_deleted',
    onDeletionFilterModeChange
  );
  const deletionFilterMode = $derived(deletionFilterComposable.deletionFilterMode);"""

content = content.replace(old_block, new_block)

# Step 3: Remove deletion filter init from onMount
onmount_old = """    const storedDeletionFilter = readDeletionFilter();
    if (storedDeletionFilter) {
      deletionFilterMode = storedDeletionFilter;
      // If the restored value differs from what the parent passed, notify the parent so it re-fetches
      if (storedDeletionFilter !== (deletionFilterModeProp ?? 'non_deleted')) {
        onDeletionFilterModeChange?.(storedDeletionFilter);
      }
    }"""

content = content.replace(onmount_old, "")

# Step 4: Remove the $effect for deletionFilterMode
effect_old = """  let lastDeletionFilterMode: typeof deletionFilterMode | null = null;
  $effect(() => {
    void deletionFilterMode;
    writeDeletionFilter(deletionFilterMode);
    // Skip the initial firing so we don't trigger an extra refresh on mount when the
    // value didn't actually change (the parent already holds the same value).
    if (lastDeletionFilterMode !== null && lastDeletionFilterMode !== deletionFilterMode) {
      onDeletionFilterModeChange?.(deletionFilterMode);
    }
    lastDeletionFilterMode = deletionFilterMode;
  });"""

content = content.replace(effect_old, "")

# Step 5: Replace toolbar handler
content = content.replace(
    "onDeletionFilterModeChange={(mode) => deletionFilterMode = mode}",
    "onDeletionFilterModeChange={deletionFilterComposable.setDeletionFilterMode}"
)

with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'w', encoding='utf-8') as f:
    f.write(content)

print("All changes applied")
