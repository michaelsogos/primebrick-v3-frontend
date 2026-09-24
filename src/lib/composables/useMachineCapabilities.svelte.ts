/**
 * useMachineCapabilities — empirical browser-local machine benchmark.
 *
 * Measures what the machine can actually do for browser-local LLM inference:
 *   - memory bandwidth (GB/s)   — in-place saxpy over a <=128MB storage buffer
 *   - compute (GFLOPS fp32)     — serial-dependency FMA chains, adaptive depth
 *   - VRAM dedicated (MB)       — bandwidth-vs-footprint knee detection
 *   - fast memory (MB)          — highest footprint sustaining bandwidth
 *   - GPU name                  — WebGL WEBGL_debug_renderer_info (unmasked)
 *
 * Methodology (empirically validated on Edge 153 / Opera GX 135 / Chromium 149):
 *   - `timestamp-query` resolves to 0 in production browsers → wall-clock only.
 *   - `mapAsync` on an independent buffer is NOT a queue fence;
 *     `onSubmittedWorkDone()` resolves early → the fence is
 *     `copyBufferToBuffer(output) + mapAsync` on the produced buffer.
 *   - `maxStorageBufferBindingSize` = 128MB → work buffers stay <=128MB per
 *     binding; `maxComputeWorkgroupsPerDimension` = 65535 → grid-stride loops.
 *   - First-touch/page-in (~150ms first access) is warmed up before timing.
 *   - `uncapturederror` is captured for the whole run — any validation error
 *     invalidates the affected measurement (silent no-op dispatches fake times).
 *   - Knee probe early-stops after 2 consecutive bandwidth drops below 50% of
 *     plateau (dGPU: ~4s, never touches shared RAM). The ladder is bounded by
 *     `min(12GB, deviceMemory × 0.75)`: a machine that is already memory-tight
 *     cannot be pushed into OOM by a probe — the browser cannot read free RAM,
 *     so 75% of total RAM is the unconditional safety bound.
 *
 * `measure()` runs the light benchmark (bandwidth + flops, ~2s).
 * `probeVram()` runs the heavier VRAM ladder — on-demand only, never automatic.
 * Results persist in localStorage with a 24h TTL: the bench re-runs
 * automatically only when the TTL expired (and the page is opened), or on
 * explicit CTA.
 */
import type { DeepReadonly } from '$lib/types/deep-readonly';

export interface MachineCapabilities {
  available: boolean;
  bandwidth_gbs: number | null;
  gflops: number | null;
  /** Dedicated VRAM detected via bandwidth knee — null when no knee appeared
   *  within the probe bound (unified memory, or VRAM larger than needed). */
  vram_dedicated_mb: number | null;
  /** True when the full probe footprint sustained high bandwidth — every
   *  cataloged model fits. Null when the probe stopped early (safety cap,
   *  OOM, device lost) without a verdict. */
  memory_fits_catalog: boolean | null;
  /** Highest footprint (MB) where bandwidth stayed fast — the knee point, or
   *  the ladder cap when no knee appeared. Lower bound of fast memory. */
  memory_fast_mb: number | null;
  /** Clean GPU model name — ANGLE wrapper and driver internals stripped. */
  gpu_name: string | null;
  /** Brand vendor detected from the renderer name: nvidia|amd|intel|apple|software|generic. */
  gpu_vendor: string | null;
  adapter_vendor: string | null;
  adapter_architecture: string | null;
  /** System RAM reported by navigator.deviceMemory (GB, privacy-capped) — NOT VRAM. */
  system_memory_gb: number | null;
  /** Logical CPU threads (navigator.hardwareConcurrency). */
  cpu_threads: number | null;
  /** Raw observations — kept for transparency/debugging, never smoothed. */
  raw: {
    bandwidth_runs: { gbs: number; all_ms: number[] }[];
    flops_runs: { gflops: number; all_ms: number[] }[];
    knee_points: { mb: number; gbs: number }[];
  };
  errors: string[];
}

const CHUNK = 128 * 1048576; // <= maxStorageBufferBindingSize (128MB observed)
const WGX = 65535; // == maxComputeWorkgroupsPerDimension
// Probe ladder — bounded by the catalog's largest working set (~9.5GB) plus
// headroom: we only need to know whether that footprint sustains full
// bandwidth, not how much GPU memory exists in absolute terms.
const KNEE_LADDER_MB = [1024, 2048, 4096, 6144, 8192, 10240, 12288];
/** Headroom reserved for OS/browser/KV overhead inside GPU memory (MB). */
const HEADROOM_MB = 1536;
/** Top working_set_mb of each model power_level bucket (from the catalog
 *  distribution: lvl2 <2.2GB, lvl3 <4GB, lvl4 <7GB, lvl5 ~9.5GB). */
