# Button Style Standards

The `Button` component (`$lib/components/ui/button`) is a **variant × tone**
matrix built on `tailwind-variants`. Pick a variant (how the tone's gradient is
used) and a tone (which semantic color). Never hand-write border or background
classes on a `Button` — the matrix already covers every combination.

## The mental model

`primary` is a gradient (sky-400 → indigo-400), and every semantic color has
its own gradient pair. The **variant** decides where the gradient goes:

| Role | Variant | Look |
|---|---|---|
| **Primary action** | `variant="default"` (or the named semantic variants below) | Solid gradient background, white text |
| **Secondary action** | `variant="outline"` + `tone` | **Gradient border + white/neutral background** |
| **Soft action** | `variant="soft"` + `tone` | **Soft gradient border + lightly tinted gradient background** |
| Neutral, no tone | `secondary`, `secondary-outline`, `ghost`, `link`, `glass` | Plain neutral chrome — no gradient, no tone semantics |

### Neutral variants policy

- `ghost` — **the only neutral variant with a de-facto standard**: icon-only
  subtle actions (`size="icon-*"`) in toolbars, headers, and dismiss controls,
  or text actions that must not compete visually. ~50 usages follow this.
- `secondary` / `secondary-outline` / `link` / `glass` — **explicit instruction
  only**. They are neutral escapes for cases the matrix does not cover; do not
  reach for them by default.

So "secondary button with the primary gradient border" is
`variant="outline" tone="primary"` — **not** `variant="secondary"`.
`variant="secondary"` is the plain neutral gray button (Cancel-style chrome).

## Tones

`tone` selects the semantic gradient: `primary` (default), `destructive`,
`warning`, `success`, `info`.

- `outline` + tone → `border-{tone}-gradient` (solid gradient border, neutral bg)
- `soft` + tone → `border-{tone}-gradient-soft` (soft gradient border + tinted bg)
- The solid- gradient-bg semantic roles are standalone **variants**
  (`destructive`, `warning`, `success`, `info`) — they already carry their tone.

## Recipes

```svelte
<Button variant="default">Save</Button>                        <!-- primary gradient bg -->
<Button variant="outline" tone="primary">Details</Button>      <!-- gradient border, white bg -->
<Button variant="soft" tone="info">Learn more</Button>         <!-- soft border + tinted bg -->
<Button variant="destructive">Delete</Button>                  <!-- red gradient bg -->
<Button variant="outline" tone="destructive">Discard</Button>  <!-- red gradient border -->
<Button variant="secondary">Cancel</Button>                    <!-- plain neutral -->
<Button variant="ghost" size="icon-sm"><X /></Button>          <!-- icon-only neutral -->
```

## Hard rules

- **ONLY documented variant/tone combinations are allowed.** The matrix above
  is the closed set — no ad-hoc styling, no invented roles.
- **NEVER** add `border`, `border-*`, `bg-*`, or gradient classes to a `Button`
  via `class=` to fake a role — pick the right `variant`/`tone` combo.
- **NEVER** use `variant="secondary"` expecting a gradient border — it is the
  neutral role. Gradient border + neutral bg = `variant="outline"`.
- `variant="secondary"`, `"secondary-outline"`, `"link"`, `"glass"` require an
  explicit instruction. `ghost` is allowed only for icon-only/subtle actions.
- **NEVER** stack `variant="soft"`/`outline` with manual `border-*-gradient`
  classes — the compound variants already apply them.
- Hover/active/disabled/focus states are baked into `buttonVariants`
  (`hover:brightness-105`, `active:translate-y-px`, `disabled:opacity-50`,
  `focus-visible:ring-[3px]`). Do not re-add them.
- Icon-only buttons: `size="icon-xs" | "icon-sm" | "icon" | "icon-lg"`.
  **Sheet header CTAs are exempt** — they use the shared `size-8` chrome from
  `docs/ai/sheets.md`, not `Button`.

## Sizes

`default` (h-9) · `sm` (h-8) · `xs` (h-7) · `lg` (h-10) · `icon*` sizes.
Compact toolbars/popovers default to `sm` or `xs`.
