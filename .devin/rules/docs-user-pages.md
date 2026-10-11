# Devin Rule: End-User Page Structure (docs/user-guide)

## Trigger
- Applies whenever AI agent creates or updates a page in `docs/user-guide/`
  (any tier: hand-authored narrative pages at root, generated entity
  manual pages under `generated/` or `manual/`).

## Audience

End users — administrators, operators, business users. NOT developers.
They can understand concepts and a little jargon, but they are reading to
understand *what they can do and why*, not how it is built.

## The one pattern — every user page follows this structure

1. **Frontmatter**: `title`, `description` (plain language, one line).
2. **Opening narrative** (no heading): a concrete scenario or the problem
   being solved — 2-4 sentences, second person, no jargon. Answer
   "why should I care?" before "what is it?".
3. **One visual model**: a `<Mermaid />` diagram OR a table that maps the
   concept to something the reader already knows (org chart, workflow,
   comparison). Mandatory on concept pages — one clear picture beats three
   paragraphs.
4. **The building blocks / mechanics**: H2 sections, one idea per section.
   Use tables for enumerations, Mermaid for flows. Explain *what happens
   to the user*, never internal implementation (no table names, no
   endpoints, no code).
5. **A worked example or FAQ**: a short story ("Maria joins the finance
   team…") or practical questions ("do I need to do anything?") that show
   the feature in use.
6. **Where to go next**: links to related generated manual pages
   (`/docs/user-guide/manual/*` or `generated/*`) and sibling narratives.

## Voice

- Second person, present tense, active voice.
- Storytelling over enumeration: "your colleague saves while you still
  have the record open" — not "a save event triggers a merge".
- Technical terms allowed only when the UI shows them (e.g. the name of a
  screen or button, in **bold**). Never expose DB columns, route paths,
  env vars, or internal component names.
- English only.

## Forbidden in user-guide

- ❌ Code blocks, API endpoints, SQL, file paths, env vars
- ❌ Architecture/deployment/operations content (→ `docs/dev-guide/`)
- ❌ Schematic bullet-only pages with no narrative connective tissue
- ❌ Invented behaviour — every claim must trace to real metadata, real
  translations, or real code paths
