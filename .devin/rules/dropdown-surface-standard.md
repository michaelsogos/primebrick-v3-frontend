# Devin Rule: Dropdown Surface Shadow Standard

## Trigger
- Applies whenever AI agent creates, modifies, or reviews floating
  dropdown-style surfaces: `DropdownMenu.Content`, `DropdownMenu.SubContent`,
  `Popover.Content`, or any new floating menu/list overlay.

## Golden Rule
**All dropdown surfaces get `shadow-primary-gradient` via the shared
components — never via per-instance classes.** The utility lives in
`src/app.css` and is baked into the vendored shadcn primitives:

| Component | File | Notes |
|---|---|---|
| `DropdownMenu.Content` | `ui/dropdown-menu/dropdown-menu-content.svelte` | base class |
| `DropdownMenu.SubContent` | `ui/dropdown-menu/dropdown-menu-sub-content.svelte` | base class |
| `Popover.Content` | `ui/popover/popover-content.svelte` | base class — covers `combo-select` and anything built on `Popover` |

`shadow-primary-gradient` renders two directional glows that simulate the
PB logo gradient (CSS `box-shadow` cannot be a real gradient):
sky-400 `#38bdf8` offset top-left, indigo-400 `#818cf8` offset bottom-right
— the same oblique direction as the `border-*-gradient` family.

## Allowed without asking
- Nothing extra — the shared components already carry the class.

## Requires explicit user instruction
- Re-adding `shadow-md`/`shadow-lg`/`shadow-none` or any `shadow-*` class on
  a dropdown surface instance — overrides/doubles the standard.
- Applying `shadow-primary-gradient` to non-dropdown surfaces (cards,
  dialogs, sheets, inline panels) — it is scoped to floating menu surfaces.

## Explicitly NOT dropdowns (do not apply)
- **Tooltips** — `bg-foreground` inverted info surface, not an interactive menu.
- **Dialogs / Sheets** — modal surfaces, not anchored dropdowns.
- **Command palette** — dialog-hosted, not a dropdown.

## Notes
- A new floating surface primitive (menubar, context-menu, hover-card …)
  gets the class in its **shared content component**, matching the table
  above — not at call sites.
- When the UI layer is later extracted to `@primebrick/ui` (see
  ai-plans/table-pages-merge.md task 22), the utility and these component
  defaults move with it — the standard stays identical.
