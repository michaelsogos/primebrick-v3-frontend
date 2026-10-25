# Devin Rule: Card Content Layout Standard

## Trigger
- Applies whenever an AI agent creates or modifies a `<Card>` component
  that contains interactive content (forms, lists, tables, CTAs).

## Canonical doc
**`docs/ai/card-content-layout.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- AI agent MUST place all CTAs in `CardFooter`, never in `CardContent`.
- AI agent MUST use `bg-muted/50 border-t p-4 flex justify-end gap-2` as
  the CardFooter class.
- AI agent MUST NOT use `CardFooter` inside dialogs or `FormPageLayout`.
- AI agent MUST use `superForm({ SPA: true })` for form validation inside
  card components, not page-level forms.
- AI agent MUST use CSS grid `row-start` / `row-span` for cross-column
  alignment (e.g. PasswordChecklist), not fixed-height spacers.
