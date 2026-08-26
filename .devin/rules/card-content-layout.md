# Devin Rule: Card Content Layout Standard

## Trigger
- Applies whenever an AI agent creates or modifies a `<Card>` component
  that contains interactive content (forms, lists, tables, CTAs).

## The 4 CardContent types

| Type | Internal layout | Column management |
|------|----------------|-------------------|
| **FORM** | At least 2 columns (`grid grid-cols-2 gap-6`) | Managed by the form's grid |
| **LIST** | Single column | Managed by each `<li>` item |
| **TABLE** | Single column | Managed by the table component |
| **KANBAN** | Single column | Managed by the kanban component |

## The 3-zone vertical structure

Every card with actions follows a vertical 3-zone structure:

1. **CardHeader** — icon + title + description (identity)
2. **CardContent** — form / list / table / empty state (content, NO CTAs)
3. **CardFooter** — action buttons (CTAs)

If a card has no action, `CardFooter` is omitted entirely.

## CTA placement rules

- **ALL CTAs go in `CardFooter`**, never in `CardContent`.
- **All CTAs are right-aligned** (`justify-end`). Secondary and primary
  CTAs are grouped together on the right, ordered left-to-right:
  secondary first, primary last (rightmost).
- This differs from dialogs, where secondary CTAs are pushed to the far
  left (`justify-between`) for strong visual separation — cards do NOT
  use this separation.
- CardFooter standard class:
  `bg-muted/50 border-t p-4 -mb-6 flex justify-end gap-2 rounded-b-xl`.
  The `-mb-6` cancels the card root's `py-6` bottom padding so the footer
  bleeds to the card's bottom edge. `rounded-b-xl` matches the card's
  `rounded-xl`. This mirrors `DialogFooter`'s `-mb-4` pattern.

## When NOT to use CardFooter

CardFooter is the correct footer for **cards** only. Other contexts have
their own footer components for structural reasons:

- **BorderedDialog** → use `DialogFooter` (has `-mx-4 -mb-4 rounded-b-xl`
  to bleed to dialog content edges).
- **FormPageLayout** → use the built-in 50/50 grid footer (audit box left,
  actions right).

## FORM type — field ordering and 2-col grid

- The form uses `grid grid-cols-2 gap-6`.
- Fields are distributed across the 2 columns following reading flow
  (top-to-bottom, col 1 before col 2).
- Validation feedback (e.g. PasswordChecklist) is placed in the column
  **opposite** to its related input, aligned via CSS grid `row-start` /
  `row-span` placement.
- The form is wrapped in the card; the card does NOT use `FormPageLayout`.

## FORM type — validation scoping

- Each card that contains a form uses its own `superForm()` instance with
  `SPA: true` mode — completely independent from the page and from other
  cards.
- Zod schemas are defined inside the card component, not at page level.
- Validation triggers only on user interaction (tainted fields) — errors
  do NOT appear on page load or when interacting with other cards.
- The `onUpdate` callback handles the API call and error mapping locally.

## Enforcement
- AI agent MUST place all CTAs in `CardFooter`, never in `CardContent`.
- AI agent MUST use `bg-muted/50 border-t p-4 flex justify-end gap-2` as
  the CardFooter class.
- AI agent MUST NOT use `CardFooter` inside dialogs or `FormPageLayout`.
- AI agent MUST use `superForm({ SPA: true })` for form validation inside
  card components, not page-level forms.
- AI agent MUST use CSS grid `row-start` / `row-span` for cross-column
  alignment (e.g. PasswordChecklist), not fixed-height spacers.
