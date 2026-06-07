with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Remove lines 329-360 (0-indexed: 328-359)
# Keep line 328 (deletionFilterMode derived)
# Remove lines 329-359 (the old deletion filter code that's still there)
new_lines = lines[:329] + lines[360:]

with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Removed old deletion filter code (lines 329-360)')
