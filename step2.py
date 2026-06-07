with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the line with "type DeletionFilterMode"
start_idx = None
for i, line in enumerate(lines):
    if 'type DeletionFilterMode' in line:
        start_idx = i
        break

if start_idx is None:
    print('Could not find type DeletionFilterMode')
    exit(1)

# Find the line with "function readOrderState" (the end of the deletion filter code)
end_idx = None
for i in range(start_idx, len(lines)):
    if 'function readOrderState' in lines[i]:
        end_idx = i
        break

if end_idx is None:
    print('Could not find function readOrderState')
    exit(1)

print(f'Found deletion filter code from line {start_idx+1} to {end_idx}')

# Replace with composable code
new_code = """  // Deletion filter management using composable
  const deletionFilterComposable = useDeletionFilter(
    uid,
    columnOrderStorageKey,
    deletionFilterModeProp ?? 'non_deleted',
    onDeletionFilterModeChange
  );
  const deletionFilterMode = $derived(deletionFilterComposable.deletionFilterMode);

"""

new_lines = lines[:start_idx] + [new_code] + lines[end_idx:]

with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Step 2 done')
