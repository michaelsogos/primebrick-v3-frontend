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
8. **Inner icon-only controls: glyph MUST be 16px** (`size-4`). Applies to
   every standalone icon-only control inside an input (clear `Eraser`,
   `Eye`/`EyeOff`, `Copy`, `Check`/status icons, X-remove). Enforced by
   `[&>svg]:size-4` in `inputTrailingIconColorClasses` —
   `src/lib/components/ui/input/input-chrome.ts`. Do NOT add size classes on
   the icon; the chrome owns the glyph size. Excluded: decorative glyphs
   inside trigger content (e.g. `size-3` carets in prefix selector CTAs)
   and leading icons.
