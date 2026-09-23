# Global Sheet Manager — agent reference

The right-hand side sheet is a **single global host**, not per-route UI.
Never mount `Sheet.Root` inside a page or component — there is exactly one
`Sheet.Root`/`Sheet.Content` in the app, owned by `SheetHost` and driven by
`sheet-manager.svelte.ts`.

## Files

| File | Role |
|------|------|
| `src/lib/shell/sheets/sheet-manager.svelte.ts` | `sheetState`, `openSheet`, `replaceSheet`, `closeSheet`, `SheetPanelId`, `SheetPanelPropsMap` |
| `src/lib/shell/sheets/SheetHost.svelte` | The only `Sheet.Root`. Panel registry `SheetPanelId → Svelte component`. Mounted once in `AppShell`. |
| `src/lib/shell/sheets/SheetHeader.svelte` | HEAD chrome: `title` + `actions` snippets, `border-b`, `bg-sidebar-accent`, `px-2 py-2` |
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
│       border-t                   │  never scrolls
└──────────────────────────────────┘
```

Rules:

- Root is always `flex h-full flex-col` (inside `SheetPanelLayout` — never
  re-declare it in the panel).
- Only CONTENT scrolls (`min-h-0 flex-1 overflow-auto`). HEAD/TOOLBAR/FOOT
  are `shrink-0` and always visible.
- HEAD actions default to the standard close ✕ (`Sheet.Close` → `closeSheet()`).
  Pass `actions` only to add MORE buttons — always keep a close affordance.
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
  Close itself uses `Sheet.Close` (same classes); other CTAs use a plain
  `<button type="button">` with the same class string. No `Button`
  component, no tinted-primary pill, no `size-7` — perfect symmetry,
  one visual language for the whole header.
- Padding: CONTENT default `p-2`; override via `contentClass` (e.g.
  `px-4 py-3`). HEAD uses SheetHeader's `px-2 py-2`. TOOLBAR `px-3 py-2`.
  FOOT content supplies its own padding (`p-3` for inputs, `px-4 py-2` for bars).
- **TOOLBAR is for tools only** — CTAs, search inputs, tab bars. Metadata
  (scores, timestamps, subtitles) belongs in CONTENT, never in TOOLBAR.
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
  {#snippet title()}
    <span>{$t('some.title.key')}</span>
  {/snippet}

  <!-- CONTENT -->
  <p>{someProp}</p>

  {#snippet footer()}
    <div class="flex justify-end gap-2 p-3">
      <button onclick={() => on_pick?.('x')}>{$t('app.common.apply')}</button>
    </div>
  {/snippet}
</SheetPanelLayout>
```

Optional snippets: `actions` (extra HEAD buttons), `toolbar` (below-HEAD
strip), `footer` (bottom strip). Omit what you don't need.

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
