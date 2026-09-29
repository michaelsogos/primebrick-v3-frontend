# Devin Rule: Form Field Anatomy Standard

## Trigger
- Applies whenever an AI agent renders a labeled input/field row in routes,
  dialogs, or sheet panels.

## Golden Rule

**Never hand-roll `<label>` + control markup.** Every labeled field uses one
of the two sanctioned anatomies:

| Context | Anatomy |
|---|---|
| Inside a `sveltekit-superforms` form | `ui/form` — `FormField` + `FormControl` + `FormLabel` + `TranslatedFormFieldErrors` (label↔control wired automatically via control props) |
| Anywhere else (config rows, dynamic meta rows, sheet quick-forms, settings widgets) | `PrimeField` (`$lib/components/ui/form`) — label + optional tooltip/hint/error + `control` snippet that receives `id` |
| Read-only captions (badges, values) | plain `<span>`/`<p>` — **never** `<label>` |

## PrimeField usage

```svelte
<PrimeField id="cfg-{entry.key}"
  label={entry.label_key ? $t(entry.label_key) : entry.key}
  help={entry.description_key
    ? { text: $t(entry.description_key), priority: 'INFORMATION' }
    : undefined}
  error={errors[entry.key]}
  required
>
  {#snippet control({ id })}
    <Input {id} bind:value={v} />
  {/snippet}
</PrimeField>
```

- `id` defaults to a stable `$props.id()` — pass it only for deterministic
  ids (`data-testid` pairing, E2E).
- `layout="inline"` for boolean controls (Switch/Checkbox/choicebox):
  control first, label beside it — same anatomy as `switch-field`.
- `help` accepts `{ text, priority?, title?, labelKey? }` (pre-translated,
  shared `FieldHelp` type from `FormLabelWithPriorityHelp`)
  **or** raw `MetaColumn` (`tooltip`, `tooltip_priority`, `tooltip_title`,
  `show_form_tooltip` — gate + `$t` handled internally). Do NOT copy the
  `{#if meta.tooltip && meta.show_form_tooltip !== false}` block — pass
  the meta object.
- `hint` (inline muted line under the control) is **deprecated** — hints
  live in the label tooltip, not inline. Use `help`.

## Hints — the single channel (MANDATORY)

- **All non-error field help lives in the label tooltip** via
  `FormLabelWithPriorityHelp` (inside `FormLabel`/`Label`) or `PrimeField
  help`/`SwitchField tooltip*`. No inline `<p>`/`<span>` hint lines.
- `text` is optional — icon-only (pure marker) or icon + italic qualifier
  (`labelKey`, e.g. `app.common.optional`) are both valid.
- Trigger icon mirrors `priority`: `WARNING` → `TriangleAlert`
  (text-warning), `ERROR` → `OctagonX` (text-destructive), otherwise
  `HelpCircle` (muted). Tooltip body chrome is priority-driven by
  `PriorityTooltipContent`.
- Priority vocabulary: `HINT` = format/usage guidance (lightbulb in
  tooltip), `INFORMATION` = explainers/markers, `WARNING` = irreversible
  or risky semantics, `ERROR` = hard constraints, `QUESTION`/`SUCCESS`
  rare.

## Forbidden

- ❌ raw `<label>` in routes/dialogs/panels (associate via the sanctioned
  anatomies only)
- ❌ `<label>` on non-controls (read-only captions) — use `<span>`
- ❌ hand-copied tooltip gates for column meta — `PrimeField.help` absorbs
  the MetaColumn shape
- ❌ inline hint paragraphs (`<p class="text-xs text-muted-foreground">…Help…`)
  under controls — use the label tooltip
- ❌ `SwitchField description` for field help — use `tooltip*` props
- ❌ `PrimeField hint` — use `help`

## References

- `docs/user-guide/components/prime-field.mdx` — wrapper anatomy + examples
- `docs/user-guide/components/form-fields.mdx` — superforms anatomy
- Canonical pilot: `src/routes/(app)/system/settings/modules/[code]/+page.svelte`
