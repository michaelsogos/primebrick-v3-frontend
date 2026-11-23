# Devin Rule: Entity Confirm Dialogs (delete/restore)

> Canonical body of `.devin/rules/entity-confirm-dialogs.md` — the rule file is a pointer to this page.

## Trigger
- Applies whenever a confirmation dialog deletes or restores an entity record (single or bulk).

## Golden Rules

0. **Entity delete/restore ops MUST dispatch through `runEntityOp`**
   (`$lib/entity-list/use-entity-op.svelte.ts`) — never call `apiFetch`
   for `delete.*`/`purge.*`/`restore.*` or any `meta.actions[]` op whose
   `endpoint.method === 'DELETE'` or whose `confirm_key` is set. The
   invoker owns the confirm gate (mandatory for those ops), the standard
   dialogs, endpoint resolution, MFA step-up, and RFC7807 → notification
   mapping. Its confirm channel is module state rendered by ONE
   `<EntityOpConfirmHost>` mounted in `(app)/+layout.svelte` — the
   channel exists by construction; a page cannot "forget" the dialog
   (the dict page's raw `apiFetch(DELETE)` is the incident this closes).
   `runEntityOp` returns `Promise<boolean>` — `true` iff the request ran
   and succeeded; cancel/fail/no-endpoint resolve `false` after their
   notifications.
1. **ALWAYS use the standard dialogs** from `$lib/components/entity-list-table/dialogs`:
   - `DeleteDialog` (severity `destructive`)
   - `RestoreDialog` (severity `warning`)
   - `BulkDeleteDialog` / `BulkRestoreDialog`
   The invoker renders exactly these via the host — mounting them
   per-page for entity ops is redundant (ELT's `EntityListTableDialogs`
   converges on the invoker too).
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
7. **Severity is meta-derived, never caller-chosen** — the invoker passes
   `chrome?.color` from `meta.actions[op]`; delete/purge default
   `destructive`, restore defaults `warning`. `confirm_key` from the op
   metadata drives the body key when present.
   **The same contract covers ELT-mounted dialogs**: `ExportDialog`,
   `HtmlExportDialog`, `ExportPreviewDialog` and `ChangePasswordDialog`
   all accept `chrome` and resolve `severity = chrome?.color ??
   <op default>` — export defaults `primary`, password defaults
   `warning`. `EntityListTableDialogs` threads `opChrome('export')` so
   the bulk CTA and its dialog share ONE meta source; a custom action's
   dialog (`ChangePasswordDialog` via `extraDialogs`'s
   `row_custom_actions`) gets the SAME chrome the row CTA rendered —
   coherent by construction, not by coincidence. `chrome.variant` shapes
   the CTA only (`'default'|'outline'`); dialogs never read it — the
   "outline dialog" is the reserved security family below.
8. **Native `confirm()`/`alert()`/`prompt()` are banned** — lint rule
   `no-native-dialog` (`check-standards`, `NO_EXEMPT_RULES`) fails the
   build on any native dialog call. Notices use `pushNotification`;
   entity confirms use `runEntityOp`.
   **Single exempted file**: `useUnsavedChangesGuard.svelte.ts` uses
   `window.confirm` BY DECISION — the synchronous browser lock is required
   (an in-app dialog leaves a race window where the user keeps
   interacting; `confirm()` blocks the JS thread — no overlap is
   physically possible). The exemption lives in
   `.devin/check-standards.json` `allowPaths` as a reviewable diff;
   every other file stays banned.
9. **`BorderedDialog` is the ONLY legal dialog surface** — lint rule
   `no-raw-dialog` (`check-standards`, `NO_EXEMPT_RULES` +
   `FE_RULES`) fails on surface-creating anatomy: `Dialog.Root/Content/
   Portal/Trigger/Overlay`, `AlertDialog*`, `DialogRoot/Content/…`
   named imports, `Dialog` straight from `vendor/bits-ui`. Content
   parts (`Dialog.Close/Header/Title/Description/Footer`) are legal
   inside a `BorderedDialog`. Two legal families: top-strip
   (`tone=""`, animated gradient strip by severity) and the reserved
   security family (`tone="soft"`, full-around `border-*-gradient-
   popover` — login/MFA/OTP/step-up/session semantics only).

## Reference
- Docs: `docs/dev-guide/components/entity-confirm-dialogs.mdx`
- Canonical usage: `ai/fe/src/AiSettingsPage.svelte` (remote page mounted at `/system/ai`)
