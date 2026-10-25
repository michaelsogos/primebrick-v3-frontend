---
trigger: always_on
---

# Devin Rule: Data Model Conventions

## Trigger
- Applies to ALL code in this repository that defines, reads, or returns data models: TS types/interfaces, API response types, component props, store shapes.

## Canonical doc
**`docs/ai/data-model-conventions.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- AI agent MUST use `snake_case` for all new TS interfaces, types, component props, store shapes, and any JSON response fields.
- AI agent MUST NOT create DTO classes/interfaces that rename fields between BE JSON responses and TS models.
- AI agent MUST NOT add lowercasing/uppercasing/trimming on the read path (API response parsing) — only at the write path (form submission).
- AI agent MUST NOT add fallback string-literal defaults (`|| "..."`, `?? ""`) for configuration data.
- AI agent MUST use raw response shapes directly instead of field-by-field rebuilding, unless a field needs a real type conversion.
- When reviewing existing code, flag any camelCase field names in entity-shaped TS types or JSON responses as violations.
