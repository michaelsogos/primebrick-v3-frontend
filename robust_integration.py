with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'r', encoding='utf-8') as f:
    lines = f.readlines()

output_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    
    # Step 1: Add import after usePreviewPanel
    if "import { usePreviewPanel } from './composables/usePreviewPanel.svelte.js';" in line:
        output_lines.append(line)
        output_lines.append("  import { useDeletionFilter } from './composables/useDeletionFilter.svelte';\n")
        i += 1
        continue
    
    # Step 2: Replace deletion filter code block
    if 'type DeletionFilterMode' in line and "'non_deleted' | 'deleted' | 'all'" in line:
        # Skip until we find function readOrderState
        output_lines.append("  // Deletion filter management using composable\n")
        output_lines.append("  const deletionFilterComposable = useDeletionFilter(\n")
        output_lines.append("    uid,\n")
        output_lines.append("    columnOrderStorageKey,\n")
        output_lines.append("    deletionFilterModeProp ?? 'non_deleted',\n")
        output_lines.append("    onDeletionFilterModeChange\n")
        output_lines.append("  );\n")
        output_lines.append("  const deletionFilterMode = $derived(deletionFilterComposable.deletionFilterMode);\n")
        output_lines.append("\n")
        # Skip lines until function readOrderState
        while i < len(lines) and 'function readOrderState' not in lines[i]:
            i += 1
        continue
    
    # Step 3: Skip deletion filter init in onMount
    if 'const storedDeletionFilter = readDeletionFilter();' in line:
        # Skip 8 lines
        i += 8
        continue
    
    # Step 4: Skip the $effect for deletionFilterMode
    if 'let lastDeletionFilterMode:' in line:
        # Skip 11 lines
        i += 11
        continue
    
    # Step 5: Replace toolbar handler
    if 'onDeletionFilterModeChange={(mode) => deletionFilterMode = mode}' in line:
        line = line.replace('onDeletionFilterModeChange={(mode) => deletionFilterMode = mode}', 'onDeletionFilterModeChange={deletionFilterComposable.setDeletionFilterMode}')
    
    output_lines.append(line)
    i += 1

with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'w', encoding='utf-8') as f:
    f.writelines(output_lines)

print("All changes applied successfully")