const LEVEL_REQUIREMENT_MB: Record<number, number> = { 1: 1200, 2: 2200, 3: 4000, 4: 7000, 5: 9500 };

const _state = $state<{
  caps: MachineCapabilities | null;
  measuring: boolean;
  probing_vram: boolean;
  measured_at: number | null;
}>({ caps: null, measuring: false, probing_vram: false, measured_at: null });

// localStorage persistence — 24h TTL. Re-measure happens only via explicit
// CTA or automatically when the TTL has expired AND the /ai page is opened.
const STORAGE_KEY = 'primebrick:machine-capabilities';
const TTL_MS = 24 * 60 * 60 * 1000;

function saveCached() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ caps: _state.caps, measured_at: _state.measured_at }),
    );
  } catch {
    // storage full / denied — persistence is best-effort
  }
}

/** Hydrates _state from localStorage. Returns false when nothing valid. */
function hydrate(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw) as { caps?: MachineCapabilities; measured_at?: number };
    if (!data.caps || typeof data.measured_at !== 'number') return false;
    _state.caps = data.caps;
    _state.measured_at = data.measured_at;
    return true;
  } catch {
    return false;
  }
}

function isStale(): boolean {
  return _state.measured_at === null || Date.now() - _state.measured_at > TTL_MS;
}

// WebGPU flag constants — the DOM lib exposes the GPU* interfaces but not the
// global flag objects in this TS version; values are fixed by the spec.
const BUF_MAP_READ = 0x0001;
const BUF_COPY_SRC = 0x0004;
const BUF_COPY_DST = 0x0008;
const BUF_STORAGE = 0x0080;
const MAP_READ = 0x0001 as GPUMapModeFlags;

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

function emptyCaps(): MachineCapabilities {
  return {
    available: false,
    bandwidth_gbs: null,
    gflops: null,
    vram_dedicated_mb: null,
    memory_fits_catalog: null,
    memory_fast_mb: null,
    gpu_name: null,
    gpu_vendor: null,
    adapter_vendor: null,
    adapter_architecture: null,
    system_memory_gb: null,
    cpu_threads: null,
    raw: { bandwidth_runs: [], flops_runs: [], knee_points: [] },
    errors: [],
  };
}

/**
 * Parses the WebGL unmasked renderer into { cleanName, vendor }.
 *
 * Observed ANGLE formats:
 *   "ANGLE (NVIDIA, NVIDIA GeForce RTX 5080 Laptop GPU (0x00002C59) Direct3D11 vs_5_0 ps_5_0, D3D11)"
 *   "ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)"
 *   "ANGLE (Intel, Intel(R) Arc(TM) Graphics Direct3D11 ..., D3D11)"
 *   "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device ...), SwiftShader driver)"
 */
function parseGpuRenderer(raw: string): { name: string; vendor: string } {
  let name = raw;
  const m = raw.match(/^ANGLE\s*\((.+)\)$/);
  if (m) {
    // Split on commas NOT inside parens (renderer names contain "(0x..)" hex ids).
    const inner = m[1];
    const parts: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of inner) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(cur);
        cur = '';
      } else cur += ch;
    }
    parts.push(cur);
    name = (parts[1] ?? parts[0]).trim();
    // "ANGLE Metal Renderer: Apple M4" → take the part after the colon
    const colon = name.indexOf(':');
    if (colon >= 0) name = name.slice(colon + 1).trim();
  }
  name = name
    .replace(/\s*\(0x[0-9A-Fa-f]+\)/g, '')
    .replace(/\s*Direct3D.*$/i, '')
    .replace(/\s*Vulkan.*$/i, '')
    .replace(/\(R\)|\(TM\)|®|™/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const hay = `${raw} ${name}`;
  let vendor = 'generic';
  if (/swiftshader|llvmpipe|software/i.test(hay)) vendor = 'software';
  else if (/nvidia|geforce|quadro|rtx|gtx/i.test(hay)) vendor = 'nvidia';
  else if (/\bamd\b|radeon/i.test(hay)) vendor = 'amd';
  else if (/apple|metal renderer|\bM\d\b/i.test(hay)) vendor = 'apple';
  else if (/intel|iris|uhd graphics|\barc\b/i.test(hay)) vendor = 'intel';
  else if (/adreno|mali|immortalis|videocore/i.test(hay)) vendor = 'generic';
  return { name, vendor };
}

