# Devin Rule: Error Notification — Never Use Toast Directly

## Trigger
- Applies to ALL error handling, error display, and user-facing notifications in the FE codebase.
- Applies whenever an AI agent needs to show an error, warning, info, or success message to the user.

## Canonical doc
**`docs/ai/error-notification.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- AI agent MUST NOT import `svelte-sonner` or `$lib/errors/toast` in any file outside `src/lib/errors/`.
- AI agent MUST use `pushNotification` from `$lib/errors/app-errors` for all notifications.
- AI agent MUST NOT call `toast.error(...)` / `toast.success(...)` / `toast.warning(...)` / `toast.info(...)` / `toast.critical(...)` directly in components, routes, or composables.
- AI agent MUST NOT use `pushAppError`, `pushImpactError`, or `pushRFC7807Error` — these functions have been removed. Use `pushNotification` instead.
- When reviewing existing code, flag any direct `toast.*()` calls outside `src/lib/errors/` as violations.
