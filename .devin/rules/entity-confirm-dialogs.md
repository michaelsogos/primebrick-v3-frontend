# Devin Rule: Entity Confirm Dialogs (delete/restore)

## Trigger
- Applies whenever a confirmation dialog deletes or restores an entity record (single or bulk).

## Golden Rules

1. **ALWAYS use the standard dialogs** from `$lib/components/entity-list-table/dialogs`:
   - `DeleteDialog` (severity `destructive`)
   - `RestoreDialog` (severity `warning`)
   - `BulkDeleteDialog` / `BulkRestoreDialog`
2. **NEVER pass a custom title or body** — these props do not exist. Title and
   body are derived by convention:
   - Title: `app.common.{delete,restore}EntityTitle` + `system.entities.{entity}.singular` (or `…EntitiesTitle` + `.plural` for bulk)
   - Body: `app.common.{delete,restore}EntityConfirm` with `{entity}` + `{name}` placeholders (or `…EntitiesConfirm` with `{count}` + plural)
   - The body is ALWAYS a question (e.g. "Sei sicuro di voler eliminare Modello AI "X"?")
3. **`entity` prop is required** — the snake_case entity key used to resolve
   `system.entities.{entity}.singular|.plural`. If the keys are missing for a
   new entity, add them via a BE translation patch (`system.translations`, all
   7 languages).
4. **`recordName`** — pass the record display name when available; it is
   interpolated as `"{name}"` in the question. `EntityListTable` derives it
   automatically via `EntityListTableDialogs`.
5. **Non-entity destructive dialogs are exempt** — model cache files, MFA reset,
   sessions etc. may use `DialogBordered` directly with custom titles. They are
   not entity records.
6. **Never use `DialogBordered` directly for entity delete/restore** — bypassing
   the standard dialogs loses the convention-driven copy.

## Reference
- Docs: `docs/user-guide/components/entity-confirm-dialogs.mdx`
- Canonical usage: `src/routes/(app)/system/settings/ai/+page.svelte`
