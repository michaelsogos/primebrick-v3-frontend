# Devin Rule: Dev Server & Process Lifecycle

## Trigger
- Applies whenever an AI agent is about to start, stop, restart, or kill a
  dev server or any long-lived process in this repository.

## Canonical doc
**`docs/ai/dev-server.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc (rules are pointers,
not docs).

## Enforcement
- The agent OWNS the process lifecycle (start/stop/restart autonomously).
- A provably user-started process is NEVER killed without explicit user
  permission — "not user-started" must be PROVEN by the process parent
  chain, never assumed.
- Never duplicate a server on a different port; never kill the port owner
  without the empirical owner check.
