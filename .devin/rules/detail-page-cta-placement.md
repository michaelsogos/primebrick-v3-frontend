# Devin Rule: Detail-Page Primary CTA Placement

## Trigger
- Applies to ALL detail pages (any non-table page: form pages, settings
  sub-pages, entity edit/create pages, etc.).
- Determines where the DEFAULT primary button must live and which button variant
  to use for in-card CTAs.

## Canonical doc
**`docs/ai/detail-page-cta-placement.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

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
