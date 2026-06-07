with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Step 2: Find and replace the deletion filter code (lines 321-353)
# Find line with "type DeletionFilterMode"
start_idx = None
for i, line in enumerate(lines):
    if 'type DeletionFilterMode' in line:
        start_idx = i
        break

if start_idx is not None:
    # Find line with "function readOrderState"
    end_idx = None
    for i in range(start_idx, len(lines)):
        if 'function readOrderState' in lines[i]:
            end_idx = i
            break

    if end_idx is not None:
        # Replace with composable code
        new_code = [
            "  // Deletion filter management using composable\n",
            "  const deletionFilterComposable = useDeletionFilter(\n",
            "    uid,\n",
            "    columnOrderStorageKey,\n",
            "    deletionFilterModeProp ?? 'non_deleted',\n",
            "    onDeletionFilterModeChange\n",
            "  );\n",
            "  const deletionFilterMode = $derived(deletionFilterComposable.deletionFilterMode);\n",
            "\n"
        ]
        lines = lines[:start_idx] + new_code + lines[end_idx:]
        print(f'Replaced lines {start_idx+1}-{end_idx} with composable code')
    else:
        print('Could not find function readOrderState')
else:
    print('Could not find type DeletionFilterMode')

with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('Step 2 done')
