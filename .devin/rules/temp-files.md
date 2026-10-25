---
trigger: always_on
---

# Devin Rule: Temporary Files Location

## Trigger
- Applies whenever AI agent needs to create temporary files (scripts, patches, intermediate files, etc.)

## Canonical doc
**`docs/ai/temp-files.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- AI agent MUST verify file location before creating any file
- AI agent MUST clean up all temporary files before ending session
- AI agent MUST NOT leave project repositories polluted with temporary files
