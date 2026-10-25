# AI / agent documentation (frontend)

These files help humans and agents collaborate consistently on the **Primebrick frontend**.

| File | Role |
|------|------|
| [`patterns.md`](./patterns.md) | UI patterns, page layout, Shadcn vendor workflow, dev etiquette |
| [`auth-session.md`](./auth-session.md) | Session detection without `/auth/me`: `session-check.ts` helpers, login page boot state machine, redirect-cache helpers |
| [`svelte-runes.md`](./svelte-runes.md) | Svelte 5 runes patterns: `$derived` vs `$derived.by`, anti-patterns, `state_referenced_locally`, state-sync effects, ESLint integration, Svelte MCP workflow |
| [`e2e-testid-convention.md`](./e2e-testid-convention.md) | `data-testid` naming convention — brittle-on-purpose locators for E2E |
| [`e2e-browser-session.md`](./e2e-browser-session.md) | Shared Edge CDP session, auth/me gating, locale pinning, hydration gates, bounded waits, missing/exceeding assertions, AI test-score persistence |
| [`i18n.md`](./i18n.md) | ⚠️ CRITICAL — module-scoped translation model: dict loading, `t()` usage, pending translations, `system.*` shared vocabulary |
| [`sheets.md`](./sheets.md) | Sheet/side-panel infrastructure — host, panels, open/close conventions |
| [`field-hints.md`](./field-hints.md) | Field-hint/help conventions for form fields |
| [`icon-conventions.md`](./icon-conventions.md) | Icon conventions — DynamicIcon, Lucide naming, verified icon names |
| [`input-anatomy.md`](./input-anatomy.md) | Input component anatomy — label, help, hint, error slots and chrome |
| [`dev-server.md`](./dev-server.md) | Dev-server lifecycle & process ownership — empirical ownership check, ask-first for user-owned servers, port table |
| [`env-policy.md`](./env-policy.md) | Closed environment policy — `.env` limited to bootstrap vars; runtime config lives in `config_entries` |
| [`enforcement-over-verification.md`](./enforcement-over-verification.md) | Enforcement-over-verification doctrine — behavior is enforced by code/types/builders/validators, tests prove it |
| [`SKILLS.md`](./SKILLS.md) | **Skill selection** — check `[x]` the skills that apply to this repository |
| [`WORKFLOWS.md`](./WORKFLOWS.md) | Optional workflows (plan → implement → verify) |
| Root [`../../AGENTS.md`](../../AGENTS.md) | Project facts, commands, and UI conventions |
| [`always-check-rules-first.md`](./always-check-rules-first.md) | Always Check Rules Before Action |
| [`button-variant-standard.md`](./button-variant-standard.md) | Button Variant Standard |
| [`card-content-layout.md`](./card-content-layout.md) | Card Content Layout Standard |
| [`code-guardrails.md`](./code-guardrails.md) | Code Execution Guardrails |
| [`cross-repo-release-order.md`](./cross-repo-release-order.md) | Cross-Repo Release Ordering |
| [`data-model-conventions.md`](./data-model-conventions.md) | Data Model Conventions |
| [`detail-page-cta-placement.md`](./detail-page-cta-placement.md) | Detail-Page Primary CTA Placement |
| [`dialog-footer-cta-order.md`](./dialog-footer-cta-order.md) | Dialog Footer CTA Order |
| [`docs-audience.md`](./docs-audience.md) | Documentation Audience (3 tiers) |
| [`docs-dev-guide.md`](./docs-dev-guide.md) | Developer Documentation |
| [`docs-order.md`](./docs-order.md) | Documentation Page Order |
| [`docs-pipeline.md`](./docs-pipeline.md) | Documentation Pipeline (trigger-based, end to end) |
| [`docs-sync-on-close.md`](./docs-sync-on-close.md) | Sync Docs on GitFlow Close |
| [`docs-user-pages.md`](./docs-user-pages.md) | End-User Page Structure (docs/user-guide) |
| [`dropdown-surface-standard.md`](./dropdown-surface-standard.md) | Dropdown Surface Shadow Standard |
| [`e2e-test-users.md`](./e2e-test-users.md) | E2E Test Users — NEVER the dev `admin` |
| [`e2e-webauthn-auth.md`](./e2e-webauthn-auth.md) | E2E Auth & WebAuthn (Playwright) |
| [`entity-confirm-dialogs.md`](./entity-confirm-dialogs.md) | Entity Confirm Dialogs (delete/restore) |
| [`entity-list-pages.md`](./entity-list-pages.md) | Entity Table Pages Must Use EntityTablePage |
| [`entity-meta-schema.md`](./entity-meta-schema.md) | Entity Metadata Schema (FE consumer view) |
| [`entity-write-payload.md`](./entity-write-payload.md) | Entity Write Payload (`{entity}` envelope) |
| [`error-notification.md`](./error-notification.md) | Error Notification — Never Use Toast Directly |
| [`file-operations.md`](./file-operations.md) | File Operations |
| [`form-field-standard.md`](./form-field-standard.md) | Form Field Anatomy Standard |
| [`i18n-translation-sources.md`](./i18n-translation-sources.md) | i18n Translation Sources |
| `otp-input.md` — moved to `primebrick-v3-ui/docs/ai/` | OTP / PIN Code Input (component now ships from `@primebrick/ui`) |
| [`package-versioning.md`](./package-versioning.md) | Fixed Package Versions (No Ranges) |
| [`page-title-standard.md`](./page-title-standard.md) | Entity Page Titles — single source of truth |
| [`password-input-standard.md`](./password-input-standard.md) | Password Input Standard |
| [`smart-components.md`](./smart-components.md) | Smart Components (AI-powered) |
| [`ssr-safe-async-loads.md`](./ssr-safe-async-loads.md) | SSR-Safe Async Loads |
| [`svelte4-legacy-idioms.md`](./svelte4-legacy-idioms.md) | No Svelte 4 Legacy Idioms |
| [`temp-files.md`](./temp-files.md) | Temporary Files Location |
| [`translation-key-convention.md`](./translation-key-convention.md) | Translation Key Convention — snake_case singular |
| [`ui-input-components.md`](./ui-input-components.md) | Mandatory UI Input Components |
| [`verify-file-creation.md`](./verify-file-creation.md) | Verify File Creation (Prevent Truncated Filename Bug) |
| [`workflow.md`](./workflow.md) | Devin Workflow Rule: Tic-Toc Planning |

**Start here for agents:** read root `AGENTS.md`, then `patterns.md` for UI conventions, then `SKILLS.md` for skill selection.
