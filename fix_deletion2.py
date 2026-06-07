with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Remove lines 329-360 (0-indexed: 328-359)
# Line 328 is the deletionFilterMode derived line, keep it
# Remove lines 329-359 (31 lines)
new_lines = lines[:329] + lines[360:]

with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Removed lines 329-360')
