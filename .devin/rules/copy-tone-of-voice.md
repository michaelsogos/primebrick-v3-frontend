---
trigger: always_on
---

# Devin Rule: Copy Tone of Voice

## Trigger
- Applies whenever AI agent writes or edits user-facing text: translations, labels, help tooltips, empty states, validation messages, notifications, placeholders.

## Canonical doc
**`docs/ai/copy-tone-of-voice.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- AI agent MUST write meaningful, explanatory copy — what the thing does for the user, never wire-format/type jargon.
- AI agent MAY use technical terms only when they help a non-technical user (BCP-47, ISO, GDPR, CRON, uuid, email).
- AI agent MUST NOT expose implementation details (JSON array, zod types, payload_schema, kind names) in user-facing strings.
