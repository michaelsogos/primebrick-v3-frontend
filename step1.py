with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
old = "import { usePreviewPanel } from './composables/usePreviewPanel.svelte.js';\n  import type { MetaColumn, SortDir, ListMetaViewVisibility, ViewName, AdvancedFilter } from '$lib/entity-list/types';"
new = "import { usePreviewPanel } from './composables/usePreviewPanel.svelte.js';\n  import { useDeletionFilter } from './composables/useDeletionFilter.svelte';\n  import type { MetaColumn, SortDir, ListMetaViewVisibility, ViewName, AdvancedFilter } from '$lib/entity-list/types';"

content = content.replace(old, new)

with open('src/lib/components/entity-list-table/EntityListTable.svelte', 'w', encoding='utf-8') as f:
    f.write(content)

print('Step 1 done')
