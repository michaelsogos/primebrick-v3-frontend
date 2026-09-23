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
| Bounded numeric range | `Slider` (`$lib/components/ui/slider`) — pair with `Input` for nullable "inherit" |
| Boolean toggle | `Switch` (`$lib/components/ui/switch`) |
| Checkbox | `Checkbox` (`$lib/components/ui/checkbox`) |
| Password | `PasswordInput` / password component |
| OTP | OTP input component (see `otp-input` rule) |
| Phone / numeric / url with AI | `phone-input`, `numeric-input`, `url-input`, Smart* components |

Docs for each component live in `docs/user-guide/components/*.mdx` — read the
relevant page before using a component you haven't used in this session.

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
