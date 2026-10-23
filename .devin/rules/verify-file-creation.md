# Devin Rule: Verify File Creation (Prevent Truncated Filename Bug)

## Trigger
- Applies AFTER every `write` tool call that creates a new file
- Applies after every `edit` tool call that creates a new file (via path that didn't exist before)

## Canonical doc
**`docs/ai/verify-file-creation.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- AI agent MUST verify file creation after every `write` call
- AI agent MUST delete any truncated sibling files immediately
- AI agent MUST NOT proceed to the next task until truncated files are cleaned up
- The periodic sweep is internalized: `check-standards.ts` rule `truncated-sibling` scans the tree on every `check:standards` run — no external script exists.
