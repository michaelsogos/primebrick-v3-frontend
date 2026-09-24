# Devin Rule: Mandatory UI Input Components

## Trigger
- Applies whenever AI agent renders any user-facing input, selector, or picker —
  in forms, toolbars, sheets, dialogs, filters.

## Golden Rule
**Only Primebrick UI components are allowed for value inputs.** Same policy as
buttons (`button-variant-standard.md`): the component set is closed — no free
creativity, no re-styled primitives, no ad-hoc markup for inputs.

## Component mapping (closed set)

| Need | Component |
|---|---|
| Select / combobox (single or multi, searchable, objects, translated labels, create) | `ComboSelect` (`$lib/components/ui/combo-select`) |
| Text / number / generic input | `Input` (`$lib/components/ui/input`) |
| Bounded numeric range (always set) | `Slider` (`$lib/components/ui/slider`) |
| Bounded numeric range, nullable "inherit" (NULL = inherit a default) | `SliderField` (`$lib/components/ui/slider-field`) — slider + reactive label, NO numeric input |
| Boolean toggle | `Switch` (`$lib/components/ui/switch`) — bare control only inside composite widgets |
| Boolean field with label (THE standard) | `SwitchField` (`$lib/components/ui/switch-field`) — switch + label + optional `description` sublabel + optional `tooltip`/`tooltipTitle`/`tooltipPriority`/`tooltipLabelKey` (FormLabelWithPriorityHelp) |
| Checkbox | `Checkbox` (`$lib/components/ui/checkbox`) |
| Password | `PasswordInput` / password component |
| OTP | OTP input component (see `otp-input` rule) |
| Phone / numeric / url with AI | `phone-input`, `numeric-input`, `url-input`, Smart* components |

Docs for each component live in `docs/user-guide/components/*.mdx` — read the
relevant page before using a component you haven't used in this session.

## ComboSelect display modes (typed, closed set)

`ComboSelect` renders options through the typed `display` prop — like
`Button` variants/tones, the set is closed:

| `display` | Renders |
|---|---|
| `'default'` (default) | plain label |
| `'detailed'` | two-line row: label + secondary value (mono, muted). Secondary comes from `secondaryField`, defaults to the resolved value |
| `'badge'` | option rendered as a colored `Badge`; color token read from `colorField` (default `'color'`) |
| `'custom'` | **REQUIRED** to enable `itemSnippet`/`selectedSnippet` |

Contract: `itemSnippet`/`selectedSnippet` are IGNORED unless
`display="custom"` — in dev the component logs a console warning. Do NOT
introduce new one-off snippets when a built-in display covers the layout.

## Domain option renderers (closed set)

| Option kind | Renderer |
|---|---|
| `ai_model` rows (icon + name + rank) | `AiModelOption` (`$lib/components/ui/smart-ai/ai-model-option.svelte`) — use inside ComboSelect `itemSnippet`/`selectedSnippet` or any model list row |

Do NOT hand-roll model option markup (icon left, score right): `AiModelOption`
composes the shared `ModelIcon` + `RankMeter` standard already used by
`ai-model-selector`.

## Forbidden without explicit user instruction

- **Raw `DropdownMenu`/`Select`/`Command`/`Popover` primitives to pick a VALUE.**
  `ComboSelect` already wraps Popover+Command with our input chrome, clear
  button, search, i18n labels and testids. Hand-rolling a dropdown selector
  produces divergent styling and behavior.
- **Custom trigger chrome for selectors** (hand-made `<button>` + chevron +
  menu). The selector MUST look like an input — that is `ComboSelect`.
- **Native `<select>`, `<input>` unstyled or re-styled ad hoc.**

`DropdownMenu` remains legitimate ONLY for **action menus** (lists of commands,
not value selection) — e.g. overflow "..." menus. If the menu picks a value that
changes state/data shown, it is a selector → `ComboSelect`.

## Requires explicit user instruction

- Any new input component or new visual variant of an existing one.
- Raw primitives for a custom picker ComboSelect cannot express
  (`itemSnippet`, `selectedSnippet`, `isOptionDisabled`, `allowCreate` cover
  most cases — check them first).

## Notes
- Toolbar value selectors (e.g. the cerebellum assistant selector on /ai) use
  `ComboSelect` like any other input — toolbars are not an exception.
- Create/CTA actions live OUTSIDE selectors as their own `Button` — never as a
  pseudo-item inside a value dropdown.
- **Tooltips INSIDE Popover/overlay content**: never use bits-ui
  `Tooltip.Root` — its DismissibleLayer swallows the first pointerdown and
  prevents the enclosing popover from closing on outside click. Use an inert
  CSS-only tooltip (`group`/`group-hover`, `pointer-events-none`) styled with
  the standard tooltip classes (`bg-foreground text-background`, `rounded-md
  border border-border/60`, `px-2 py-1 text-xs font-medium shadow-md`), or a
  native `title`. If the tooltip overflows the popover, add
  `overflow-visible` on that `Popover.Content` instance (base class has
  `overflow-hidden`).
- **Nullable numeric params** (NULL = inherit a parent/default): use
  `SliderField`, never `Slider` + `Input`. Wide/non-linear ranges (e.g.
  `max_tokens` 128–32768) use `SliderField` with the `steps` ladder —
  numeric `Input` stays only for unbounded/free-text values.
- **Grouped content boxes** (a labelled section inside a card/sheet): always
  `SelectableFieldset` (`$lib/components/ui/selectable-fieldset`) — gradient
  uppercase label over `border-primary-gradient` container. NEVER hand-roll
  `border` + `<span>` label boxes.
- **Labelled boolean switches**: always `SwitchField`. Canonical order is
  switch FIRST, label immediately after (`flex items-center gap-3`), optional
  muted `text-xs` description under the row. NEVER the label-left/switch-right
  (`justify-between`) layout. Bare `Switch` is allowed ONLY inside composite
  widgets that own their labelling (ConfigValueInput, toolbar toggles like
  AND/OR connector, thumbIcons toggles) — never in a form field.
  Label weight/size is controlled ONLY via the `size` prop: `default`
  (`text-sm font-medium`, the form-page pattern) or `sm` (`text-xs font-medium
  text-muted-foreground`, for dense sheets like `AiCerebellumPanel`). NEVER
  override label weight/size with ad-hoc classes. The same `size` contract
  applies to `SliderField`, which owns its `label` internally — never wrap it
  in an external `<label>` or `space-y-*` div.
