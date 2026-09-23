# Devin Rule: Button Variant Standard

## Trigger
- Applies whenever AI agent renders a `Button` (`$lib/components/ui/button`)
  or any clickable action element.

## Golden Rule
**Only documented `variant`/`tone` combinations are allowed.** The matrix in
`docs/button-styles.md` is a closed set — no free creativity, no invented
roles, no manual styling.

## Allowed without asking

| Role | Props |
|---|---|
| Primary action | `variant="default"` |
| Secondary action (gradient border, neutral bg) | `variant="outline"` + `tone` |
| Soft action (soft gradient border, tinted bg) | `variant="soft"` + `tone` |
| Semantic solid | `variant="destructive" \| "warning" \| "success" \| "info"` |
| Icon-only / subtle neutral action | `variant="ghost"` + `size="icon-*"` |

`tone`: `primary` (default), `destructive`, `warning`, `success`, `info`.

## Requires explicit user instruction
- `variant="secondary"`, `"secondary-outline"`, `"link"`, `"glass"` — neutral
  escapes; do NOT pick them by default.
- Any custom class-based styling (`border-*`, `bg-*`, gradient utilities) on a
  `Button` — always forbidden, regardless of instruction.

## Notes
- "Secondary button with primary gradient border" = `variant="outline"
  tone="primary"`. `variant="secondary"` is plain neutral gray — it has NO
  gradient border.
- Hover/active/focus/disabled states are baked into `buttonVariants` — do not
  re-add them.
- Sheet header CTAs are exempt: they use the shared `size-8` chrome documented
  in `docs/ai/sheets.md`, not `Button`.
