# Devin Rule: Error Notification — Never Use Toast Directly

## Trigger
- Applies to ALL error handling, error display, and user-facing notifications in the FE codebase.
- Applies whenever an AI agent needs to show an error, warning, info, or success message to the user.

## Golden Rule

**NEVER call `toast.*()` or `svelte-sonner` directly in components, routes, composables, or any consumer code.**

The shell has a dedicated notification infrastructure layer. All notifications MUST go through it:

### The unified method — `pushNotification`

```ts
import { pushNotification } from '$lib/errors/app-errors';
```

`pushNotification` accepts either plain params or an RFC7807 error object (auto-detected
by presence of `type` + `status` fields). It is the SINGLE entry point for all notifications.

#### For API/RFC7807 errors (from backend responses)
```ts
// CORRECT — pass the RFC7807 object directly, it's auto-detected.
// The apiFetch interceptor calls this automatically for !res.ok responses.
// You rarely need to call this manually.
pushNotification(errorData);

// With toast suppressed (e.g. login form shows its own inline error):
pushNotification({ ...errorData, toast: false });
```

#### For application-level notifications (client-side validation, unhandled rejections, etc.)
```ts
// CORRECT — full control with plain params
pushNotification({ impact: 'CRITICAL', message: 'Critical failure', scope: 'MyComponent' });
pushNotification({ impact: 'HIGH', message: 'Something failed', scope: 'MyComponent' });
pushNotification({ impact: 'MEDIUM', message: 'Warning condition', scope: 'MyComponent' });
pushNotification({ impact: 'LOW', message: 'Info message', scope: 'MyComponent' });

// SUCCESS — toast only, NO event card in errors panel
pushNotification({ impact: 'NONE', message: 'Operation completed', scope: 'MyComponent' });
```

### Impact levels

| Impact | Toast? | Event card in errors panel? | Toast tone |
|--------|--------|----------------------------|------------|
| `CRITICAL` | Yes | Yes | `toast.critical` (red) |
| `HIGH` | Yes | Yes | `toast.error` (red) |
| `MEDIUM` | Yes | Yes | `toast.warning` (yellow) |
| `LOW` | Yes | Yes | `toast.info` (blue) |
| `NONE` | Yes | **No** | `toast.success` (green) |

`NONE` = "no impact" = the operation succeeded. It shows a toast but never adds to the
`appErrors` store because it's not an error.

### FORBIDDEN
```ts
// WRONG — bypasses the shell error panel, topbar badge, and appErrors store
import { toast } from 'svelte-sonner';
toast.error('Something failed');

// WRONG — even importing the wrapper directly
import { toast } from '$lib/errors/toast';
toast.error('Something failed');

// WRONG — using the old deprecated functions (they no longer exist)
import { pushAppError, pushImpactError, pushRFC7807Error } from '$lib/errors/app-errors';
```

## Why

The shell notification infrastructure (`$lib/errors/app-errors.ts`) does THREE things:

1. **Adds it to the `appErrors` store** (for impacts CRITICAL/HIGH/MEDIUM/LOW only) → feeds the
   ErrorsPanel sheet (topbar triangle-alert icon with badge count). Users can review, inspect
   details, and clear errors. Direct toast calls are fire-and-forget — the user cannot review
   them after they auto-dismiss. `NONE` impact skips this step (success is not an error).
2. **Shows a toast** with the correct impact-based styling (CRITICAL = red, HIGH = error,
   MEDIUM = warning, LOW = info, NONE = success/green).
3. **Tags the error** with `internal_code`, `HTTP {status}`, and `instance` (endpoint path)
   for debugging — automatically when an RFC7807 object is passed.

Direct `toast.*()` calls skip steps 1 and 3 — the error is invisible in the shell error
panel, has no tags, and is lost after 5 seconds. This is a UX and debuggability regression.

## Architecture

```
Consumer code (routes, components, composables)
  │
  └── pushNotification(input)
        │
        ├── input is RFC7807? (has `type` + `status`) → auto-normalize to plain params
        │
        ├── impact !== NONE? → appErrors store → ErrorsPanel sheet → topbar badge
        │
        └── toast !== false? → showImpactToast() → toast.critical/error/warning/info/success → Sonner <Toaster>
```

## Exceptions

The ONLY files allowed to import and call `toast.*()` directly:
- `src/lib/errors/toast.ts` — the wrapper itself
- `src/lib/errors/app-errors.ts` — the infrastructure layer that calls toast via the wrapper

Everything else MUST use `pushNotification` from `$lib/errors/app-errors`.

## Enforcement
- AI agent MUST NOT import `svelte-sonner` or `$lib/errors/toast` in any file outside `src/lib/errors/`.
- AI agent MUST use `pushNotification` from `$lib/errors/app-errors` for all notifications.
- AI agent MUST NOT call `toast.error(...)` / `toast.success(...)` / `toast.warning(...)` / `toast.info(...)` / `toast.critical(...)` directly in components, routes, or composables.
- AI agent MUST NOT use `pushAppError`, `pushImpactError`, or `pushRFC7807Error` — these functions have been removed. Use `pushNotification` instead.
- When reviewing existing code, flag any direct `toast.*()` calls outside `src/lib/errors/` as violations.
