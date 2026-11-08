# Devin Rule: Icon Conventions

> Canonical body of `.devin/rules/icon-conventions.md` — the rule file is a pointer to this page.

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
5. Icons import ONLY from `@primebrick/ui/vendor/lucide` (named imports) —
   raw `@lucide/svelte` and `@lucide/svelte/icons/<name>` are rejected by
   eslint (vendor-plane contract).
6. Verify icon names empirically (lucide.dev) before importing.
7. **Input trailing CTAs**: see `docs/ai/input-anatomy.md` — clear =
   `Eraser` rightmost at `right-1.5` (glyph 12px from border), extra icons
   self-position left (`right-10` slot 2). Never invent positions.
8. **Page-icon defaults are emission-materialized, never render-fallbacks** —
   a nav leaf or route without an authored `icon` gets its kind default at
   `/modules` emission: `dict`→`list`, `list`→`table-2`,
   `create`/`detail`→`text-cursor-input`, anything else→`file-box` (the
   maximum fallback). An authored `icon` always wins — defaults fill nulls,
   never override. Consumers read `link.icon`/`decl.icon` plainly;
   `circle`/`circle-small` are banned on leaf pages.
9. **Field-mapped icons: absent data → absent element — NEVER a default
   icon.** When an icon's value comes from a mapped field (`row.icon`,
   `link.icon`, `decl.icon`, a `tooltip`/`description` column), render it
   iff the field carries a value: `{#if icon}<DynamicIcon name={icon}/>{/if}`.
   A `?? 'tag'`/`?? 'file-box'`/`|| 'layout-grid'` literal is an invented
   fallback — the element must disappear, not fake an icon. Same rule for
   the tooltip-ⓘ: it renders iff mapped tooltip/desc content exists.
   Field→field resolution chains (`decl?.icon ?? leaf?.icon`) and `?? null`/
   `?? ''` type coercions are NOT fallbacks — only quoted literal tails.
   Linted by `icon-no-fallback` (check-standards).
10. **Inner icon-only controls: glyph MUST be 16px** (`size-4`). Applies to
   every standalone icon-only control inside an input (clear `Eraser`,
   `Eye`/`EyeOff`, `Copy`, `Check`/status icons, X-remove). Enforced by
   `[&>svg]:size-4` in `inputTrailingIconColorClasses` —
   `src/lib/components/ui/input/input-chrome.ts`. Do NOT add size classes on
   the icon; the chrome owns the glyph size. Excluded: decorative glyphs
   inside trigger content (e.g. `size-3` carets in prefix selector CTAs)
   and leading icons.

## Deep dive

The normative rules live here; the full mechanics and rationale are in `docs/dev-guide/icon-conventions.mdx` — link, do not duplicate.
