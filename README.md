# Primebrick frontend

SvelteKit (Svelte 5 + TypeScript) frontend for **Primebrick**.

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

This frontend uses **TailwindCSS + Shadcn-Svelte**.

- Global styles/theme: `src/app.css`
- Tailwind config: `tailwind.config.js`
- Shadcn config: `components.json`

## Development notes

- The dev server proxies `/api` to the backend (see `vite.config.ts`).
- If you’re an AI agent working in the frontend, follow `frontend/AGENTS.md` for conventions and the shadcn update/customization workflow.
