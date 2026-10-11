# Devin Rule: Documentation Audience (3 tiers)

## Trigger
- Applies whenever AI agent creates, moves, or updates any `*.md`/`*.mdx`
  documentation file, or configures docs ingestion/publication.

## The 3 tiers — MANDATORY

Every documentation file belongs to exactly ONE tier:

| Tier | Location | Audience | Published | Ingested into AI KB |
|------|----------|----------|-----------|---------------------|
| **user-guide** | `docs/user-guide/` | End users (non-developers): product behavior, fields, actions | Zudoku | ✅ YES — end-user KB |
| **dev-guide** | `docs/dev-guide/` | Developers/integrators: APIs, components, routes, architecture, SDK, DAL | Zudoku (dev section) | ❌ NEVER |
| **agent** | `.devin/`, `docs/ai/`, `AGENTS.md`, `docs/skills/` | AI agents / internal team | ❌ NEVER | ❌ NEVER |

## Rules

1. **Classify by audience, not by convenience.** If a page explains HTTP
   routes, NATS™ subjects, TypeScript APIs, component props, repository
   layout, or build/deploy commands → it is `dev-guide`, even if it lives
   near end-user content. If it explains what a user can do on a page,
   what a field means, or what an action does → `user-guide`.
2. **The AI knowledge base ingests `docs/user-guide/` ONLY.** Putting dev
   content in `user-guide` pollutes the end-user KB — the guide agent will
   quote developer internals to end users. This is a production defect,
   not a style issue.
3. **Agent docs are never published or ingested.** Plans, rules, skills,
   and architecture rationale stay in `.devin/`, `docs/ai/`, `AGENTS.md`.
4. **Generated docs inherit the tier of their output directory.** A
   generator emitting into `docs/dev-guide/generated/` is dev content;
   into `docs/user-guide/generated/` is end-user content — pick the dir
   accordingly, don't mix.
5. **Cross-tier links are allowed** (e.g. a user-guide page may link a
   dev-guide deep-dive) but knowledge lives in ONE place — link, don't
   duplicate.

## Microservice variant (if applicable)

Per-service docs live in `<service>/docs/<tier>/` so each service ships
its own documentation pack. The same audience rules apply.
