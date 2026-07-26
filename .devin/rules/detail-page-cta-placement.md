# Devin Rule: Detail-Page Primary CTA Placement

## Trigger
- Applies to ALL detail pages (any non-table page: form pages, settings
  sub-pages, entity edit/create pages, etc.).
- Determines where the DEFAULT primary button must live and which button variant
  to use for in-card CTAs.

## Golden Rule

A "detail page" is any non-table page. Two layouts are allowed:

### Layout 1 — Pure form (TUTTO FORM)
The entire content is a single 2-column form (`grid grid-cols-2 gap-6`) with no
other sections (no lists, no extra cards, no info boxes).

- Use `FormPageLayout` (it provides the card wrapper + audit footer).
- The **DEFAULT primary button lives in the footer** via the `footerActions`
  snippet.
- **No other primary button may appear inside the content** — the footer already
  holds the primary action.
- The footer MAY contain multiple CTAs (primary + secondary) if needed
  (e.g. Cancel + Save, Delete + Save).
- The form is **NOT** wrapped in an extra `<Card>` — `FormPageLayout` already
  provides the `rounded-md border bg-background` wrapper.
- Example: the Profile settings page (`/system/settings/profile`).

### Layout 2 — Mixed content (UN PO' FORM + UN PO' ALTRO)
The page mixes a form with other content (in-card lists, info boxes, multiple
cards, etc.).

- Use `AppPageScaffold` (NOT `FormPageLayout`) — there is no single footer
  primary to render.
- **No primary button in the footer.** The footer (if any) may hold only
  secondary/tertiary actions.
- Each card that needs an action puts its own **DEFAULT primary button inside
  the card content** (`variant="default"` with default `tone="primary"` — i.e.
  the full sky→indigo gradient, white text).
- The form keeps ALL its characteristics: 2-column grid, validation,
  `use:enhance`, `FormField`/`FormLabel`/`FormControl` blocks, etc.
- The form **MUST be wrapped in a `<Card>`** (since `AppPageScaffold` does not
  provide a per-section card wrapper).
- Example: the Credentials settings page (`/system/settings/credentials`) —
  3 cards (Change Password, Passkeys, MFA), each with its own DEFAULT primary
  CTA inside.

## Soft primary usage

`variant="soft" tone="primary"` (gradient border + subtle background, dark text)
is used for in-card CTAs **ONLY when** a DEFAULT primary already exists in the
footer (Layout 1 with extra in-card actions). When there is no footer primary
(Layout 2), in-card CTAs are **DEFAULT primary** — never soft primary.

## Decision flowchart

```
Is the page a detail page (non-table)?
├─ No → this rule does not apply.
└─ Yes → Is the entire content a single 2-col form with no other sections?
   ├─ Yes → Layout 1 (TUTTO FORM):
   │        - FormPageLayout
   │        - DEFAULT primary in footerActions
   │        - No extra <Card> around the form
   │        - No other primary in content
   │        - In-card actions (if any) = soft primary or secondary
   └─ No  → Layout 2 (UN PO' FORM + UN PO' ALTRO):
            - AppPageScaffold
            - No primary in footer
            - Each card's CTA = DEFAULT primary inside the card
            - Form wrapped in <Card>, keeps 2-col grid + validation
```

## Enforcement
- AI agent MUST classify a detail page as Layout 1 or Layout 2 before adding any
  button.
- AI agent MUST NOT place a DEFAULT primary button inside the content of a
  Layout 1 page (footer already has it).
- AI agent MUST NOT place a DEFAULT primary button in the footer of a Layout 2
  page (each card owns its own primary CTA).
- AI agent MUST wrap any form in a `<Card>` when the page is Layout 2.
- AI agent MUST use `variant="soft" tone="primary"` for in-card CTAs ONLY in
  Layout 1 pages with extra in-card actions; in Layout 2 pages, in-card CTAs
  MUST be DEFAULT primary.
