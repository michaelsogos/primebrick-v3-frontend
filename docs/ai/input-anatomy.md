# Input anatomy — internal design language

Canonical anatomy of every text-like input. Goal: identical trailing-CTA
geometry and clear behavior across the whole product.

## Anatomy

```
┌────────────────────────────────────────────────────┐
│ [leading icon]  value text …            [CTAs]  ▮  │
│       ↑                              ↑      ↑   ↑  │
│   px-3 (12px)                2nd slot  1st slot    │
│   from border                right-10  right-1.5   │
└────────────────────────────────────────────────────┘
```

### Measurements (canonical, enforced by `input-chrome.ts`)

| Element | Value | Notes |
|---------|-------|-------|
| Text left padding | `px-3` = 12px | input text starts 12px from left border |
| **Icon glyph size** | **`size-4` = 16px, ALWAYS** | Enforced by `[&>svg]:size-4` inside `inputTrailingIconColorClasses`. Every inner icon-only control (Eraser, Eye/EyeOff, Copy, Check/status, X-remove, etc.) MUST render a 16px glyph — never `size-3`/`h-3.5`. Do not set a size class on the icon itself; let the chrome class own it. |
| **Rightmost glyph edge** | **12px from right border** | Symmetric to `px-3`. `right-1.5` (6px) + size-7 btn (28px) → icon size-4 (16px) centered → glyph edge at 6+6=**12px** |
| 2nd trailing slot | `right-10` (40px) | e.g. async status icon left of clear |
| Text overflow guard | `pr-9` (36px) min | 1 CTA → `pr-9`; 2 CTAs → `pr-14`/`pr-[4.5rem]`; 3 CTAs → `pr-24` |

## Trailing CTA contract

1. **Clear = `Eraser`, always rightmost** (`right-1.5`). Never override with
   another icon — `X` is close/remove, not clear.
2. **Visible only when**: `editable` mode AND `value` non-empty AND
   `clearable` (default `true`, opt-out per-use). Hidden on `readonly`
   (copy button takes the edge instead) and `disabled`.
3. **Extra trailing content** (status icons, eye toggles, flags, brain CTAs)
   positions itself LEFT of the clear zone — `right-10` for slot 2,
   `right-14`+ for slot 3, or a flex row container `right-0` + `pr-2.5`.
4. **z-index**: trailing buttons are `z-10` — `Input` wraps `<input>` in a
   `relative z-1` span (animated border); without z-10 the CTA renders under
   the input (this was a real bug).
5. **tabindex={-1}** on trailing buttons — they must not steal Tab order.
6. **Glyph = 16px, hit area separate** — the icon glyph is always `size-4`
   (enforced via `[&>svg]:size-4` on the shared chrome classes); the button
   hit area (`size-7`, `p-0.5`, or a flow addon) is independent and may vary.
   This does NOT apply to decorative glyphs that are part of trigger content
   (e.g. the `size-3` caret inside a prefix CTA like phone/URL/money
   selectors, or leading icons) — only to standalone icon-only controls.

## Two positioning mechanisms

| Pattern | Where | How |
|---------|-------|-----|
| **Absolute** (`inputTrailingIconButtonClasses`) | `TextInput`, `email-input`, `command-input`, `password-input` | icon button absolutely positioned inside a `div.relative` wrapping the input |
| **Flow** (`InputGroup`/`InputGroupAddon`) | `SearchBar`, `url-input` | CTA is a flex child; addon `pr-2` + button `px-2` ≈ same 12–16px glyph edge |

Both yield ~12px glyph distance. New code should prefer **TextInput +
trailing snippet**; use InputGroup only when the trailing element is a real
inner button (text CTA like "search in", protocol selector).

## Component roles

| Component | Role |
|-----------|------|
| `TextInput` | canonical single-line text input (clear/copy/trailing) |
| `async-validated-input` | TextInput + async status icon (slot 2, `right-10`) |
| `email-input`, `url-input`, `phone-input` | specialized, same trailing contract |
| `password-input` | vendored: eye toggle + copy slots (`right-10`/`right-1.5`) |
| `smart-regex-input` | 3 trailing CTAs in a flex row, `pr-24` on the input |
| `combo-select`, `slider-field` | clear selection / reset-to-inherit → `Eraser` |

## Field hints — single channel (label tooltip)

> Full how-to, cases and code examples: [field-hints.md](./field-hints.md).
> `PrimeField` `hint` and `SwitchField` `description` are `@deprecated` props.

Non-error help NEVER renders as an inline line under the control. The only
channel is the label tooltip (`FormLabelWithPriorityHelp`):

- SuperForms pages: `FormLabelWithPriorityHelp` inside `FormLabel`.
- Non-superforms rows: `PrimeField help={...}` (accepts `FieldHelp` or a
  raw `MetaColumn` — `tooltip`/`tooltip_title`/`tooltip_priority`/
  `show_form_tooltip` handled internally).
- Switch rows: `SwitchField tooltip`/`tooltipTitle`/`tooltipPriority`
  (`description` is deprecated).

Trigger anatomy: `size-3.5` icon + optional italic qualifier (`labelKey`,
e.g. `app.common.optional`). Icon mirrors `priority`: `WARNING` →
`TriangleAlert` (text-warning), `ERROR` → `OctagonX` (text-destructive),
otherwise `HelpCircle` (muted). The tooltip body is `PriorityTooltipContent`
(priority icon + title + text).

**Every tooltip MUST show a priority-tinted title** — an explicit `title`
wins; when omitted, `FormLabelWithPriorityHelp` falls back to
`app.common.tooltipTitle.<priority>` (INFORMATION default). A bare icon-only
tooltip is not allowed.

Priority vocabulary: `HINT` = format/usage guidance · `INFORMATION` =
explainers and markers · `WARNING` = irreversible/risky semantics ·
`ERROR` = hard constraints · `QUESTION`/`SUCCESS` = rare.

## Canonical semantics (see icon-conventions.md)

`Eraser` = clear/reset value · `X` = close/remove/dismiss · `Copy` = copy ·
`Eye`/`EyeOff` = password visibility · `ChevronDown` = dropdown caret.
