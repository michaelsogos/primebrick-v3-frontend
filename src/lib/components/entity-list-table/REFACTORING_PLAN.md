# EntityListTable Main Component Refactoring Plan

## Overview
This plan details the step-by-step approach to refactor the main `EntityListTable.svelte` component (4887 lines) to use the extracted sub-components and composables.

## Strategy
- **Incremental refactoring**: Replace sections one at a time to maintain functionality
- **Keep original intact**: Create new refactored version, don't modify original until tested
- **Test after each step**: Verify functionality before proceeding
- **Maintain API compatibility**: Ensure props interface remains unchanged

## Detailed Sub-Steps

### Step 10a: Refactor imports and setup composables
**Goal**: Update imports and initialize composables for state management

**Actions**:
1. Remove old panel imports (`$lib/entity-list/sheets/panels/...`)
2. Add new panel imports from `./panels/`
3. Add toolbar sub-component imports from `./toolbar/`
4. Add table sub-component imports from `./table/`
5. Add card sub-component imports from `./cards/`
6. Add dialog imports from `./dialogs/`
7. Add pagination import from `./pagination/`
8. Add composable imports from `./composables/`
9. Initialize composables:
   - `useSelection` for row selection state
   - `useSorting` for column sorting state
   - `useViewMode` for view mode state
   - `useFilters` for filter values
   - `useAdvancedFilters` for advanced filters
10. Replace manual state management with composable returns
11. Update all state references to use composable state

**Risk**: Low - only imports and state initialization changes

---

### Step 10b: Replace toolbar UI with extracted components
**Goal**: Replace inline toolbar markup with extracted sub-components

**Actions**:
1. Locate toolbar section (around lines 2830-3250)
2. Replace search input group with `SearchBar` component
3. Replace view mode toggle buttons with `ViewModeToggle` component
4. Replace deletion filter toggle with `DeletionFilterToggle` component
5. Replace bulk actions buttons with `BulkActions` component
6. Pass appropriate props to each component
7. Remove redundant toolbar state and handlers
8. Test toolbar functionality (search, view mode, filters, bulk actions)

**Props to pass**:
- SearchBar: `searchValue`, `onSearchChange`, `onResetSearch`, `searchInKeys`, `searchableColumns`, `onSearchInKeysChange`, `toggleSearchKey`, `searchScopeLabel`, `openSheet`
- ViewModeToggle: `viewMode`, `onViewModeChange`
- DeletionFilterToggle: `deletionFilterMode`, `onDeletionFilterModeChange`
- BulkActions: `selectedKeys`, `enabledActions`, `onBulkDelete`, `onBulkRestore`, `onBulkExport`, `onBulkDuplicate`

**Risk**: Medium - UI changes, need to verify all toolbar interactions work

---

### Step 10c: Replace table body with extracted components
**Goal**: Replace inline table rendering with extracted table sub-components

**Actions**:
1. Locate table body section (around lines 3300-4100)
2. Replace table header row with `TableHeader` component
3. Replace table cell rendering with `TableCell` component
4. Update loop to use `TableCell` for each cell
5. Pass appropriate props to each component
6. Remove redundant cell rendering logic
7. Test table rendering, sorting, sticky columns

**Props to pass**:
- TableHeader: `column`, `sortDirection`, `onSort`, `isSortable`, `isSelected`, `onSelectAll`, `stickyClass`
- TableCell: `row`, `column`, `cellSnippet`, `datetimeIanaModeByKey`, `uiLang`

**Risk**: Medium - core rendering logic changes

---

### Step 10d: Replace card views with extracted components
**Goal**: Replace inline card rendering with extracted card sub-components

**Actions**:
1. Locate card view sections (around lines 4100-4350)
2. Replace cards grid view with `CardGrid` component
3. Replace cards list view with `CardList` component
4. Pass appropriate props to each component
5. Remove redundant card rendering logic
6. Test card views, selection, row actions

**Props to pass**:
- CardGrid/CardList: `rows`, `columns`, `visibleKeys`, `selectedKeys`, `onSelectedKeysChange`, `uid`, `rowSelectionEnabled`, `rowActions`, `entityRowActions`, `datetimeIanaModeByKey`, `onRowClick`, `onPreviewRow`, `onEditRow`, `onDeleteRow`, `onRestoreRow`, `onDuplicateRow`, `onExportRow`

**Risk**: Medium - alternative view rendering changes

---

### Step 10e: Replace dialogs with extracted components
**Goal**: Replace inline dialog markup with extracted dialog components

