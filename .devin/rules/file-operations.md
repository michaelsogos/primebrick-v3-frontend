---
trigger: always_on
---

# Devin Rule: File Operations

## Trigger
- Applies whenever AI agent needs to read, write, or verify files

## Canonical doc
**`docs/ai/file-operations.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- AI agent MUST verify file existence empirically before operations
- AI agent MUST NOT rely on editor open files for any decision
- AI agent MUST NOT automatically open plans and scripts files in editor
- AI agent MUST use grep/read tools for content verification
