/**
 * Semantic scorer for AI quality E2E cases — replaces keyword-only scoring
 * with embedding-based meaning metrics (RAGAS-style):
 *
 *   relevance    — cosine(answer, question): does it address what was asked
 *   faithfulness — per-sentence max cosine vs retrieved context: grounded
 *                  or hallucinated
 *   correctness  — cosine(answer, expected): meaning matches the reference
 *
 * The embedder is the SAME model used by the production pipeline
 * (paraphrase-multilingual-MiniLM-L12-v2) — vectors are deterministic, so
 * scores are comparable across model benchmarks. Runs in Node over CPU:
 * this is the scoring harness, not the assistant under test.
 */
import { pipeline } from "@huggingface/transformers";

const MODEL_ID = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

type Extractor = (text: string | string[], options?: object) => Promise<{ data: Float32Array }>;

let extractor: Promise<Extractor> | null = null;
const cache = new Map<string, Float32Array>();

function getExtractor(): Promise<Extractor> {
  if (!extractor) {
    extractor = pipeline("feature-extraction", MODEL_ID).then(
      (p) => p as unknown as Extractor,
    );
  }
  return extractor;
}

export async function embedText(text: string): Promise<Float32Array> {
  const key = text.slice(0, 4000);
  const hit = cache.get(key);
  if (hit) return hit;
  const ext = await getExtractor();
  const out = await ext(text, { pooling: "mean", normalize: true });
  const vec = new Float32Array(out.data);
  cache.set(key, vec);
  return vec;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are normalized — dot == cosine
}

/** Split prose into sentence-ish units for per-claim faithfulness. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

export interface SemanticScores {
  /** 0..1 — answer ↔ question. */
  relevance: number;
  /** 0..1 — mean over answer sentences of max cosine vs context chunks. */
  faithfulness: number;
  /** 0..1 — answer ↔ expected reference. */
  correctness: number;
  /** 0..1 — max over answer sentences of cosine vs expected: did the answer
   *  contain the right fact, without punishing extra correct detail. */
  correctness_max: number;
}

export async function semanticScore(
  question: string,
  answer: string,
  expected: string,
  contextTexts: string[],
): Promise<SemanticScores> {
  const [vAns, vQ, vExp] = await Promise.all([
    embedText(answer),
    embedText(question),
    embedText(expected),
  ]);
  const relevance = cosine(vAns, vQ);
  const correctness = cosine(vAns, vExp);

  let faithfulness = 0;
  let correctness_max = 0;
  const claims = sentences(answer);
  const ctxs = contextTexts.filter((t) => t.trim().length > 0).slice(0, 12);
  if (claims.length) {
    const vCtx = ctxs.length
      ? await Promise.all(ctxs.map((t) => embedText(t.slice(0, 2000))))
      : [];
    let sum = 0;
    for (const c of claims) {
      const vC = await embedText(c);
      correctness_max = Math.max(correctness_max, cosine(vC, vExp));
      let best = 0;
      for (const v of vCtx) best = Math.max(best, cosine(vC, v));
      sum += best;
    }
    faithfulness = ctxs.length ? sum / claims.length : 0;
  }
  return { relevance, faithfulness, correctness, correctness_max };
}
