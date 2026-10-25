# Devin Rule: Dialog Footer CTA Order

## Trigger
- Applies to ALL dialog components (`Dialog.Footer`, `DialogBordered`, sheet footers) in this repository.

## Canonical doc
**`docs/ai/dialog-footer-cta-order.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- AI agent MUST place the primary CTA on the right side of the dialog footer.
- AI agent MUST use `variant="secondary-outline"` for the secondary/dismiss button in dialogs.
- AI agent MUST NOT use `variant="ghost"` for dialog footer buttons.
