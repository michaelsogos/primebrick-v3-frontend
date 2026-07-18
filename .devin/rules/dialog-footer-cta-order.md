# Devin Rule: Dialog Footer CTA Order

## Trigger
- Applies to ALL dialog components (`Dialog.Footer`, `DialogBordered`, sheet footers) in this repository.

## Golden Rule

### Primary CTA on the right, secondary/dismiss on the left

In every dialog footer with two or more buttons:
- The **secondary/cancel/dismiss** button MUST be on the **left**
- The **primary action** button MUST be on the **right**

This matches the established pattern across all existing dialogs:
- `DeleteDialog`, `BulkDeleteDialog`, `RestoreDialog`, `BulkRestoreDialog`
- `DuplicateDialog`, `ExportDialog`, `HtmlExportDialog`, `ExportPreviewDialog`
- `ChangePasswordDialog`, `RFCErrorDialog`

### Button variants

- **Secondary/dismiss button**: Use `variant="secondary-outline"` — NOT `variant="ghost"`.
  The `ghost` variant is for inline non-dialog contexts (toolbar buttons, icon-only actions).
  In dialog footers, the secondary button must have a visible border to maintain visual
  hierarchy with the primary button.
- **Primary button**: Use the default variant (or `variant="destructive"` for delete actions).

### Footer class

Use `class="gap-2 sm:space-x-0"` on `Dialog.Footer` for consistent spacing.
For dialogs that may stack on mobile, use `class="gap-2 sm:space-x-0 flex-col sm:flex-row"`.

### Example (correct)

```svelte
<Dialog.Footer class="gap-2 sm:space-x-0">
  <Button variant="secondary-outline" onclick={onCancel}>
    {$t('common.cancel')}
  </Button>
  <Button onclick={onConfirm}>
    {$t('common.confirm')}
  </Button>
</Dialog.Footer>
```

### Example (WRONG)

```svelte
<!-- Wrong: primary on left, ghost variant -->
<Dialog.Footer class="gap-2">
  <Button onclick={onConfirm}>Confirm</Button>
  <Button variant="ghost" onclick={onCancel}>Cancel</Button>
</Dialog.Footer>
```

## Enforcement
- AI agent MUST place the primary CTA on the right side of the dialog footer.
- AI agent MUST use `variant="secondary-outline"` for the secondary/dismiss button in dialogs.
- AI agent MUST NOT use `variant="ghost"` for dialog footer buttons.
