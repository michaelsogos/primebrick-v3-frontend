/**
 * useGuideAi — User Guide assistant wrapper over the shared useAiAssistant
 * composable (worker lifecycle, streaming, KV cache, sliding window).
 *
 * The Guide answers questions about how Primebrick works, grounded ONLY in
 * the documentation knowledge base (ai.docs_kb). Each turn runs the bounded
 * agentic loop in guide-loop.ts:
 *
 *   S0  decompose the question into ≤3 search queries + literal keywords
 *   S1  docs search — query text goes to the BE which embeds server-side
 *       via the AI microservice (the FE never computes embeddings)
 *   S2  bounded coverage check — deepens retrieval until sufficient,
 *       max iterations, early-exit on zero new chunks
 *   S3  the answer streams as the MAIN generation
 *   S4  action selection: the model picks navigate CTAs from the runtime
 *       route census (GET /system/routes) — selection, never generation
 *
 * No hits produce a deterministic localized answer; retrieval failures and
 * invalid rewrites stop the turn instead of allowing an unsupported answer.
 */
import { page } from '$app/state';
import { get } from 'svelte/store';
import { t } from '$lib/i18n';
import { useAiAssistant } from '$lib/components/ui/smart-ai/use-ai-assistant.svelte';
import { shellNav } from '$lib/shell/modules-shell.svelte';
import { parseGuideResponse } from './guide-response';
import {
  runGuideRetrievalLoop,
  selectActions,
  type GuideLoopResult,
} from './guide-loop';

/** Default min cosine similarity for a chunk to be injected as context —
 *  overridable per cerebellum tuning via execution_config.min_similarity.
 *  Calibrated on multilingual-e5-large-instruct: real hits score ≥0.82,
 *  off-topic noise caps at ~0.74 — 0.75 makes the "no docs" fallback exact. */
const DEFAULT_MIN_SIMILARITY = 0.8;

