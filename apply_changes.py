import re

with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'r', encoding='utf-8') as f:
    content = f.read()

# Step 1: Add the import after usePreviewPanel
content = content.replace(
    "import { usePreviewPanel } from './composables/usePreviewPanel.svelte.js';\n  import type { MetaColumn,",
    "import { usePreviewPanel } from './composables/usePreviewPanel.svelte.js';\n  import { useDeletionFilter } from './composables/useDeletionFilter.svelte';\n  import type { MetaColumn,",
)

# Step 2: Replace the old deletion filter code with the composable
old_code = """  type DeletionFilterMode = 'non_deleted' | 'deleted' | 'all';
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

new_code = """  // Deletion filter management using composable
  const deletionFilterComposable = useDeletionFilter(
    uid,
    columnOrderStorageKey,
    deletionFilterModeProp ?? 'non_deleted',
    onDeletionFilterModeChange
  );
  const deletionFilterMode = $derived(deletionFilterComposable.deletionFilterMode);"""

content = content.replace(old_code, new_code)

# Step 3: Remove the deletion filter initialization from onMount
# Find the onMount block and remove the deletion filter part
onMount_pattern = r"(  onMount\(\(\) => \{[^}]+const storedMode = readViewMode\(\);\s+if \(storedMode\) viewMode = storedMode;\s+)(    const storedDeletionFilter = readDeletionFilter\(\);\s+if \(storedDeletionFilter\) \{\s+deletionFilterMode = storedDeletionFilter;\s+// If the restored value differs from what the parent passed, notify the parent so it re-fetches\s+if \(storedDeletionFilter !== \(deletionFilterModeProp \?\? 'non_deleted'\)\) \{\s+onDeletionFilterModeChange\?\.\(storedDeletionFilter\);\s+\}\s+\}\s+)(\s+\}\);)"

content = re.sub(onMount_pattern, r"\1\2", content)

# Step 4: Remove the manual $effect for deletionFilterMode
effect_pattern = r"(  let lastDeletionFilterMode: typeof deletionFilterMode \| null = null;\s+\$effect\(\(\) => \{\s+void deletionFilterMode;\s+writeDeletionFilter\(deletionFilterMode\);\s+// Skip the initial firing so we don't trigger an extra refresh on mount when the\s+// value didn't actually change \(the parent already holds the same value\)\.\s+if \(lastDeletionFilterMode !== null && lastDeletionFilterMode !== deletionFilterMode\) \{\s+onDeletionFilterModeChange\?\.\(deletionFilterMode\);\s+\}\s+lastDeletionFilterMode = deletionFilterMode;\s+\}\);\s+)"

content = re.sub(effect_pattern, "", content)

# Step 5: Replace the toolbar handler
content = content.replace(
    'onDeletionFilterModeChange={(mode) => deletionFilterMode = mode}',
    'onDeletionFilterModeChange={deletionFilterComposable.setDeletionFilterMode}'
)

with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'w', encoding='utf-8') as f:
    f.write(content)

print('All changes applied successfully')
