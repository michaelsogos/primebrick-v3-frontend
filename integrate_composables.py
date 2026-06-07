#!/usr/bin/env python3
import re

file_path = 'd:/git/primebrick/primebrick-fe-v3/src/lib/components/entity-list-table/EntityListTable.svelte'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Step 1: Replace ColumnOrderState type and orderState with columnOrder composable
old_pattern = r'type ColumnOrderState = \{[^}]+\};\s*const orderState = \$state<ColumnOrderState>\(\{\}\);'
new_replacement = 'const columnOrder = useColumnOrder(columnOrderStorageKey);'
content = re.sub(old_pattern, new_replacement, content, flags=re.DOTALL)

# Step 2: Replace all orderState references with columnOrder.orderState
content = content.replace('orderState.', 'columnOrder.orderState.')

# Step 3: Replace applyKeyOrder with columnOrder.applyKeyOrder
content = content.replace('applyKeyOrder', 'columnOrder.applyKeyOrder')

# Step 4: Replace moveKeyWithin with columnOrder.moveKeyWithin
content = content.replace('moveKeyWithin', 'columnOrder.moveKeyWithin')

# Step 5: Replace writeOrderState with columnOrder.writeOrderState
content = content.replace('writeOrderState', 'columnOrder.writeOrderState')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Step 1-5 complete: Column order composable integrated")