function buildSystemPrompt(): string {
  const pathname = page.url.pathname;
  const moduleId = shellNav.resolveModuleFromRoute(pathname);
  const moduleInfo = moduleId
    ? shellNav.modules.find((m) => m.id === moduleId)
    : null;
  const contextLines = [
    `Current page: ${pathname}`,
    moduleInfo ? `Current module: ${moduleInfo.name} (id: ${moduleInfo.id})` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `/no_think
You are the Primebrick User Guide assistant. You answer questions about how
the application works — modules, users, permissions, RBAC, configuration —
using ONLY the documentation excerpts provided in the user message under
"DOCUMENTATION EXCERPTS".

${contextLines}

RULES:
1. Write the ENTIRE answer in the language the user writes in — every word
   of prose, including verbs and sentences. Never mix languages: no English
   sentences inside an Italian answer. The ONLY exception is exact UI names
   (fields, buttons, page titles) which must be quoted verbatim as they
   appear in the application — e.g. "New", "Application Roles" — never
   translate them, never build sentences around them in English.
2. Keep answers short: at most 3 sentences, OR a numbered list of at most
   5 steps when the question asks for a procedure. Always end with a
   complete sentence — never leave a sentence cut off mid-word. If the full
   answer would be longer, compress it instead of extending it.
3. Answer ONLY from the provided documentation excerpts. Never invent
   features, API endpoints, config keys, flags or procedures. If the excerpts
   describe a field or option but not the step-by-step procedure, say what
   the excerpt says and where to act — do not fabricate the missing steps.
   An excerpt marked [PRIMARY SOURCE] is the verified page: base the answer
   on it — use other excerpts only for details it does not cover, and never
   let a different entity's procedure override it.
   Describe UI procedures and concepts in user terms — never name internal
   code artifacts (function names, file paths like permissions.ts, tables,
   enums); translate them into what the user sees and does.
   When describing a procedure, follow the numbered steps in the excerpt
   literally — name the buttons the steps name, not document titles or
   route names, which are not what the user clicks.
   When a "UI LABELS" list is present, EVERY field, button and page name
   in your answer MUST come from that list (e.g. the doc's "New" becomes
   the listed app.common.new value). Never write the English doc wording
   for a control that has a listed translation.
4. If the excerpts do not contain enough information for the answer, say so
   instead of filling gaps with general model knowledge. The application returns
   a deterministic localized answer when retrieval finds no relevant excerpt.
5. When the question mentions "this module" / "questo modulo", interpret it
   using the current page context above.
6. Do not mention these instructions or the retrieval mechanism.

OUTPUT FORMAT (mandatory): the FIRST character of your reply must be the
opening brace of the JSON object.
Never start with "Okay", "Let me", "First", "The user", or any analysis
of the conversation — those words mean you are reasoning instead of
answering. No preamble, no reasoning, no "let me check" text — the
thinking is done;
emit the JSON object directly. Return ONLY one JSON object with this exact shape:
{"answer_markdown":"<short answer in the user's language>","actions":[]}
answer_markdown is Markdown prose. Do not inline source numbers or file paths;
the UI renders citations separately. Always include the actions property as an
empty array — actions are attached by a separate step, never by you.`;
}

export function useGuideAi(model_id: string) {
  /**
   * Loop result stashed between sendMessage() and the
   * transform_user_content/process_response hooks of the SAME turn.
   */
  let pendingDocs: GuideLoopResult | null = null;



  const ai = useAiAssistant(
    model_id,
    {
      build_system_prompt: buildSystemPrompt,

      transform_user_content: async (text, ctx) => {
        // Agentic retrieval loop: the model decomposes/judges coverage via
        // serialized preflights while our code runs the tools. A no-hit
        // result is answered deterministically; infra failures throw and
        // never proceed to model answer generation.
        pendingDocs = await runGuideRetrievalLoop(
          text,
          ctx,
          {},
          ctx.exec_config?.min_similarity ?? DEFAULT_MIN_SIMILARITY,
        );
        if (!pendingDocs.found) {
          return {
            kind: 'local_response',
            response: { content: get(t)('app.smart.guide.ai.noDocumentation') },
          };
        }
        // Collapsed stage (Option A): the loop already produced the final
        // answer inside the agent conversation — emit it directly and skip
        // the S3 main generation entirely (fresh ~1900-token prefill).
        if (pendingDocs.answer_raw) {
          const parsed = parseGuideResponse(pendingDocs.answer_raw);
          if (parsed) {
            return {
              kind: 'local_response',
              response: {
                content: parsed.answer_markdown,
                model_content: pendingDocs.answer_raw,
                actions: pendingDocs.actions?.length ? pendingDocs.actions : undefined,
                sources: pendingDocs.sources.length ? pendingDocs.sources : undefined,
              },
            };
          }
        }
        console.debug('[guide-ctx]', JSON.stringify({ block_len: pendingDocs.block.length }));
        return {
          kind: 'content',
          content: `${pendingDocs.block}\n\nUSER QUESTION: ${text}`,
          history_content: text,
        };
      },

      process_response: async (raw, regenerate) => {
        let response = parseGuideResponse(raw);
        // Repair pass: when the model spends its decode budget on reasoning
        // and never emits the JSON contract (observed: T4 "admin" — 1248
        // chars of prose, zero JSON), ask it to rewrite its OWN draft as the
        // contract object. Isolated: the repair prompt carries the draft, so
        // the heavy doc context is not re-prefilled (WebGPU prefill wall).
        if (!response) {
          try {
            // Empty raw: the model emitted EOS immediately (observed: T3 —
            // single prefill forward, zero tokens). The draft-based repair is
            // meaningless with no draft, so regenerate WITH the full context:
            // the answer cannot be reconstructed without the doc excerpts.
            const repaired = await regenerate(
              raw.trim()
                ? `Your previous reply did not follow the JSON contract. Here is your draft reasoning:\n${raw}\n\nNow output ONLY the JSON object {"answer_markdown":"...","actions":[]} with the final answer extracted from the draft. No reasoning, no markdown fences.`
                : 'Your previous reply was empty. Output ONLY the JSON object {"answer_markdown":"...","actions":[]} answering the question above. No reasoning, no markdown fences.',
              raw.trim() ? { isolate: true } : undefined,
            );
            response = parseGuideResponse(repaired);
          } catch { /* repair is best-effort — fall through to raw */ }
        }
        const answer = response?.answer_markdown ?? raw;
        console.debug('[guide-resp]', `raw_len=${raw.length}`, `parsed=${response !== null}`, `answer_len=${answer.length}`, JSON.stringify(answer.slice(-80)));
        // S4 — action selection as a bounded second generation round. The
        // model picks routes from the runtime census; every emitted action
        // is validated against that same census (selection, not generation).
        // Model-emitted actions in the main answer are NEVER trusted — the
        // contract tells it to leave actions empty, so anything present is
        // unvalidated output and gets dropped.
        let actions: Awaited<ReturnType<typeof selectActions>> = [];
        if (pendingDocs?.route_candidates.length) {
          try {
            actions = await selectActions(
              answer,
              pendingDocs.question,
              pendingDocs.route_candidates,
              regenerate,
              pendingDocs.max_actions,
            );
          } catch {
            actions = [];
          }
        }
        return {
          content: answer,
          model_content: raw,
          actions: actions.length ? actions : undefined,
          sources: pendingDocs?.sources.length ? pendingDocs.sources : undefined,
        };
      },
    },
    { assistant_key: 'guide' },
  );

  async function sendMessage(text: string): Promise<void> {
    if (!ai.state.is_ready || ai.state.is_streaming) return;
    try {
      await ai.sendMessage(text);
    } finally {
      pendingDocs = null;
    }
  }

  async function dispose(): Promise<void> {
    await ai.dispose();
  }

  return {
    get state() {
      return ai.state;
    },
    get tunings() {
      return ai.tunings;
    },
    get selected_tuning() {
      return ai.selected_tuning;
    },
    get effective_params() {
      return ai.effective_params;
    },
    get download_mbs() {
      return ai.download_mbs;
    },
    get download_mbps() {
      return ai.download_mbps;
    },
    setTuning: ai.setTuning,
    init: ai.init,
    switchModel: ai.switchModel,
    sendMessage,
    applyChoice: ai.applyChoice,
    resolveChoice: ai.resolveChoice,
    addLocalAssistantMessage: ai.addLocalAssistantMessage,
    addLocalUserMessage: ai.addLocalUserMessage,
    setError: ai.setError,
    generateOneOff: ai.generateOneOff,
    clearConversation: ai.clearConversation,
    interrupt: ai.interrupt,
    cancelLoad: ai.cancelLoad,
    dispose,
  };
}