function detectGpu(): { name: string; vendor: string } | null {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return null;
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    if (typeof renderer !== 'string' || !renderer) return null;
    return parseGpuRenderer(renderer);
  } catch {
    return null;
  }
}

const SAXPY_SHADER =
  '@group(0) @binding(0) var<storage,read_write> a: array<f32>;' +
  '@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) g: vec3u) {' +
  ' let n = arrayLength(&a); let stride = 16776960u;' +
  ' for (var i = g.x; i < n; i += stride) { a[i] = a[i] + 1.0; } }';

interface BenchCtx {
  dev: GPUDevice;
  errors: string[];
  rb: GPUBuffer;
  saxpyPipe: GPUComputePipeline;
  /** True once dev.lost resolves (OOM kill, driver reset). */
  isLost: () => boolean;
  /** Fence: copy produced buffer -> rb -> mapAsync. Returns elapsed ms. */
  submit: (build: (e: GPUCommandEncoder) => void, outBuf: GPUBuffer) => Promise<number>;
}

async function makeCtx(): Promise<BenchCtx | null> {
  if (!('gpu' in navigator)) return null;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;
  const dev = await adapter.requestDevice();
  const errors: string[] = [];
  dev.addEventListener('uncapturederror', (e) => errors.push(e.error.message.slice(0, 120)));
  let deviceLost = false;
  dev.lost.then(() => { deviceLost = true; });
  const rb = dev.createBuffer({ size: 16, usage: BUF_COPY_DST | BUF_MAP_READ });
  const saxpyMod = dev.createShaderModule({ code: SAXPY_SHADER });
  const saxpyPipe = dev.createComputePipeline({
    layout: 'auto',
    compute: { module: saxpyMod, entryPoint: 'main' },
  });
  const submit = async (build: (e: GPUCommandEncoder) => void, outBuf: GPUBuffer) => {
    const e = dev.createCommandEncoder();
    build(e);
    e.copyBufferToBuffer(outBuf, 0, rb, 0, 16);
    dev.queue.submit([e.finish()]);
    const t0 = performance.now();
    await rb.mapAsync(MAP_READ);
    rb.unmap();
    return performance.now() - t0;
  };
  return { dev, errors, rb, saxpyPipe, isLost: () => deviceLost, submit };
}

function saxpyPass(e: GPUCommandEncoder, pipe: GPUComputePipeline, bg: GPUBindGroup) {
  const p = e.beginComputePass();
  p.setPipeline(pipe);
  p.setBindGroup(0, bg);
  p.dispatchWorkgroups(WGX, 1);
  p.end();
}

/** Bandwidth on a single <=128MB buffer, N serialized passes per submit. */
async function benchBandwidth(ctx: BenchCtx, passes = 8, reps = 8) {
  const buf = ctx.dev.createBuffer({ size: CHUNK, usage: BUF_STORAGE | BUF_COPY_SRC });
  const bg = ctx.dev.createBindGroup({
    layout: ctx.saxpyPipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: buf } }],
  });
  const build = (e: GPUCommandEncoder) => {
    for (let i = 0; i < passes; i++) saxpyPass(e, ctx.saxpyPipe, bg);
  };
  // warmup + page-in
  await ctx.submit(build, buf);
  const times: number[] = [];
  for (let r = 0; r < reps; r++) times.push((await ctx.submit(build, buf)) / passes);
  buf.destroy();
  const sec = median(times) / 1000;
  return { gbs: +(2 * CHUNK / sec / 1e9).toFixed(1), all_ms: times.map((t) => +t.toFixed(3)) };
}

/** Compute: serial-dependency FMA chains — cannot be folded or parallelized
 *  within a thread; adaptive inner-loop depth targets ~60ms per dispatch. */
