import re

with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'r', encoding='utf-8') as f:
    content = f.read()

# Find and replace the old deletion filter code with the composable
old_pattern = r"  const deletionFilterMode = \$\(derived\(deletionFilterComposable\.deletionFilterMode\);\)\s+const deletionFilterStorageKey = \$\(derived\(\s+columnOrderStorageKey \? `\$\{columnOrderStorageKey\}:deletionFilter` : `pb\.entityList:\$\{uid\}:deletionFilter`\s+\);\s+// Read from sessionStorage eagerly \(before effects run\) to avoid the effect overwriting the stored value\s+const _rawDeletion = \(\(\) => \{\s+if \(typeof window === 'undefined'\) return null;\s+const key = columnOrderStorageKey \? `\$\{columnOrderStorageKey\}:deletionFilter` : `pb\.entityList:\$\{uid\}:deletionFilter`;\s+return window\.sessionStorage\.getItem\(key\);\s+\}\)\(\);\s+const _initialDeletionMode: DeletionFilterMode \| null =\s+_rawDeletion === 'non_deleted' \|\| _rawDeletion === 'deleted' \|\| _rawDeletion === 'all' \? _rawDeletion : null;\s+let deletionFilterMode = \$\(state<DeletionFilterMode>\(_initialDeletionMode \?\? deletionFilterModeProp \?\? 'non_deleted'\);\s+function readDeletionFilter\(\): DeletionFilterMode \| null \{\s+if \(typeof window === 'undefined'\) return null;\s+try \{\s+const raw = window\.sessionStorage\.getItem\(deletionFilterStorageKey\);\s+if \(raw === 'non_deleted' \|\| raw === 'deleted' \|\| raw === 'all'\) return raw;\s+return null;\s+\} catch \{\s+return null;\s+\}\s+\}\s+function writeDeletionFilter\(next: DeletionFilterMode\) \{\s+if \(typeof window === 'undefined'\) return;\s+try \{\s+window\.sessionStorage\.setItem\(deletionFilterStorageKey, next\);\s+\} catch \{\s+// ignore quota / blocked storage\s+\}\s+\}"

replacement = "  const deletionFilterMode = $derived(deletionFilterComposable.deletionFilterMode);"

content = re.sub(old_pattern, replacement, content, flags=re.DOTALL)

with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'w', encoding='utf-8') as f:
    f.write(content)

print('Replaced deletion filter code')
