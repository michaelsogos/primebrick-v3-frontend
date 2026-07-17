# Devin Rule: User-Facing Documentation

## Trigger
- Applies whenever AI agent creates or updates files in `docs/user-guide/`.

## Editorial conventions

1. **Audience**: external developers using Primebrick. Not internal team, not
   AI agents. Write as if explaining to a dev who just cloned the repo.
2. **Tone**: direct, technical, no marketing language. "The auth middleware
   validates JWT tokens on every request" — not "Our amazing auth system
   beautifully handles security."
3. **Code examples**: always complete and runnable. Show imports, show
   context. Never partial snippets that won't compile.
4. **Diagrams**: use `<Mermaid chart={...} />` component (Zudoku client-side
   rendering). NEVER use ` ```Code ` or ` ```mermaid ` fenced blocks for
   Mermaid — they will not render on the docs site.
5. **Structure**: each page has:
   - Frontmatter: `title`, `description`
   - H2 sections with clear headings
   - Code examples in fenced blocks with correct language tags
   - "Next steps" links at the bottom to related pages
6. **Language**: English only (per AGENTS.md).
7. **Incremental updates**: when updating an existing page, preserve the
   existing prose structure. Make minimal edits. Do NOT rewrite the entire
   page unless the source code has fundamentally changed.
8. **Marked sections**: blocks wrapped in `<!-- AUTO-GENERATED:reference -->`
   ... `<!-- END -->` contain extracted API facts. Update these from the
   extraction JSON. Never modify prose outside these blocks unless the
   underlying concept has changed.

## Forbidden
- ❌ ` ```Code ` blocks for Mermaid diagrams
- ❌ ` ```mermaid ` fenced blocks (use `<Mermaid chart={...} />` instead)
- ❌ Rewriting unchanged pages (creates git diff churn)
- ❌ Inventing APIs, props, or endpoints not in the extraction JSON or code
- ❌ Marketing language or superlatives