async function benchFlops(ctx: BenchCtx, wgx = 4096, targetMs = 60, reps = 5) {
  const buf = ctx.dev.createBuffer({ size: 16, usage: BUF_STORAGE | BUF_COPY_SRC });
  const makePipe = (inner: number) =>
    ctx.dev.createComputePipeline({
      layout: 'auto',
      compute: {
        module: ctx.dev.createShaderModule({
          code:
            '@group(0) @binding(0) var<storage,read_write> o: array<f32>;' +
            '@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) g: vec3u) {' +
            ' var b = f32(g.x) * 1.0000001 + 0.5;' +
            ' var a0 = 0.11; var a1 = 0.23; var a2 = 0.37; var a3 = 0.41;' +
            ' var a4 = 0.53; var a5 = 0.67; var a6 = 0.71; var a7 = 0.83;' +
            ' for (var k = 0u; k < ' +
            inner +
            'u; k++) {' +
            '   a0 = fma(a0, b, a7); a1 = fma(a1, b, a0); a2 = fma(a2, b, a1); a3 = fma(a3, b, a2);' +
            '   a4 = fma(a4, b, a3); a5 = fma(a5, b, a4); a6 = fma(a6, b, a5); a7 = fma(a7, b, a6);' +
            ' }' +
            ' var acc = a0+a1+a2+a3+a4+a5+a6+a7;' +
            ' if (acc == 12345.678) { o[g.x % 4u] = acc; } }',
        }),
        entryPoint: 'main',
      },
    });
  const dispatch = (pipe: GPUComputePipeline) => (e: GPUCommandEncoder) => {
    const bg = ctx.dev.createBindGroup({
      layout: pipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: buf } }],
    });
    const p = e.beginComputePass();
    p.setPipeline(pipe);
    p.setBindGroup(0, bg);
    p.dispatchWorkgroups(wgx, 1);
    p.end();
  };
  // probe to calibrate inner depth
  const probePipe = makePipe(2048);
  await ctx.submit(dispatch(probePipe), buf); // warmup + compile
  const probeMs = await ctx.submit(dispatch(probePipe), buf);
  const inner = Math.max(2048, Math.round((2048 * targetMs) / Math.max(probeMs, 0.05)));
  const pipe = makePipe(inner);
  await ctx.submit(dispatch(pipe), buf); // warmup the real pipeline
  const times: number[] = [];
  for (let r = 0; r < reps; r++) times.push(await ctx.submit(dispatch(pipe), buf));
  buf.destroy();
  const flops = wgx * 256 * inner * 8 * 2;
  return { gflops: +(flops / (median(times) / 1000) / 1e9).toFixed(1), all_ms: times.map((t) => +t.toFixed(1)) };
}

/**
 * VRAM probe — ascending footprint ladder of 128MB chunks, bounded by the
 * catalog's largest working set + headroom (12GB). Early-stops at the
 * bandwidth knee (dGPU); if no knee appears, high bandwidth was sustained
 * across the whole catalog footprint — every model fits, and whether the
 * memory is "dedicated" or unified is irrelevant. Never allocates to OOM,
 * never runs automatically.
 */
async function probeVramLadder(ctx: BenchCtx, caps: MachineCapabilities) {
  const chunks: GPUBuffer[] = [];
  const lay = ctx.saxpyPipe.getBindGroupLayout(0);

  async function measure(nChunks: number): Promise<number> {
    const bgs = chunks.slice(0, nChunks).map((buf) =>
      ctx.dev.createBindGroup({ layout: lay, entries: [{ binding: 0, resource: { buffer: buf } }] }),
    );
    const build = (e: GPUCommandEncoder) => {
      for (const bg of bgs) saxpyPass(e, ctx.saxpyPipe, bg);
    };
    await ctx.submit(build, chunks[nChunks - 1]); // page-in
    const times: number[] = [];
    for (let r = 0; r < 2; r++) times.push(await ctx.submit(build, chunks[nChunks - 1]));
    const ms = median(times);
    return (2 * CHUNK * nChunks) / (ms / 1000) / 1e9;
  }

  // Defensive bound: never allocate more than 75% of system RAM — the browser
  // cannot read free memory, so a machine already under memory pressure would
  // be pushed into OOM by a bigger probe. 12GB covers the whole catalog.
  const capMb = Math.min(
    KNEE_LADDER_MB[KNEE_LADDER_MB.length - 1],
    Math.floor((caps.system_memory_gb ?? 8) * 1024 * 0.75),
  );

  let plateau = 0;
  let drops = 0;
  let oom = false;
  for (const mb of KNEE_LADDER_MB) {
    if (mb > capMb) break;
    const need = Math.round(mb / 128);
    while (chunks.length < need) {
      if (ctx.isLost()) { oom = true; break; }
      ctx.dev.pushErrorScope('out-of-memory');
      const buf = ctx.dev.createBuffer({ size: CHUNK, usage: BUF_STORAGE | BUF_COPY_SRC });
      const err = await ctx.dev.popErrorScope();
      if (err) {
        buf.destroy();
        oom = true;
        break;
      }
      chunks.push(buf);
    }
    if (oom) break;
    const gbs = await measure(need);
    caps.raw.knee_points.push({ mb, gbs: +gbs.toFixed(1) });
    plateau = Math.max(plateau, gbs);
    if (plateau > 0 && gbs < plateau * 0.5) {
      drops++;
      if (drops >= 2) {
        // knee = last point before the sustained drop
        caps.vram_dedicated_mb = caps.raw.knee_points[caps.raw.knee_points.length - 3]?.mb ?? mb;
        break;
      }
    } else drops = 0;
  }

  // Fast memory = knee point if found, else the highest footprint measured.
  const lastMb = caps.raw.knee_points[caps.raw.knee_points.length - 1]?.mb ?? null;
  caps.memory_fast_mb = caps.vram_dedicated_mb ?? lastMb;
  // fits = bandwidth stayed high across the full 12GB catalog footprint.
  // Null when the safety cap stopped the probe early (verdict unknown).
  caps.memory_fits_catalog =
    !oom && lastMb !== null && lastMb >= KNEE_LADDER_MB[KNEE_LADDER_MB.length - 1]
      ? true
      : caps.vram_dedicated_mb !== null || oom
        ? false
        : null;
  for (const b of chunks) b.destroy();
}

