# Global Sheet Manager — agent reference

The right-hand side sheet is a **single global host**, not per-route UI.
Never mount `Sheet.Root` inside a page or component — there is exactly one
`Sheet.Root`/`Sheet.Content` in the app, owned by `SheetHost` and driven by
`sheet-manager.svelte.ts`.

**This is enforced by ESLint**: importing `$lib/components/ui/sheet` outside
the sheets infrastructure (`components/ui/sheet`, `components/ui/sidebar`,
`shell/sheets`, `entity-list/sheets`) fails lint with
`no-restricted-imports`. If you need a sheet, register a panel id +
typed props in `SheetPanelPropsMap`, add the component to the `SheetHost`
registry, and open it with `openSheet()`.

## Files

| File | Role |
|------|------|
| `src/lib/shell/sheets/sheet-manager.svelte.ts` | `sheetState`, `openSheet`, `replaceSheet`, `closeSheet`, `SheetPanelId`, `SheetPanelPropsMap` |
| `src/lib/shell/sheets/SheetHost.svelte` | The only `Sheet.Root`. Panel registry `SheetPanelId → Svelte component`. Mounted once in `AppShell`. |
| `src/lib/shell/sheets/SheetHeader.svelte` | HEAD chrome: `title` + `actions` snippets, `border-b`, `bg-sidebar-accent`, `px-2 py-2` |
| `src/lib/shell/sheets/SheetHeaderAction.svelte` | The ONE CTA chrome for HEAD buttons (32px icon button). Use in the `actions` snippet. |
| `src/lib/shell/sheets/SheetPanelLayout.svelte` | **Canonical panel anatomy** — HEAD / TOOLBAR / CONTENT / FOOT. Every panel MUST use it. |
| `src/lib/shell/sheets/panels/*.svelte` | Shell panels (errors, versions, aiChat, aiModelTestReport, selects) |
| `src/lib/entity-list/sheets/panels/*.svelte` | Entity-list panels (searchIn, columns, filters, versionHistory) |

## API

```ts
import { openSheet, replaceSheet, closeSheet } from '$lib/shell/sheets/sheet-manager.svelte';

openSheet('shell.aiModelTestReport', { model }, {
  side: 'right',                      // 'right' (default) | 'left'
  contentClass: 'w-3/4 sm:max-w-xl p-0', // Sheet.Content classes (width!)
  modal: true,                        // overlay on/off (default true)
  keepMountedState: false,            // keep panelId/props after close (rare)
});

replaceSheet('other.panelId', props, opts); // switch panel without closing
closeSheet();                                // programmatic close
```

`openSheet` props are **typed per panel** via `SheetPanelPropsMap` — a wrong
prop shape is a compile error.

## Panel anatomy (MANDATORY — `SheetPanelLayout`)

```
┌──────────────────────────────────┐
│ HEAD  <SheetHeader>              │  title (left) + actions (right)
│       border-b bg-sidebar-accent │  default action = close ✕
├──────────────────────────────────┤
│ TOOLBAR (optional)               │  search, tabs bar, filter chips
│       border-b px-3 py-2         │
├──────────────────────────────────┤
│ CONTENT                          │  min-h-0 flex-1 overflow-auto
│   {@render children()}           │  THE ONLY SCROLLABLE REGION
├──────────────────────────────────┤
│ FOOT (optional)                  │  action buttons / input box
│       border-t bg-muted/50       │  never scrolls — muted strip owned by layout
└──────────────────────────────────┘
```

Rules:

- Root is always `flex h-full flex-col` (inside `SheetPanelLayout` — never
  re-declare it in the panel).
- Only CONTENT scrolls (`min-h-0 flex-1 overflow-auto`). HEAD/TOOLBAR/FOOT
  are `shrink-0` and always visible.
- HEAD ALWAYS ends with the standard close ✕ — `SheetPanelLayout` appends
  it automatically (`Sheet.Close` context close, or `onClose` when the
  panel opts into a custom close). The `actions` snippet is EXTRA buttons
  only, rendered before it — a panel NEVER re-declares `Sheet.Close`
  itself (that would double the chrome).
- **HEAD icon is mandatory**: `icon` snippet before the title, and it MUST
  match the icon of the CTA that opens the sheet (e.g. `shell.errors` opens
  from `TriangleAlert` in `AppTopbar` → panel icon = `TriangleAlert`).
  AI-assistant sheets are the exception pattern: `AiIcon` +
  `assistant_prefix` + topic qualifier (`global` / `guide` / `regex` / `json`).
