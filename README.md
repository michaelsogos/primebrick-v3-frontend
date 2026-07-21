# AI AGENT INSTRUCTIONS - Primebrick Frontend

**IMPORTANT:** Read [AGENTS.md](./AGENTS.md) for complete AI agent instructions, GitFlow rules, and commands.

## ⚠️ CRITICAL: NEVER COMMIT AUTOMATICALLY

**AI agents MUST NEVER commit changes without explicit user instruction.**

- **WAIT for the user to explicitly tell you to commit** before running any `git commit` command
- This applies to ALL situations - no exceptions
- See [docs/gitflow.md](./docs/gitflow.md) for complete GitFlow rules

## Quick Start for AI Agents

- Read [AGENTS.md](./AGENTS.md) for repository overview, GitFlow rules, and commands
- See [docs/ai/](./docs/ai/) for UI patterns, skills selection, and suggested workflows

---

# Primebrick frontend

SvelteKit™ (Svelte™ 5 + TypeScript®) frontend for **Primebrick**.

## Commands

From the **repository root**, run `pnpm install` once (workspace). Then from `frontend/`:

- Dev: `pnpm run dev`
- Typecheck: `pnpm run check`
- Build: `pnpm run build`

## Project structure (high level)

- Routes/pages: `src/routes/`
- Shared frontend code: `src/lib/`
  - API client helpers: `src/lib/api.ts`
  - UI components:
    - Shadcn primitives: `src/lib/components/ui/*`
    - App/domain components: `src/lib/components/*` (non-`ui/`)

## UI system

This frontend uses **TailwindCSS™ + Shadcn-Svelte™**.

- Global styles/theme: `src/app.css`
- Tailwind config: `tailwind.config.js`
- Shadcn config: `components.json`

## Development notes

- The dev server proxies `/api` to the backend (see `vite.config.ts`).
- If you’re an AI agent working in the frontend, follow `frontend/AGENTS.md` for conventions and the shadcn-svelte™ update/customization workflow.
