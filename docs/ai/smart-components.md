# Devin Rule: Smart Components (AI-powered)

> Canonical body of `.devin/rules/smart-components.md` — the rule file is a pointer to this page.

## Trigger
- Applies whenever an AI agent creates or modifies a component with AI/NLP/ML capabilities.

## Naming Convention

All AI-powered components MUST use the `Smart` prefix:

- **Component**: `Smart{Purpose}` (PascalCase) — e.g. `SmartRegexInput`
- **File**: `smart-{purpose}.svelte` (kebab-case) — e.g. `smart-regex-input.svelte`
- **Directory**: `src/lib/components/ui/smart-{purpose}/`
- **Composable**: `use-{purpose}.svelte.ts` — e.g. `use-regex-ai.svelte.ts`
- **Panel**: `{purpose}-panel.svelte` — e.g. `regex-flags-panel.svelte`

## Requirements

1. **Browser-only inference**: AI models run entirely in the browser. No backend AI calls.
2. **Lazy loading**: The AI engine is loaded via dynamic `import()` only when the user interacts with the AI feature.
3. **Progress reporting**: Model download/initialization must show visible progress.
4. **Resource cleanup**: VRAM/memory is released when the AI panel closes.
5. **Graceful degradation**: Non-WebGPU browsers show a clear message and fall back to manual input.
6. **Service Worker**: Background model pre-download uses a Service Worker and Cache API.

## Current Smart Components

| Component | File | AI Engine | Model |
|----------|------|-----------|-------|
| `SmartRegexInput` | `smart-regex-input.svelte` | Transformers.js via `@primebrick/ui/vendor/transformers` (ONNX Runtime WebGPU — no WASM/CPU fallback) | Config-driven via `ai_assistant_model` config row (selected from the `ai_models` registry) |

## Enforcement
- AI agent MUST use the `Smart` prefix for any new AI-powered component.
- AI agent MUST NOT create AI-powered components without the `Smart` prefix.
- AI agent MUST follow the lazy-loading and resource-cleanup requirements.

## Deep dive

The normative rules live here; the full mechanics and rationale are in `docs/dev-guide/ai-tool-loop.mdx` — link, do not duplicate.