- **HEAD CTA style — ONE pattern for every button in the header** (close,
  reset, apply, new-session, …): the exact same chrome as the standard
  close — `inline-flex size-8 items-center justify-center rounded-md
  text-muted-foreground opacity-70 transition-opacity hover:bg-accent
  hover:text-accent-foreground hover:opacity-100`, icon `size-4`.
  The close ✕ itself is layout-owned; panel CTAs use `SheetHeaderAction`
  (which carries exactly this chrome). No `Button` component, no
  tinted-primary pill, no `size-7` — perfect symmetry, one visual
  language for the whole header.
- **HEAD never hosts the primary action** — icon-only buttons have no
  label, so a primary CTA there is invisible. HEAD = close ✕ + secondary
  icon utilities only (reset, clear, new).
- **FOOT owns the primary CTA of FORM panels** — the strip itself
  (`border-t bg-muted/50`) is layout-owned; the INNER anatomy is
  `SheetPanelFooter` (`p-3`, right-aligned `ml-auto` button group,
  natural-width CTAs — never `w-full`). Never add a Cancel button
  (the close ✕ and outside-click dismissal already cover "abort").
  Input-box feet (chat composer) are the exception — they supply their
  own padded container and do NOT use `SheetPanelFooter`.
- **CTA placement by zone**: HEAD → secondary icon utilities + ✕ ·
  TOOLBAR → tools only (search, tabs, mode/connector groups, sort) ·
  CONTENT → per-row actions and inline sub-form CTAs · FOOT → primary
  labeled commit button. A tool rendered in CONTENT lands under the
  toolbar's `border-b` and reads as a second header band — keep it in
  the toolbar snippet.
- **Three panel archetypes**:
  - **PICKER** — immediate commit: click a row/toggle → commit → close.
    No footer (CurrencySelect, PhonePrefixSelect, ProtocolSelect, Columns).
  - **FORM** — draft + explicit commit on the footer CTA (BadgeValue,
    Filters/Apply, AiCerebellum/Save, AiModelImport/Add). **Never
    live-commit from `$effect`** — a previous BadgeValuePanel loop hit
    `effect_update_depth_exceeded`.
  - **VIEWER** — read-only + per-row actions, no commit footer
    (Errors, Versions, VersionHistory, AiModelCache).
