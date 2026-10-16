# Icon conventions (canonical Lucide map)

One icon per semantic action. Never improvise a new icon for an action that
already has a canonical one — check this table first.

## Canonical action icons

| Semantics | Icon | Component/import | Notes |
|-----------|------|------------------|-------|
| **Refresh / reload data** | `RefreshCw` | `<RefreshButton>` (`$lib/components/ui/refresh-button`) | MANDATORY — never hand-roll a refresh CTA. `compact` prop for in-card use. |
| **Clear / reset value or filters** | `Eraser` | `eraser` | Clearing an input, resetting a form/panel. NOT for close/remove. |
| **Close / dismiss / remove item** | `X` | `x` | Sheet close, chip remove, dismiss. Do NOT use for "clear value". |
| **Restore (undo delete)** | `RotateCcw` | `rotate-ccw` | Restore a soft-deleted row — NOT a refresh icon. |
| **Delete** | `Trash2` | `trash-2` | |
| **Edit** | `Pencil` | `pencil` | |
| **Add / create** | `Plus` | `plus` | |
| **Search** | `Search` | `search` | |
| **Filters** | `Funnel` | `funnel` | |
| **Show / hide secret** | `Eye` / `EyeOff` | `eye`, `eye-off` | Password visibility toggle — inner icon left of the clear CTA. |
| **Copy to clipboard** | `Copy` | `copy` | |
| **Boolean true / false** | `CircleCheck` / `CircleX` | `circle-check`, `circle-x` | NEVER `CheckCircle` / `XCircle`. |
| **Warning / empty state** | `TriangleAlert` | `triangle-alert` | Do NOT import the legacy alias `AlertTriangle`. |
| **Loading watermark** | `Hourglass` | `hourglass` | `pb-watermark-loading` empty-state pattern. |
| **In-flight spinner** | `LoaderCircle` | `loader-circle` | With `animate-spin`, inside busy controls. |
| **Disclosure / dropdown caret** | `ChevronDown` | `chevron-down` | |
| **AI enabled / assistant** | `BrainCircuit` | `brain-circuit` | AI capability indicators. |

## Rules

- **Refresh is a component, not an icon.** Any refresh/reload CTA MUST use
  `<RefreshButton>` — toolbar (`Toolbar.refresh` prop) and in-card
  (`compact` variant) alike.
- `Eraser` = mutate/clear data in place; `X` = close/remove; `RotateCcw` =
  restore deleted. Don't cross these semantics.
- Import single icons (`@lucide/svelte/icons/<name>`). Named barrel imports
  (`import { X } from '@lucide/svelte'`) are still present in a few files —
  prefer single-icon imports in new code.
- Flagged debt: `AlertTriangle` legacy alias still imported in
  `ModelCachePanel`, `ModelCacheSection`, `MfaEnrollmentSection`,
  `async-validated-input`, `rfc-error-dialog`, `VersionHistoryPanel` —
  migrate to `TriangleAlert` when touching those files.