**Actions**:
1. Locate dialog sections (around lines 4460-4700)
2. Replace bulk delete dialog with `DeleteDialog` component
3. Replace bulk restore dialog with `RestoreDialog` component
4. Replace export dialog with `ExportDialog` component
5. Replace duplicate dialog with `DuplicateDialog` component
6. Pass appropriate props to each component
7. Remove redundant dialog state and handlers
8. Test all dialog interactions

**Props to pass**:
- DeleteDialog: `open`, `count`, `onConfirm`, `onCancel`, `isDeleting`
- RestoreDialog: `open`, `count`, `onConfirm`, `onCancel`, `isRestoring`
- ExportDialog: `open`, `count`, `total`, `scope`, `onConfirm`, `onCancel`, `isExporting`, `fileType`
- DuplicateDialog: `open`, `count`, `scope`, `onConfirm`, `onCancel`, `isDuplicating`

**Risk**: Low - dialog components are self-contained

---

### Step 10f: Replace pagination with extracted component
**Goal**: Replace inline pagination markup with extracted component

**Actions**:
1. Locate pagination section (around lines 4350-4400)
2. Replace pagination buttons with `Pagination` component
3. Pass appropriate props
4. Remove redundant pagination logic
5. Test pagination navigation

**Props to pass**:
- Pagination: `currentPage`, `totalPages`, `usesClientPaging`, `clientSelectedPage`, `onPageChange`

**Risk**: Low - pagination is simple and isolated

---

### Step 10g: Update panel references to use new locations
**Goal**: Update sheet panel registrations to use new panel locations

**Actions**:
1. Locate sheet panel registrations (around lines 3020-3050)
2. Update `FiltersPanel` import path to `./panels/FiltersPanel.svelte`
3. Update `VersionHistoryPanel` import path to `./panels/VersionHistoryPanel.svelte`
4. Update `SearchInPanel` registration to use `./panels/SearchInPanel.svelte`
5. Update `ColumnSelectorPanel` registration to use `./panels/ColumnSelectorPanel.svelte`
6. Test all panel openings and interactions

**Risk**: Low - only import path changes

---

### Step 10h: Remove redundant code and cleanup
**Goal**: Remove code that's now handled by sub-components and composables

**Actions**:
1. Remove redundant state variables (now in composables)
2. Remove redundant handler functions (now in composables)
3. Remove redundant helper functions (now in sub-components)
4. Remove unused imports
5. Clean up comments
6. Format code
7. Verify no compilation errors

**Risk**: Medium - need to ensure nothing important is removed

---

### Step 10i: Test refactored component
**Goal**: Comprehensive testing of refactored component

**Actions**:
1. Test toolbar: search, view mode toggle, deletion filter, bulk actions
2. Test table: rendering, sorting, selection, sticky columns
3. Test cards: grid view, list view, selection, row actions
4. Test dialogs: delete, restore, export, duplicate
5. Test pagination: navigation, page status
6. Test panels: filters, search-in, column selector, version history
7. Test edge cases: empty data, large datasets, error states
8. Verify performance is acceptable
9. Check for console errors
10. Verify accessibility (keyboard navigation, screen readers)

**Risk**: Critical - this step validates the entire refactoring

---

## Rollback Plan
Rollback is not expected based on manual verification. However, if issues arise:
1. Revert to previous working state
2. Identify the issue
3. Fix the issue in the sub-component or composable
4. Retry the step

## Success Criteria
- All functionality preserved from original component
- No compilation errors
- No runtime errors
- All tests pass
- Code is more maintainable and readable
- Performance is not degraded

---

## Step 12: Update Consumers (Organizations Only)

### Strategy
Instead of updating all consumers at once, we will:
1. Update only the organizations tab to use the refactored EntityListTable
2. Keep customers tab using the original EntityListTable
3. This allows us to test the refactored component in production with a single entity
4. Once proven stable, we can migrate other entities incrementally

### Actions
1. Update `organizations-tab.svelte` to import from the new location
2. Verify organizations tab works correctly with refactored component
3. Keep customers tab unchanged (using original component)
4. Monitor for any issues in production
5. Plan incremental migration for other entities after stabilization

### Rollback Plan
If issues arise with organizations tab:
1. Revert organizations-tab.svelte to use original component
2. Fix issues in refactored component
3. Retry migration

### Future Migration Plan
After organizations tab is stable:
1. Migrate customers tab
2. Migrate other entity tabs one at a time
3. Eventually deprecate original EntityListTable component
