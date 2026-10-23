# Devin Rule: E2E Browser Session, Auth & Determinism

## Trigger
- Applies whenever an AI agent writes or modifies E2E specs in `src/e2e/`
  that drive a real browser (Playwright), especially specs that need an
  authenticated session, WebGPU, or a warm Cache API (AI model files).

## Canonical doc
**`docs/ai/e2e-browser-session.md` — read it before acting.** This file is a
pointer; the normative text lives in the canonical doc.

## Enforcement
- AI agent MUST NOT add `sleep`/`waitForTimeout` outside the 5s poll slots.
- AI agent MUST NOT modify production components to make a test pass — fix
  the test against the existing DOM contract.
- AI agent MUST report the actual DOM/state in failures (bounded, fail-fast).
