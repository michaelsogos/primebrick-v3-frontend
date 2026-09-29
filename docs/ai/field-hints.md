# Field Hints & Input Tooltips

The **only** canonical channel for non-error field help is the **label tooltip**.
Inline hint text under the control is deprecated — do not introduce new ones.

Validation errors are NOT hints: they are rendered by `TranslatedFormFieldErrors`
from the zod schema and are out of scope here.

## Why tooltips only

- Keeps forms compact and clean (no extra vertical space per field).
- One interaction pattern everywhere: hover/focus the label icon.
- The app is self-explanatory; help is discovery-on-demand for edge cases.

## Components by context

| Context | Component / prop |
|---|---|
| Formsnap/SuperForms field | `FormLabelWithPriorityHelp` inside `FormLabel` |
| `PrimeField` (non-superforms rows) | `help` prop (`FieldHelp` or raw `MetaColumn`) |
| `SwitchField` | `tooltip`, `tooltipTitle`, `tooltipPriority` |
| Table headers / card fields | `MetaColumn.tooltip*` / `show_form_tooltip` |

Shared type: `FieldHelp` in `src/lib/components/forms/field-help.ts`
(`{ text?, title?, priority?, labelKey? }`), re-exported from `ui/form`.

## Usage

### Standard hint (superforms)

```svelte
<FormLabel for={props.id}>
  {$t('system.settings.configurations.create.key')}
  <FormLabelWithPriorityHelp
    text={$t('system.settings.configurations.create.keyHelp')}
    priority="HINT"
  />
</FormLabel>
```

### PrimeField row

```svelte
<PrimeField
  label={$t('settings.fields.name')}
  help={{ text: $t('settings.fields.nameHelp'), priority: 'HINT' }}
  ...
/>
```

Metadata-driven (entity meta supplies the help):

```svelte
<PrimeField label={col.label} help={col} ... />
<!-- reads col.tooltip / tooltip_title / tooltip_priority / show_form_tooltip -->
```

### SwitchField

```svelte
<SwitchField
  label={$t('create.reserved')}
  tooltip={$t('create.reservedHelp')}
  tooltipPriority="INFORMATION"
/>
```

### Optional marker

An optional field is marked with icon + italic `(optional)` + tooltip. The
shared copy lives in `app.common.optional*`; the marker MUST keep this exact
look — only the text keys vary.

```svelte
<FormLabelWithPriorityHelp
  text={$t('system.settings.configurations.create.labelKeyHelp')}
  title={$t('app.common.optionalTooltipTitle')}
  labelKey="app.common.optional"
  priority="INFORMATION"
/>
```

Pure marker without tooltip body: omit `text` (icon + qualifier only).

## Priority semantics

| Priority | Trigger icon | Use for |
|---|---|---|
| `INFORMATION` (default) | `HelpCircle` | Neutral explainers, optional markers |
| `HINT` | `HelpCircle` | Format guidance, suggestions (lightbulb inside) |
| `QUESTION` | `HelpCircle` | "What is this?" style answers |
| `SUCCESS` | `HelpCircle` | Positive confirmations |
| `WARNING` | `TriangleAlert` (amber) | Irreversible/impactful consequences |
| `ERROR` | `OctagonX` (red) | Dangerous/blocking behaviour |

Every text-bearing tooltip always renders a priority-colored title via
`PriorityTooltipContent`. If `title` is omitted it defaults to
`app.common.tooltipTitle.<priority>` (Info/Hint/Warning/…). Bare icon-only
tooltips without a title are forbidden.

## Copy rules

Write for non-technical users:

- No jargon: avoid "key/value pair", "placeholder", "widget", "i18n", "raw JSON".
- Prefer concrete wording: "a unique code that identifies this configuration — no two
  configurations can share the same code", "the value the system will use".
- Terminology: the singular item is always a **configuration** — never "entry",
  "voce", or "setting" (which collides with the Settings section).
- Suggested/default content is "suggested", never "auto-generated" or "in
  placeholder".
- All text goes through `$t()` keys — never hardcoded strings.
- Keep bodies to 1–2 short sentences.

## Forbidden

- `&lt;p class="text-xs text-muted-foreground"&gt;` under controls — deprecated.
- `PrimeField` `hint` prop — `@deprecated`, kept only for backward compat.
- `SwitchField` `description` prop — `@deprecated`, use `tooltip*`.
- Hand-rolled `Tooltip` in form labels — use `FormLabelWithPriorityHelp`.
- Hardcoded tooltip text — always `$t()`.
