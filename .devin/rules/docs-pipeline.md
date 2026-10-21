# Devin Rule: Documentation Pipeline (trigger-based, end to end)

## Trigger
- Applies whenever documentation, generated artifacts, package scripts, or
  release mechanics are discussed or changed — in ANY Primebrick repo.

## The pipeline — no human checklist required

```
repo build (prebuild)          repo release              docs repo            Cloudflare
─────────────────────          ─────────────             ──────────────       ──────────
extract-docs / generate:docs → commit + merge → main →   cron 6h detects    →  build+deploy
writes generated artifacts     docs land on main         SHA drift → sync →   docs.primebrick.dev
(docs/**/generated/, _extracted/                       validate build →
 or docs-pack)                                          patch release →
                                                        push main
```

1. **Generation is automatic at build time.** `pnpm build` regenerates docs
   artifacts via `prebuild` — never run extract/generate scripts "to be safe";
   running a normal build IS the regeneration. Commit the regenerated
   artifacts together with the code change (they are part of the diff).
   - Libraries (dal, sdk, fe, decimal): `extract-docs` → TypeDoc/sveld →
     `docs/dev-guide/_extracted/*.json` + rendered `api-reference.mdx`.
   - Services (BE, US/*): `generate:docs` → `docs/user-guide/generated/*.mdx`
     + `dist/docs-pack/` (the pack the AI service ingests at registration).

2. **Upstream release puts docs on `main`.** The site only trusts `main` —
   develop/feature content is invisible to sync by design.

3. **The docs repo self-releases on drift.** `.github/workflows/docs-release.yml`
   in `primebrick-v3-docs` runs every 6h (and via `gh workflow run
   docs-release.yml`): compares upstream `main` SHAs against
   `scripts/docs-sync-state.json`; on drift it re-syncs `pages/`, validates
   the full Zudoku build, commits on `develop`, cuts `release/<patch>` to
   `main` and tags it. Upstream moves without doc changes → state-only commit,
   no release.

4. **Cloudflare deploys on the push.** Workers Builds on
   `primebrick-v3-docs` triggers on `main` push → `pnpm run build:full` →
   deploys `docs.primebrick.dev`. The merge push IS the warmup; the tag is
   audit metadata.

## KB invariant (hard boundary)

- The product AI knowledge base (`ai.docs_kb`) ingests `docs/user-guide`
  **only**, via docs-packs. Dev-guide and agent docs NEVER enter the KB.
- Libraries (dal, sdk, decimal) ship NO docs-pack — their docs are dev-guide
  only and reach only the institutional site.

## MDX safety — the site build breaks otherwise

- Prose and table cells must NEVER contain raw `{`, `}`, `<`, `>` outside
  backticks/fences — MDX parses them as JS expressions/JSX (build crash or
  silently-empty cells). Generators must pass prose through an `mdxSafe()`
  escape and emit type expressions inside backticks.
- Diagrams use `<Mermaid chart={...} />` — never ` ```mermaid ` fences.

## Versioning of the docs repo

- Content releases are patch bumps (`3.10.1`, `3.10.2`, …) cut automatically
  by the workflow; manual releases follow the same convention.
- See `.devin/rules/cross-repo-release-order.md` for upstream-first ordering.