async function measure(): Promise<void> {
  if (_state.measuring) return;
  _state.measuring = true;
  try {
    const caps = _state.caps ?? emptyCaps();
    const ctx = await makeCtx();
    if (!ctx) {
      caps.available = false;
      _state.caps = caps;
      return;
    }
    caps.available = true;
    const gpu = detectGpu();
    caps.gpu_name = gpu?.name ?? null;
    caps.gpu_vendor = gpu?.vendor ?? null;
    const nav = navigator as Navigator & { deviceMemory?: number };
    caps.system_memory_gb = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
    caps.cpu_threads =
      typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null;
    const info = (ctx.dev as unknown as { adapterInfo?: GPUAdapterInfo }).adapterInfo;
    caps.adapter_vendor = info?.vendor ?? null;
    caps.adapter_architecture = info?.architecture ?? null;

    caps.raw.bandwidth_runs = [];
    caps.raw.flops_runs = [];
    for (let blk = 0; blk < 3; blk++) {
      caps.raw.bandwidth_runs.push(await benchBandwidth(ctx));
      await new Promise((r) => setTimeout(r, 300));
    }
    for (let blk = 0; blk < 3; blk++) {
      caps.raw.flops_runs.push(await benchFlops(ctx));
      await new Promise((r) => setTimeout(r, 300));
    }
    caps.bandwidth_gbs = median(caps.raw.bandwidth_runs.map((r) => r.gbs));
    caps.gflops = median(caps.raw.flops_runs.map((r) => r.gflops));
    caps.errors = ctx.errors;
    ctx.dev.destroy();
    _state.caps = caps;
    _state.measured_at = Date.now();
    saveCached();
  } finally {
    _state.measuring = false;
  }
}

/** On-demand VRAM probe — heavier; allocates up to the knee (dGPU) or the
 *  full shared budget (iGPU). Call only from an explicit user action. */
async function probeVram(): Promise<void> {
  if (_state.probing_vram) return;
  _state.probing_vram = true;
  try {
    const caps = _state.caps ?? emptyCaps();
    const ctx = await makeCtx();
    if (!ctx) {
      caps.available = false;
      _state.caps = caps;
      return;
    }
    caps.available = true;
    if (!caps.gpu_name) {
      const gpu = detectGpu();
      caps.gpu_name = gpu?.name ?? null;
      caps.gpu_vendor = gpu?.vendor ?? null;
    }
    await probeVramLadder(ctx, caps);
    caps.errors = [...caps.errors, ...ctx.errors].slice(0, 10);
    ctx.dev.destroy();
    _state.caps = caps;
    _state.measured_at = Date.now();
    saveCached();
  } finally {
    _state.probing_vram = false;
  }
}

/**
 * Machine rank = highest model power_level whose working-set requirement
 * fits the measured fast memory (knee point, or probe footprint when no
 * knee appeared) minus headroom. Lower bound on safety-capped probes.
 * Null until probeVram() has produced a memory measurement.
 */
const machineRank = $derived.by<number | null>(() => {
  const fast = _state.caps?.memory_fast_mb;
  if (fast == null) return null;
  const free = fast - HEADROOM_MB;
  let rank = 1;
  for (const lvl of [1, 2, 3, 4, 5]) {
    if (free >= LEVEL_REQUIREMENT_MB[lvl]) rank = lvl;
  }
  return rank;
});

export function useMachineCapabilities() {
  return {
    get state(): DeepReadonly<typeof _state> {
      return _state as DeepReadonly<typeof _state>;
    },
    get machineRank(): number | null {
      return machineRank;
    },
    measure,
    probeVram,
    /** Full refresh — light bench + bounded VRAM ladder. Single CTA path. */
    refresh: async () => {
      await measure();
      await probeVram();
    },
    hydrate,
    isStale,
  };
}
