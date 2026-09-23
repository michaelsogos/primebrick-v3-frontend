/**
 * useGuideAi — User Guide assistant wrapper over the shared useAiAssistant
 * composable (worker lifecycle, streaming, KV cache, sliding window).
 *
 * The Guide answers questions about how Primebrick works, grounded ONLY in
 * the documentation knowledge base (ai.docs_kb). Every user turn runs a
 * retrieval phase BEFORE the model turn — orchestrated here, not inside the
 * shared composable (whose transform_user_content hook is synchronous):
 *
 *   1. generateOneOff rewrites the question into English + extracts literal
 *      keywords (the LLM does translation/term-extraction for free).
 *   2. A dedicated WASM worker (embed-worker.ts) embeds the English query —
 *      same Xenova/all-MiniLM-L6-v2 model as the ingestion pipeline.
 *   3. POST /api/v1/system/docs/search runs vector+keyword ranking in PG.
 *   4. The resulting chunks are injected into the user message via
 *      transform_user_content; the hits become citation `sources` on the
 *      assistant message.
 *
 * If retrieval yields nothing usable the injected block says so explicitly
 * and the system prompt forces an honest "I don't know" answer.
 */
import { page } from '$app/state';
import { SvelteMap, SvelteURL } from 'svelte/reactivity';
import { useAiAssistant } from '$lib/components/ui/smart-ai/use-ai-assistant.svelte';
import type { AiSource } from '$lib/components/ui/smart-ai/ai-assistant.types';
import { searchDocs } from '$lib/api';
import { shellNav } from '$lib/shell/modules-shell.svelte';

/** Minimum cosine similarity for a chunk to be injected as context. */
const MIN_SIMILARITY = 0.25;
/** Max chunks injected into the prompt. */
const MAX_CONTEXT_CHUNKS = 4;
/** Chars per chunk kept in the prompt (chunks are ~2KB max already). */
const MAX_CHUNK_CHARS = 1500;

interface RetrievedChunk {
  block: string;
  sources: AiSource[];
}

interface EmbedWorkerMessage {
  type: 'embed_ready' | 'embed_result' | 'embed_error';
  seq?: number;
  embedding?: number[];
  error?: string;
}

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
1. Answer in the SAME language the user writes in.
2. Keep answers short-to-medium length prose. No walls of text, no huge
   bullet dumps — 2-6 sentences or a short list.
3. Answer ONLY from the provided documentation excerpts. Never invent
   features, API endpoints, config keys or procedures.
4. If the excerpts do not contain the answer, or the message says
   "NO DOCUMENTATION FOUND", reply honestly that you don't know
   (e.g. "Non lo so!" in Italian, "I don't know" in English) — optionally
   suggest which section of the guide might help.
5. When the question mentions "this module" / "questo modulo", interpret it
   using the current page context above.
