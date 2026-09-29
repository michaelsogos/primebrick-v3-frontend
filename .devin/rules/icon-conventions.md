# Devin Rule: Icon Conventions

## Trigger
- Applies whenever adding or changing a Lucide icon in any `.svelte`/`.ts` file.

## Actions
1. **Check the canonical map first** — `docs/ai/icon-conventions.md` defines
   one icon per semantic action. Never pick a different icon for an action
   already listed there.
2. **Refresh CTAs are MANDATORY `<RefreshButton>`** — never hand-roll a
   refresh button (`Toolbar.refresh` prop for toolbars, `compact` variant
   inside cards).
3. **Clear/reset = `Eraser`**, close/remove = `X`, restore = `RotateCcw`,
   refresh = `RefreshCw`. Do not cross these semantics.
4. **Booleans**: `CircleCheck` / `CircleX` — never `CheckCircle`/`XCircle`.
   **Warnings**: `TriangleAlert` — never the legacy `AlertTriangle` alias.
5. Prefer single-icon imports (`@lucide/svelte/icons/<name>`).
6. Verify icon names empirically (lucide.dev) before importing.
7. **Input trailing CTAs**: see `docs/ai/input-anatomy.md` — clear =
   `Eraser` rightmost at `right-1.5` (glyph 12px from border), extra icons
   self-position left (`right-10` slot 2). Never invent positions.
