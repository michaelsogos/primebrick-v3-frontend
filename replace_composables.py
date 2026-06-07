import re

with open('d:/git/primebrick/primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add imports for useColumnOrder, useViewMode, useDeletionFilter
content = content.replace(
    '    useSheetPanelManagement\n  } from \'./composables\';',
    '    useSheetPanelManagement,\n    useColumnOrder,\n    useViewMode,\n    useDeletionFilter\n  } from \'./composables\';'
)

# 2. Replace ColumnOrderState type and orderState with columnOrder composable
pattern = r'type ColumnOrderState = \{[^}]+\};\s*const orderState = \$state<ColumnOrderState>\(\{\}\);'
replacement = 'const columnOrder = useColumnOrder(columnOrderStorageKey);'
content = re.sub(pattern, replacement, content, flags=re.DOTALL)

# 3. Replace all orderState references with columnOrder.orderState
content = content.replace('orderState.', 'columnOrder.orderState.')

# 4. Replace applyKeyOrder with columnOrder.applyKeyOrder
content = content.replace('applyKeyOrder', 'columnOrder.applyKeyOrder')

# 5. Replace moveKeyWithin with columnOrder.moveKeyWithin
content = content.replace('moveKeyWithin', 'columnOrder.moveKeyWithin')

# 6. Replace writeOrderState with columnOrder.writeOrderState
content = content.replace('writeOrderState', 'columnOrder.writeOrderState')

# 7. Replace view mode management
# Find and replace the view mode state and functions
view_mode_pattern = r'const viewModeStorageKey = \$derived\([^)]+\);\s*let viewMode = \$state<ViewMode>\(\'table\'\);\s*function readViewMode\(\): ViewMode \| null \{[^}]+\}\s*function writeViewMode\(next: ViewMode\) \{[^}]+\}'
view_mode_replacement = '''const viewModeStorageKey = $derived(
    columnOrderStorageKey ? `${columnOrderStorageKey}:viewMode` : `pb.entityList:${uid}:viewMode`
  );
  const viewModeComposable = useViewMode({
    initialMode: 'table',
    storageKey: viewModeStorageKey
  });
  const viewMode = $derived(viewModeComposable.viewMode);'''
content = re.sub(view_mode_pattern, view_mode_replacement, content, flags=re.DOTALL)

# 8. Replace onViewModeChange callback
content = content.replace(
    'onViewModeChange={(mode) => viewMode = mode}',
    'onViewModeChange={viewModeComposable.setViewMode}'
)

# 9. Remove viewMode initialization from onMount
content = re.sub(
    r'const storedMode = readViewMode\(\);\s*if \(storedMode\) viewMode = storedMode;\s*',
    '',
    content
)

# 10. Remove viewMode persistence effect
content = re.sub(
    r'\$effect\(\(\) => \{\s*void viewMode;\s*writeViewMode\(viewMode\);\s*\}\);',
    '',
    content
)

# 11. Replace deletion filter management
deletion_filter_pattern = r'const deletionFilterStorageKey = \$derived\([^)]+\);\s*// Read from sessionStorage eagerly[^}]+\}\);.*?let deletionFilterMode = \$state<DeletionFilterMode>\(_initialDeletionMode \?\? deletionFilterModeProp \?\? \'non_deleted\'\);\s*function readDeletionFilter\(\): DeletionFilterMode \| null \{[^}]+\}\s*function writeDeletionFilter\(next: DeletionFilterMode\) \{[^}]+\}'
deletion_filter_replacement = '''const deletionFilterComposable = useDeletionFilter(
    uid,
    columnOrderStorageKey,
    deletionFilterModeProp ?? 'non_deleted',
    onDeletionFilterModeChange
  );
  const deletionFilterMode = $derived(deletionFilterComposable.deletionFilterMode);'''
content = re.sub(deletion_filter_pattern, deletion_filter_replacement, content, flags=re.DOTALL)

# 12. Remove deletionFilter initialization from onMount
content = re.sub(
    r'const storedDeletionFilter = readDeletionFilter\(\);\s*if \(storedDeletionFilter\) \{\s*deletionFilterMode = storedDeletionFilter;\s*// If the restored value differs from what the parent passed, notify the parent so it re-fetches\s*if \(storedDeletionFilter !== \(deletionFilterModeProp \?\? \'non_deleted\'\)\) \{\s*onDeletionFilterModeChange\?\.\(storedDeletionFilter\);\s*\}\s*\}\s*',
    '',
    content
)

# 13. Remove deletionFilter persistence effect
content = re.sub(
    r'let lastDeletionFilterMode: typeof deletionFilterMode \| null = null;\s*\$effect\(\(\) => \{\s*void deletionFilterMode;\s*writeDeletionFilter\(deletionFilterMode\);\s*// Skip the initial firing[^}]+\}\);',
    '',
    content
)

# 14. Remove manual functions that are now in composables
# Remove readOrderState, writeOrderState, applyKeyOrder, moveKeyWithin functions
content = re.sub(
    r'function readOrderState\(\): ColumnOrderState \{[^}]+\}\s*function writeOrderState\(next: ColumnOrderState\) \{[^}]+\}\s*function applyKeyOrder\(cols: MetaColumn\[\], keys: string\[\] \| undefined\): MetaColumn\[\] \{[^}]+\}\s*function moveKeyWithin\(keys: string\[\], fromKey: string, toKey: string\): string\[\] \{[^}]+\}',
    '',
    content,
    flags=re.DOTALL
)

with open('d:/git/primebrick/primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte', 'w', encoding='utf-8') as f:
    f.write(content)

print('Composable integration complete')
