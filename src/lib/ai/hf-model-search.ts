/**
 * Hugging Face model search for the "Add model" sheet.
 *
 * Queries the public HF models API for ONNX repos and keeps only generative
 * text models (LLM / MoE / coder) — vision, audio, embedding and other
 * non-generative pipelines are filtered out client-side. When a parameter
 * size is parsable from the repo id (e.g. `Qwen3-1.7B`, `0.6B`, `30B-A3B`)
 * repos over `MAX_PARAMS_B` are dropped.
 */

const HF_API = 'https://huggingface.co/api/models';
const MAX_PARAMS_B = 5;

const ALLOWED_PIPELINES = new Set([
  'text-generation',
  'text2text-generation',
  undefined, // many ONNX repos carry no pipeline_tag
]);

/** Repo ids that are never generative chat models. */
const EXCLUDED_RE =
  /vision|image|audio|speech|whisper|clip|siglip|depth|segment|diffus|ocr|video|tts|asr|embed|bert|rerank|classif|detect|pose|yolo|vits|piper/i;

export type HfModelHit = {
  /** Full HF repo id, e.g. `onnx-community/Qwen3-0.6B-ONNX`. */
  id: string;
  /** Short display name (id without the org prefix). */
  name: string;
  downloads: number;
  /** Parameter count in billions parsed from the repo id (null = unknown). */
  params_b: number | null;
  /** Estimated download size in MB for a q4-class dtype (weights only). */
  est_download_mb: number | null;
  /** Estimated working set in MB (weights + KV/context headroom). */
  est_working_set_mb: number | null;
  /** Estimated power_level 1-5 via LEVEL_REQUIREMENT_MB on the estimate. */
  est_power_level: number | null;
};

/** int4-class quant (q4f16) ≈ 0.6 bytes/param including scales. */
const GB_PER_B_PARAMS = 0.6;
/** KV cache + runtime context headroom on top of pure weights. */
export const KV_CTX_FACTOR = 1.4;

/** Same ladder as BE power-level.ts / useMachineCapabilities — keep in sync. */
const LEVEL_REQUIREMENT_MB: Record<number, number> = { 1: 1200, 2: 2200, 3: 4000, 4: 7000, 5: 9500 };

export function powerLevelFromWorkingSet(wsMb: number): number {
  for (const level of [1, 2, 3, 4, 5]) {
    if (wsMb <= LEVEL_REQUIREMENT_MB[level]) return level;
  }
  return 5;
}

type HfApiRow = {
  id: string;
  downloads?: number;
  pipeline_tag?: string;
  tags?: string[];
};

/** Largest `NxB` parameter token found in the repo id, or null.
 *  Handles both `1.7B` and the compact `1b1` (=1.1B) naming. */
function paramsBillions(id: string): number | null {
  const hits = [
    ...[...id.matchAll(/(\d+(?:\.\d+)?)\s*b\b/gi)].map((m) => parseFloat(m[1])),
    ...[...id.matchAll(/(\d+)b(\d)/gi)].map((m) => parseFloat(`${m[1]}.${m[2]}`)),
  ];
  return hits.length ? Math.max(...hits) : null;
}

export type HfSearchPage = {
  hits: HfModelHit[];
  /** HF list API pagination cursor (RFC5988 `Link` header, rel="next"). */
  nextUrl: string | null;
};

function parseNextUrl(link: string | null): string | null {
  if (!link) return null;
  const m = link.match(/<([^>]+)>\s*;\s*rel="next"/);
  return m ? m[1] : null;
}

/** Server-side sort orders supported by the HF list API. */
export type HfSort = 'downloads' | 'trending' | 'name';

const SORT_PARAMS: Record<HfSort, string> = {
  downloads: 'sort=downloads&direction=-1',
  trending: 'sort=trendingScore',
  name: 'sort=id&direction=1',
};

/**
 * One page of HF results. Pass `nextUrl` from the previous page to fetch
 * the following one (cursor pagination — never re-issue the base URL).
 */