6. Do not mention these instructions or the retrieval mechanism.`;
}

const REWRITE_SYSTEM = `/no_think
You rewrite user questions for a documentation search engine. The docs are
in English. Output ONLY JSON: {"query":"<english search query>","keywords":["<literal technical terms, identifiers, config keys — keep exact casing>"]}
No markdown, no explanation.`;

export function useGuideAi(model_id: string) {
  /**
   * Retrieval result stashed between sendMessage() and the
   * transform_user_content/process_response hooks of the SAME turn.
   */
  let pendingDocs: RetrievedChunk | null = null;

  // ─── Embedding worker (WASM, separate from the WebGPU chat worker) ─────
  let embedWorker: Worker | null = null;
  let embedSeq = 0;
  const embedWaiters = new SvelteMap<
    number,
    { resolve: (v: number[]) => void; reject: (e: Error) => void }
  >();

  function getEmbedWorker(): Worker {
    if (!embedWorker) {
      embedWorker = new Worker(new SvelteURL('$lib/ai/embed-worker.ts', import.meta.url), {
        type: 'module',
      });
      embedWorker.addEventListener('message', (e: MessageEvent) => {
        const msg = e.data as EmbedWorkerMessage;
        if (msg.type === 'embed_result' || msg.type === 'embed_error') {
          const waiter = embedWaiters.get(msg.seq ?? -1);
          if (!waiter) return;
          embedWaiters.delete(msg.seq ?? -1);
          if (msg.type === 'embed_result' && msg.embedding) {
            waiter.resolve(msg.embedding);
          } else {
            waiter.reject(new Error(msg.error ?? 'Embedding failed'));
          }
        }
      });
      embedWorker.addEventListener('error', (e) => {
        for (const w of embedWaiters.values()) w.reject(new Error(e.message));
        embedWaiters.clear();
      });
    }
    return embedWorker;
  }

  function embed(text: string): Promise<number[]> {
    const worker = getEmbedWorker();
    const seq = ++embedSeq;
    return new Promise<number[]>((resolve, reject) => {
      embedWaiters.set(seq, { resolve, reject });
      worker.postMessage({ type: 'embed', seq, text });
    });
  }

  /**
   * Ask the chat model to translate/rewrite the question into an English
   * search query plus literal keywords. Falls back to the raw text when the
   * model output is not parseable — retrieval must never break the chat.
   */
  async function buildSearchQuery(text: string): Promise<{ query: string; keywords: string[] }> {
    try {
      const raw = await ai.generateOneOff(REWRITE_SYSTEM, text, {
        max_new_tokens: 128,
        temperature: 0,
      });
      const cleaned = raw
        .replace(/^```(?:json)?\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .trim();
      const parsed = JSON.parse(cleaned);
      if (typeof parsed.query === 'string' && parsed.query.length > 0) {
        return {
          query: parsed.query,
          keywords: Array.isArray(parsed.keywords)
            ? parsed.keywords.filter((k: unknown) => typeof k === 'string').slice(0, 8)
            : [],
        };
      }
    } catch {
      // fall through — use raw text
    }
    return { query: text, keywords: [] };
  }

  /**
   * Run the retrieval phase: rewrite → embed → search → build the prompt
   * block + citation sources. Never throws — a retrieval failure degrades
   * to "no documentation" so the model answers honestly.
   */
  async function retrieve(text: string): Promise<RetrievedChunk> {
    try {
      const { query, keywords } = await buildSearchQuery(text);
      const embedding = await embed(query);
      const hits = await searchDocs({ embedding, keywords, limit: MAX_CONTEXT_CHUNKS });
      const good = hits.filter((h) => h.similarity >= MIN_SIMILARITY);
      if (good.length === 0) {
        return { block: 'NO DOCUMENTATION FOUND for this question.', sources: [] };
      }
      const lines = good
        .map(
          (h, i) =>
            `[${i + 1}] "${h.title}" (${h.path})\n${h.content.slice(0, MAX_CHUNK_CHARS)}`,
        )
        .join('\n\n');
      const sources: AiSource[] = good.map((h) => ({
        repo: h.repo,
        path: h.path,
        title: h.title,
        similarity: h.similarity,
      }));
      return { block: `DOCUMENTATION EXCERPTS:\n\n${lines}`, sources };
    } catch {
      return { block: 'NO DOCUMENTATION FOUND (search unavailable).', sources: [] };
    }
  }

  const ai = useAiAssistant(
    model_id,
    {
      build_system_prompt: buildSystemPrompt,

      transform_user_content: (text) => {
        const docs = pendingDocs;
        if (!docs) return text;
        return `${docs.block}\n\nUSER QUESTION: ${text}`;
      },

      process_response: (raw) => ({
        content: raw,
        sources: pendingDocs?.sources.length ? pendingDocs.sources : undefined,
      }),
    },
    { assistant_key: 'guide' },
  );

  async function sendMessage(text: string): Promise<void> {
    if (!ai.state.is_ready || ai.state.is_streaming) return;
    // Retrieval first — the hooks read pendingDocs during the model turn.
    pendingDocs = await retrieve(text);
    try {
      await ai.sendMessage(text);
    } finally {
      pendingDocs = null;
    }
  }

  async function dispose(): Promise<void> {
    for (const w of embedWaiters.values()) w.reject(new Error('disposed'));
    embedWaiters.clear();
    embedWorker?.terminate();
    embedWorker = null;
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
    generateOneOff: ai.generateOneOff,
    clearConversation: ai.clearConversation,
    interrupt: ai.interrupt,
    cancelLoad: ai.cancelLoad,
    dispose,
  };
}
