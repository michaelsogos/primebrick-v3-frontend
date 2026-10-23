# Devin Rule: E2E `data-testid` Convention (brittle-on-purpose)

## Trigger
- Applies whenever an AI agent creates, modifies, or removes an interactive
  DOM element (input, button, toggle, link, dialog action, list item, etc.)
  in a Svelte™ component or route that could be targeted by E2E tests.
- Also applies when creating new E2E test specs that need to locate elements.

## Canonical doc
**`docs/ai/e2e-testid-convention.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- Violations of this rule MUST be flagged by the AI agent in the chat.
- The AI agent MUST NOT merge a component change that drops a testid without
  updating the corresponding E2E test.
