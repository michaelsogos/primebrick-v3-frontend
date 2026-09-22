# AI / agent documentation (frontend)

These files help humans and agents collaborate consistently on the **Primebrick frontend**.

| File | Role |
|------|------|
| [`patterns.md`](./patterns.md) | UI patterns, page layout, Shadcn vendor workflow, dev etiquette |
| [`auth-session.md`](./auth-session.md) | Session detection without `/auth/me`: `session-check.ts` helpers, login page boot state machine, redirect-cache helpers |
| [`svelte-runes.md`](./svelte-runes.md) | Svelte 5 runes patterns: `$derived` vs `$derived.by`, anti-patterns, `state_referenced_locally`, state-sync effects, ESLint integration, Svelte MCP workflow |
| [`e2e-testid-convention.md`](./e2e-testid-convention.md) | `data-testid` naming convention — brittle-on-purpose locators for E2E |
| [`e2e-browser-session.md`](./e2e-browser-session.md) | Shared Edge CDP session, auth/me gating, locale pinning, hydration gates, bounded waits, missing/exceeding assertions, AI test-score persistence |
| [`SKILLS.md`](./SKILLS.md) | **Skill selection** — check `[x]` the skills that apply to this repository |
| [`WORKFLOWS.md`](./WORKFLOWS.md) | Optional workflows (plan → implement → verify) |
| Root [`../../AGENTS.md`](../../AGENTS.md) | Project facts, commands, and UI conventions |

**Start here for agents:** read root `AGENTS.md`, then `patterns.md` for UI conventions, then `SKILLS.md` for skill selection.
