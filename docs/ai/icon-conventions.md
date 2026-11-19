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
3. **Clear/reset = `Eraser`**, close/remove = `X`, **restore-from-deleted =
   `trash-arrow-up`** (authored glyph — `CUSTOM_ICONS` in `@primebrick/ui`,
   consumed via `DynamicIcon name="trash-arrow-up"` on every restore surface),
   **local revert/undo = `RotateCcw`**, refresh = `RefreshCw`. Do not cross
   these semantics.
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
11. **UUID surfaces = `file-key`** — `format:"uuid"` fields and the
   record-sheet uid badge carry the `file-key` glyph (amber accent where a
   color is declared). `fingerprint`/`fingerprint-pattern` belong to the
   passkey/WebAuthn domain only and are banned on entity-uuid surfaces.
12. **Record surfaces use the SINGULAR icon variant** — a record sheet
   shows ONE row, so the authored list icon maps through the canonical
   pair table (`users`→`user`, `users-round`→`user-round` in
   `EntityRecordSheet.svelte` `RECORD_ICON_VARIANTS`). Icons without a
   declared pair render unchanged; extend the map when a new plural glyph
   is authored, never guess variants.
13. **Entity list icons are UNIQUE per entity family** — the record sheet
   resolves its header icon from the authored list/nav icon, so two
   entities sharing one glyph render indistinguishable ref sheets
   (`customers`+`users` both `users`→`user` was the first collision).
   When authoring a nav/route icon for an entity, pick a glyph no other
   entity uses — vary the family (`users` vs `users-round`) rather than
   the wrapper. Non-entity leaves (module root, pipelines, dashboards)
   may repeat glyphs freely: they never feed `RECORD_ICON_VARIANTS`.
14. **Violet = clone/duplicate** — `ActionColor` in `@primebrick/core` binds
   the `violet` semantic to cloning: `duplicate.bulk` serves
   `color:"violet"` + `icon:"copy"` by default (overridable via
   `actions_overrides`), and the same hue marks `CLONE` rows in the
   version-history trail. Never spend `violet` on unrelated actions and
   never recolor clone surfaces to another semantic.
15. **Feature disabled / missing → `Grid3x3Off` + `pb-watermark-disabled`** —
   the canonical watermark anatomy for a capability the entity's meta
   declares off (e.g. `read.audit` `enabled:false` on entities with no
   audit trail). Neutral muted glyph (`text-muted-foreground`), neutral
   pulse animation — never `CircleX` (transport failure), `Hourglass`
   (loading) or `TriangleAlert`/`Info` (empty data). First consumer:
   `VersionHistoryPanel`.
16. **One icon may carry two meanings — but EVERY reuse requires sign-off** —
   when the glyph wanted for a new semantic is already assigned (canonical
   map, `FILTER_OPERATOR_ICON`, fallbacks like the PropNavigator
   unknown-type `circle-question-mark`, CUSTOM_ICONS), the agent MUST
   surface the collision to the user and WAIT for instructions before
   coding — never silently reuse, never silently displace the existing
   meaning.

## Deep dive

The normative rules live here; the full mechanics and rationale are in `docs/dev-guide/icon-conventions.mdx` — link, do not duplicate.
