with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Step 2: Find and replace the deletion filter code (lines 321-353)
# Find line with "type DeletionFilterMode"
start_idx = None
for i, line in enumerate(lines):
    if 'type DeletionFilterMode' in line:
        start_idx = i
        break

if start_idx is None:
    print("ERROR: Could not find type DeletionFilterMode")
    exit(1)

# Find line with "function readOrderState"
end_idx = None
for i in range(start_idx, len(lines)):
    if 'function readOrderState' in lines[i]:
        end_idx = i
        break

if end_idx is None:
    print("ERROR: Could not find function readOrderState")
    exit(1)

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
print(f"Step 2: Replaced lines {start_idx+1}-{end_idx} with composable code")

# Step 3: Remove deletion filter init from onMount
new_lines = []
skip_count = 0
for i, line in enumerate(lines):
    if skip_count > 0:
        skip_count -= 1
        continue
    if 'const storedDeletionFilter = readDeletionFilter();' in line:
        # Skip this line and the next 7 lines
        skip_count = 7
        print(f"Step 3: Removed deletion filter init from onMount at line {i+1}")
        continue
    new_lines.append(line)
lines = new_lines

# Step 4: Remove the $effect for deletionFilterMode
new_lines = []
skip_count = 0
for i, line in enumerate(lines):
    if skip_count > 0:
        skip_count -= 1
        continue
    if 'let lastDeletionFilterMode:' in line:
        # Skip this line and the next 10 lines
        skip_count = 10
        print(f"Step 4: Removed deletion filter $effect at line {i+1}")
        continue
    new_lines.append(line)
lines = new_lines

# Step 5: Replace toolbar handler
for i, line in enumerate(lines):
    if 'onDeletionFilterModeChange={(mode) => deletionFilterMode = mode}' in line:
        lines[i] = line.replace('onDeletionFilterModeChange={(mode) => deletionFilterMode = mode}', 'onDeletionFilterModeChange={deletionFilterComposable.setDeletionFilterMode}')
        print(f"Step 5: Replaced toolbar handler at line {i+1}")
        break

with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("\nAll changes applied successfully!")