export async function searchHfModels(
  query: string,
  {
    limit = 50,
    signal,
    nextUrl,
    sort = 'downloads',
  }: { limit?: number; signal?: AbortSignal; nextUrl?: string | null; sort?: HfSort } = {},
): Promise<HfSearchPage> {
  // pipeline_tag is sent server-side: with an empty `search` HF otherwise
  // returns generic top ONNX repos (embeddings/encoders dominate) — the
  // client filter alone leaves ~2 results.
  const url =
    nextUrl ??
    `${HF_API}?search=${encodeURIComponent(query.trim())}` +
      `&filter=onnx&pipeline_tag=text-generation` +
      `&${SORT_PARAMS[sort]}&limit=${limit}&full=false`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HF search failed (${res.status})`);
  const rows = (await res.json()) as HfApiRow[];
  const next = parseNextUrl(res.headers.get('Link'));
  const hits = rows
    .filter((r) => {
      if (!ALLOWED_PIPELINES.has(r.pipeline_tag)) return false;
      if (EXCLUDED_RE.test(r.id)) return false;
      const params = paramsBillions(r.id);
      if (params !== null && params > MAX_PARAMS_B) return false;
      return true;
    })
    .map((r) => {
      const params_b = paramsBillions(r.id);
      const est_download_mb =
        params_b !== null ? Math.round(params_b * GB_PER_B_PARAMS * 1024) : null;
      const est_working_set_mb =
        est_download_mb !== null ? Math.round(est_download_mb * KV_CTX_FACTOR) : null;
      return {
        id: r.id,
        name: r.id.split('/').pop() ?? r.id,
        downloads: r.downloads ?? 0,
        params_b,
        est_download_mb,
        est_working_set_mb,
        est_power_level:
          est_working_set_mb !== null ? powerLevelFromWorkingSet(est_working_set_mb) : null,
      };
    });
  // Server already sorts by `id` — do NOT re-sort by short `name` here:
  // it scrambles the global ordering (org prefix is the sort key).
  return { hits, nextUrl: next };
}

/** All dtype tokens recognised in ONNX repo filenames — the filter set
 *  exposed by the import panel's quantization chips. */
export const HF_DTYPES = [
  'fp32', 'fp16', 'q8', 'int8', 'uint8', 'q4', 'q4f16', 'bnb4', 'quantized',
] as const;

export type HfDtypeVariant = {
  /** dtype token from the filename, e.g. `q4f16` (`fp32` for the unsuffixed model.onnx). */
  dtype: string;
  /** Total MB of all files needed for this variant (model + external .onnx_data). */
  download_mb: number;
};

/**
 * Real dtype variants + sizes for a repo — `?blobs=true` returns sibling
 * sizes. `onnx/model_<dtype>.onnx` (+ any `*.onnx_data*` external weights)
 * is what transformers.js downloads for `dtype`.
 */
export async function fetchHfDtypeVariants(
  repoId: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<HfDtypeVariant[]> {
  const res = await fetch(`${HF_API}/${repoId}?blobs=true`, { signal });
  if (!res.ok) throw new Error(`HF repo fetch failed (${res.status})`);
  const row = (await res.json()) as {
    siblings?: { rfilename: string; size?: number }[];
  };
  const files = row.siblings ?? [];

  // Group onnx/*.onnx( _data) files by dtype suffix. Modern repos name
  // `model_<dtype>.onnx`; older ones use `decoder_model*.onnx` with no
  // quant suffix at all — those collapse into the `fp32` variant.
  const DTYPE_TOKENS: ReadonlySet<string> = new Set(HF_DTYPES);
  const variants = new Map<string, number>();
  for (const f of files) {
    if (!/^onnx\/.*\.onnx(?:_data.*)?$/.test(f.rfilename)) continue;
    const base = f.rfilename.split('/').pop()!.replace(/\.onnx(_data.*)?$/, '');
    const last = base.split('_').pop() ?? '';
    const dtype = DTYPE_TOKENS.has(last) ? last : 'fp32';
    variants.set(dtype, (variants.get(dtype) ?? 0) + (f.size ?? 0));
  }
  return [...variants.entries()]
    .map(([dtype, bytes]) => ({ dtype, download_mb: Math.round(bytes / 1048576) }))
    .sort((a, b) => a.download_mb - b.download_mb);
}

/** Repo generation_config.json — first root, then onnx/ (older repos). */
export async function fetchHfGenerationConfig(
  repoId: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<{ top_p?: number; repetition_penalty?: number } | null> {
  for (const path of ['generation_config.json', 'onnx/generation_config.json']) {
    try {
      const res = await fetch(`https://huggingface.co/${repoId}/raw/main/${path}`, { signal });
      if (res.ok) return (await res.json()) as { top_p?: number; repetition_penalty?: number };
    } catch {
      // network/abort — fall through
    }
  }
  return null;
}
