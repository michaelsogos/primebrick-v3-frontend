# Primebrick Frontend - AI Agent Guide

## Repository overview

Independent Git repository containing the Primebrick SvelteKit application.

**Documentation language:** All `*.md` files must use **English** for team-facing prose.

## Stack & commands

| | |
|--|--|
| Stack | SvelteKit + Svelte 5 + TypeScript |
| Dev | `pnpm run dev` |
| Typecheck | `pnpm run check` |
| Build | `pnpm run build` |

## Where to look (order)

1. **`docs/agent/patterns.md`** — layout, vendor workflow, forms/tables/nav, dev etiquette.
2. **`docs/ai/`** — skills selection and suggested workflows.

## GitFlow rules

This repository follows GitFlow. AI agents MUST follow these rules:

### Branch management
- **NEVER work directly on `develop` or `main`**
- Always create feature branches: `git checkout -b feature/<slug>` from updated `develop`
- Feature branches for all normal work (bugs, features, fixes)
- Release branches from `develop` for version bumps only
- Hotfix branches from `main` for production fixes only

### When to ask user permission
- **ASK before creating NEW feature branch** if another feature branch is already open
- **DO NOT ask permission** to commit changes on existing feature branch
- **DO NOT ask permission** to close a feature branch (follow proper closing procedure)

### Branch closing procedure
When closing ANY branch (`feature/*`, `release/*`, `hotfix/*`):
1. Merge to appropriate base branch with `--no-ff`
   - Feature: merge into `develop`
   - Release/Hotfix: merge into `main`
2. Push the merged base branch
3. Delete branch LOCALLY: `git branch -d <branch-name>`
4. Delete branch on ORIGIN: `git push origin --delete <branch-name>`
5. For Release/Hotfix: Also merge `main` back to `develop`

### Version tagging
- NO 'v' prefix for tags (use `0.13.2` not `v0.13.2`)
- Tag derived from branch name: `release/0.13.2` → tag `0.13.2`
- Hotfix increments PATCH: `0.13.1` → `hotfix/0.13.2` → tag `0.13.2`
- Release increments MINOR: `0.13.2` → `release/0.14.0` → tag `0.14.0`

### Common mistakes to avoid
- Committing directly on `develop` or `main`
- Creating commits before creating feature branch
- Forgetting to delete branches (both local and origin)
- Using 'v' prefix in tags
- Not pushing merged base branch
- Leaving feature branches open after merge

### Commit rules
- NEVER commit automatically - wait for explicit user instruction
- DO NOT ask user to approve commit messages
- Write appropriate commit messages directly when instructed
- DO NOT open editor for commit approval

### New task workflow
When the user starts a fresh piece of work with phrases such as "Let's start a new task", "Iniziamo un nuovo task", or equivalent:
1. Infer a branch slug from context — lowercase, kebab-case, ASCII letters/digits/hyphens only
2. Before the first tracked-file change, ensure a branch `feature/<slug>` exists from up-to-date `develop`
3. State the slug once (e.g. "Branch: `feature/iana-timezone`") so the user can rename if needed
4. After creating a feature branch, verify with `git branch --show-current` so the working tree matches the branch

## Further documentation

See `docs/agent/patterns.md` for UI patterns and conventions.
See `docs/ai/` for skills selection and suggested workflows.