- **Commit & close semantics (codified decisions)**:
  - FORM panels either `closeSheet()` on commit OR stay open — the
    choice is per-panel and documented, never accidental. The DECIDED
    default for list-criteria panels (Filters) is **stay open**: the
    sheet is `modal` and non-fullscreen, so the user watches the table
    update behind it and keeps tuning. Commit-close remains for panels
    whose apply ends the task (BadgeValue).
  - A HEAD **reset/clear** utility (Eraser/RotateCcw icon) is a LIVE
    commit, exempt from the draft→Apply boundary by design: reset means
    "clear applied AND draft at once" (FiltersPanel's `resetAllFilters`
    clears its draft maps AND calls `onResetFilters`, which empties the
    parent's applied `filterValues`/`advancedFilters`). Draft-only reset
    would leave the table filtered while the panel looks empty.
  - `keepMountedState` (openSheet option, default `false`): `false`
    unmounts the panel on close → next open remounts fresh state;
    `true` keeps `panelId`/`props` alive across close → the same mounted
    instance reopens with its state intact. Use `true` only when the
    draft must survive an accidental close.
- Padding: CONTENT default `p-2`; override via `contentClass` (e.g.
  `px-4 py-3`). HEAD uses SheetHeader's `px-2 py-2`. TOOLBAR `px-3 py-2`.
  FOOT: `SheetPanelFooter` owns `p-3` — input-box exceptions supply their
  own (`p-3`).
- **TOOLBAR is for tools only** — CTAs, search inputs, tab bars. Metadata
  (scores, timestamps, subtitles) belongs in CONTENT, never in TOOLBAR.
- **Floating UI inside panels**: `Popover.Content` self-portals to `body`
  by default (the shared `ui/popover` wrapper). Never bypass it —
  non-portaled content inside the CONTENT scroll region extends the
  scrollable area and visibly shifts the anchor's layout when it opens.
  Escape hatch exists (`portal={false}`) only for deliberate in-flow use.
- **In-content sections are NOT standardized** — section titles, dividers,
  accordions, tabs are the panel's own domain. `SheetSectionTitle` exists
  as a convenience (`px-3 py-1.5 text-xs font-semibold uppercase
  tracking-wide text-muted-foreground`) but is not mandatory.
- **Sheet width is uniform — 384px for every panel**, enforced by the
  `right`/`left` variant (`w-3/4 sm:max-w-sm`). Do NOT pass width classes
  (`w-[...]`) in `contentClass` — `sm:max-w-sm` caps them anyway, so a
  `w-[600px]` silently renders 384px. If a future need requires a wider
  sheet, implement it centrally (e.g. a width variant on `Sheet.Content`),
  never via per-call `contentClass` hacks.

## Panel skeleton (copy-paste)

```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  import SheetPanelLayout from '$lib/shell/sheets/SheetPanelLayout.svelte';

  let { someProp, on_pick }: {
    someProp: string;
    on_pick?: (v: string) => void;
  } = $props();
</script>

<SheetPanelLayout contentClass="px-4 py-3">
  {#snippet icon()}
    <Search class="size-4" />
  {/snippet}
  {#snippet title()}
    <span>{$t('some.title.key')}</span>
  {/snippet}

  <!-- CONTENT -->
  <p>{someProp}</p>

  {#snippet footer()}
    <SheetPanelFooter>
      <Button onclick={() => on_pick?.('x')}>{$t('app.common.apply')}</Button>
    </SheetPanelFooter>
  {/snippet}
</SheetPanelLayout>
```

`icon` is MANDATORY (see rules above). Optional snippets: `actions` (extra
HEAD buttons), `toolbar` (below-HEAD strip), `footer` (bottom strip). Omit
what you don't need.

### Extra HEAD CTAs (actions snippet)

When a panel needs header CTAs beyond the close ✕ (reset, apply, …), pass
the `actions` snippet with `SheetHeaderAction` for each CTA. The layout
ALWAYS appends the standard close after them — never re-declare it:

```svelte
<script lang="ts">
  import SheetHeaderAction from '$lib/shell/sheets/SheetHeaderAction.svelte';
</script>

<SheetPanelLayout>
  {#snippet icon()}<Search class="size-4" />{/snippet}
  {#snippet title()}{$t('some.title.key')}{/snippet}

  {#snippet actions()}
    <SheetHeaderAction title={$t('app.common.reset')} onclick={reset}>
      <RotateCcw class="size-4" />
    </SheetHeaderAction>
    <!-- close ✕ appended by SheetPanelLayout — do NOT add Sheet.Close -->
  {/snippet}

  <!-- CONTENT -->
</SheetPanelLayout>
```

`SheetHeaderAction` already carries the canonical chrome — never use
`Button` in sheet HEADs.

## Adding a new panel — checklist

1. **Id**: extend `SheetPanelId` in `sheet-manager.svelte.ts`
   (`'shell.<name>'` for shell panels, `'entity.<name>'` for entity-list,
   `'config.<name>'` for config-driven).
2. **Props**: extend `SheetPanelPropsMap` — typed props, snake_case fields
   (data-model convention). Use `Record<string, never>` when there are none.
3. **Component**: create the panel under `src/lib/shell/sheets/panels/` (or
   `src/lib/entity-list/sheets/panels/` for entity-list concerns) using
   `SheetPanelLayout` for anatomy.
4. **Registry**: import + add the component to `registry` in `SheetHost.svelte`.
5. **Open**: call `openSheet('<id>', props, { contentClass })` from a **click
   handler or other discrete event**.

## Hard rules (violations = rework)

- ❌ **NEVER** mount `Sheet.Root` / `Sheet.Content` outside `SheetHost.svelte`.
  One host, one sheet.
- ❌ **NEVER** call `openSheet` from an `$effect` whose deps include a bindable
  "is sheet open" flag — closing leaves the flag true for a tick and the effect
  re-opens the sheet → infinite loop. Open from click handlers only. One-way
  sync effects are allowed ONLY for "parent flag false → `closeSheet()`" and
  "sheet dismissed → clear flag".
- ❌ **NEVER** invent a panel layout — no ad-hoc `flex h-full flex-col`,
  no custom header bars, no own close buttons. `SheetPanelLayout` owns anatomy.
- ❌ **NEVER** put scrollable regions outside CONTENT (`overflow` belongs only
  to the CONTENT div) or HEAD/FOOT will scroll away.
- ✅ Panels receive `{...panelProps} modal={sheetState.modal}` — declare props
  via `$props()` matching `SheetPanelPropsMap`.
- ✅ Keep `data-testid` on interactive elements (E2E convention).
- ✅ Dialog-vs-sheet: dialogs (`Dialog`, `DialogBordered`) are for modal
  confirmations/forms; the global sheet is for navigation-adjacent panels
  (lists, details, chats, pickers).

## Close suppression quirk

bits-ui `Dialog` can emit `onOpenChange(false)` right after a programmatic
`open=true`. `openSheet` sets `suppressDialogCloseFromHost` for two frames so
`SheetHost` ignores that spurious close — do not remove the guard.
