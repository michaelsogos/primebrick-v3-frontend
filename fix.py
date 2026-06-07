with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Step 1: Add import after line 53 (index 52)
lines.insert(53, "  import { useDeletionFilter } from './composables/useDeletionFilter.svelte';\n")

# Step 2: Find and replace the deletion filter code
# Find line with "type DeletionFilterMode"
start_idx = None
for i, line in enumerate(lines):
    if 'type DeletionFilterMode' in line:
        start_idx = i
        break

if start_idx:
    # Find line with "function readOrderState"
    end_idx = None
    for i in range(start_idx, len(lines)):
        if 'function readOrderState' in lines[i]:
            end_idx = i
            break

    if end_idx:
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
        lines = lines[:start_idx] + [new_code] + lines[end_idx:]

# Step 3: Remove deletion filter init from onMount
# Find and remove the storedDeletionFilter block
new_lines = []
skip_next = 0
for i, line in enumerate(lines):
    if skip_next > 0:
        skip_next -= 1
        continue
    if 'const storedDeletionFilter = readDeletionFilter();' in line:
        # Skip this line and the next 7 lines
        skip_next = 7
        continue
    new_lines.append(line)
lines = new_lines

# Step 4: Remove the $effect for deletionFilterMode
new_lines = []
skip_next = 0
for i, line in enumerate(lines):
    if skip_next > 0:
        skip_next -= 1
        continue
    if 'let lastDeletionFilterMode:' in line:
        # Skip this line and the next 10 lines
        skip_next = 10
        continue
    new_lines.append(line)
lines = new_lines

# Step 5: Replace toolbar handler
for i, line in enumerate(lines):
    if 'onDeletionFilterModeChange={(mode) => deletionFilterMode = mode}' in line:
        lines[i] = line.replace('onDeletionFilterModeChange={(mode) => deletionFilterMode = mode}', 'onDeletionFilterModeChange={deletionFilterComposable.setDeletionFilterMode}')
        break

with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('Done')
