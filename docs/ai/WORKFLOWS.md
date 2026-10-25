# Suggested agent workflows (frontend)

These are guidelines, not strict rules. Adapt when the user asks for something different.

## Feature work (UI)

1. **Understand** — acceptance criteria + UI/UX patterns (tables, empty/loading/error states).
2. **Contract** — agree API contract (paths + DTOs) with backend early.
3. **Implement** — keep UI state stable (no effect loops), surface errors via `pushNotification` (see `.devin/rules/error-notification.md`).
4. **Verify** — `pnpm run check` and visual QA in-browser.

## Local dev

- UI dev: `pnpm run dev`
- Proxy to backend: `/api` is proxied (see `vite.config.ts`)
