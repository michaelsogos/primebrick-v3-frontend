# Frontend agent guide — Primebrick

Short entry point for this repository. **Scoped agent rules** live in `.cursor/rules/` (see **`frontend-src.mdc`** for everything under `src/`).

**Documentation language:** All `*.md` files here must use **English** for team-facing prose.

## Repository layout

This **frontend** tree is its **own Git repository** (separate from backend and from any meta workspace folder).

### Coordinated release (*rilascia tutto*)

Full GitFlow close for **all three** repos (frontend, backend, meta): see **`.cursor/rules/gitflow-guard.mdc`**. Same SemVer across repos unless the user scopes to one repo.

## Stack & commands

| | |
|--|--|
| Stack | SvelteKit + Svelte 5 + TypeScript |
| Dev | `pnpm run dev` |
| Typecheck | `pnpm run check` |
| Build | `pnpm run build` |

## Where to look (order)

1. **`.cursor/rules/`** — `primebrick-core.mdc` (always); **`frontend-src.mdc`** applies when editing files under `src/` (Shadcn, routes, errors, API).
2. **`docs/agent/patterns.md`** — layout, vendor workflow, forms/tables/nav, dev etiquette.
3. **`docs/ai/SKILLS.md`** — before deep Azure/Foundry work; only checked **[x]** skills unless the user overrides.

## GitFlow

Follow **`.cursor/rules/gitflow-guard.mdc`**: never commit on `develop`/`main`; use `feature/*`; merge before push; push only when asked; verify with `pnpm run check` (and visually when UI changes).

**New task / nuovo task:** When the user starts a new task (e.g. *“Iniziamo un nuovo task”*, *let’s start a new task*), infer `feature/<slug>` from context and create that branch from `develop` before edits — see **workspace root `AGENTS.md` → New task workflow**.

## Skills (optional)

Under `.cursor/skills/` — e.g. UI stack, in-browser verification — open the relevant `SKILL.md` when the task matches.
