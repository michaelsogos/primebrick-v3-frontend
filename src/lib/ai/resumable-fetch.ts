/**
 * resumable-fetch.ts — `env.fetch` override for Transformers.js that makes
 * large remote model downloads resumable.
 *
 * Why fetch and not `env.customCache`: `loadResourceFile` (transformers.js
 * hub.js) fetches the whole file, buffers it via `readResponse`, and only
 * THEN calls `cache.put` with the complete response — an interruption kills
 * the download before `put` ever runs, so a cache-layer resume is
 * impossible. `env.fetch` (documented hook, env.js) is called for EVERY
 * remote file via `getFile`, before the buffering: returning a
 * `Response(ReadableStream)` lets us emit already-persisted shards first
 * and continue the network download with `Range:` from the first missing
 * shard. Transformers sees a normal 200 response; progress and the final
 * `cache.put` into `transformers-cache` work unchanged.
 *
 * Layout inside the dedicated Cache API store `hf-resumable`:
 *   `${url}?__resume_manifest` → JSON ShardManifest
 *   `${url}?__resume_shard=${i}` → Response holding shard bytes
 * Keys are synthetic-but-valid URLs; `extractModelId`/`extractVariantKey`
 * in use-model-cache still resolve them to the owning model (pathname is
 * unchanged, dtype suffix is a substring of the last segment), so the
 * storage bar and deleteModel work with no special-casing.
 *
 * Verified empirically: huggingface.co resolve URLs 302-redirect to the
 * xet CDN which answers `Range:` requests with 206 and exposes
 * `Accept-Ranges: bytes` + content-hash `ETag`/`X-Linked-ETag`.
 */

const SHARD_CACHE_NAME = 'hf-resumable';
const SHARD_SIZE = 64 * 1024 * 1024; // 64MB

/** huggingface.co resolve URLs (and HF-owned CDNs, just in case). */
const HF_HOST_RE =
  /^https:\/\/(?:huggingface\.co|[^/.]+\.hf\.co|[^/.]+\.xethub\.hf\.co)\//i;

interface ShardManifest {
  /** Content validator from the response that started the download. */
  etag: string | null;
  /** Total file size in bytes. */
  size: number;
  /**
   * Number of contiguous shards fully persisted — shards 0..done_count-1
   * are guaranteed present. Writes are chained so this never skips a gap.
   */
  done_count: number;
}

const manifestKey = (url: string) => `${url}?__resume_manifest`;
const shardKey = (url: string, i: number) => `${url}?__resume_shard=${i}`;

/**
 * Live-network byte reporter. The worker registers a sink once per model
 * load; we invoke it for every chunk that arrived from the CDN — replayed
 * cache shards are deliberately NOT counted (local reads would report
 * fake GB/s on the speed meter).
 */
export type ByteReporter = (delta_bytes: number) => void;
let report_bytes: ByteReporter | null = null;
export function setByteReporter(fn: ByteReporter | null): void {
  report_bytes = fn;
}

/** Diagnostic breadcrumbs — the composable logs these to the console. */
function dbg(step: string, extra?: Record<string, unknown>): void {
  try {
    // Only in dedicated workers — page.postMessage would emit window events.
    const g = globalThis as any;
    if (typeof g.DedicatedWorkerGlobalScope !== 'undefined' && g.self instanceof g.DedicatedWorkerGlobalScope) {
      g.postMessage({ type: 'debug', step: `rfetch:${step}`, ...extra });
    }
  } catch {
    /* ignore */
  }
}

function etagOf(resp: Response): string | null {
  return resp.headers.get('x-linked-etag') ?? resp.headers.get('etag');
}

async function readManifest(cache: Cache, url: string): Promise<ShardManifest | null> {
  try {
    const r = await cache.match(manifestKey(url));
    if (!r) return null;
    const m = (await r.json()) as ShardManifest;
    return typeof m?.size === 'number' && typeof m?.done_count === 'number' ? m : null;
  } catch {
    return null;
  }
}

async function writeManifest(cache: Cache, url: string, m: ShardManifest): Promise<void> {
  try {
    await cache.put(manifestKey(url), new Response(JSON.stringify(m)));
  } catch {
    // Quota/unsupported — resume data just won't persist.
  }
}

async function deleteShardEntries(cache: Cache, url: string, count: number): Promise<void> {
  const jobs: Promise<boolean>[] = [cache.delete(manifestKey(url))];
  for (let i = 0; i < count; i++) jobs.push(cache.delete(shardKey(url, i)));
  await Promise.allSettled(jobs);
}

/**
 * Accumulates downstream chunks into shard-sized blobs and persists each
 * completed shard to the cache. `done_count` is committed through a
 * sequential promise chain so a failed shard never leaves a gap that a
 * later resume would silently skip.
 */
function shardWriter(cache: Cache, url: string, manifest: ShardManifest, start_index: number) {
  let idx = start_index;
  let parts: Uint8Array[] = [];
  let buffered = 0;
  let chain = Promise.resolve();
  let quota_exceeded = false;

  const flush = () => {
    if (buffered === 0) return;
    const blob = new Blob(parts as BlobPart[]);
    parts = [];
    buffered = 0;
    const i = idx++;
    chain = chain.then(async () => {
      if (quota_exceeded) return;
      try {
        await cache.put(shardKey(url, i), new Response(blob));
        manifest.done_count = i + 1;
        await writeManifest(cache, url, manifest);
      } catch {
        quota_exceeded = true; // keep streaming; stop persisting
      }
    });
  };

  return {
    push(chunk: Uint8Array) {
      // Slice at exact SHARD_SIZE boundaries — resume math
      // (offset = done_count * SHARD_SIZE) requires shard i to cover
      // exactly bytes [i*SHARD_SIZE, (i+1)*SHARD_SIZE).
      let off = 0;
      while (off < chunk.length) {
        const room = SHARD_SIZE - buffered;
        const slice = chunk.subarray(off, off + Math.min(room, chunk.length - off));
        parts.push(slice);
        buffered += slice.length;
        off += slice.length;
        if (buffered === SHARD_SIZE) flush();
      }
    },
    async end() {
      flush();
      await chain;
    },
  };
}

/**
 * A dead-but-not-closed connection (CDN stall, silent socket drop) leaves
 * `reader.read()` pending forever — observed empirically as a download that
 * freezes mid-file with no error. Race every read against a stall timer:
 * on stall we cancel the dead body and reopen a `Range:` request from the
 * last delivered byte (bounded retries), so the stream self-heals instead
 * of hanging the whole model init.
 */
const STALL_MS = 60_000;
const MAX_STALLS = 8;
const STALL = Symbol('stall');

/**
 * Live-stream semaphore — bounds parallel network bodies.
 * Fully parallel fetches used to die mid-flight (~56MB each) and aborted
 * sockets saturated the per-host pool, making every new fetch fail instantly.
 * Now that every read races a stall timer and dead bodies reconnect with a
 * `Range:` request (self-healing), bounded parallelism is safe again:
 * 4 slots ≈ the max external-data files per model.
 */
let live_slots = 0;
const LIVE_MAX = 4;
const live_waiters: (() => void)[] = [];
async function acquireLive(): Promise<void> {
  if (live_slots < LIVE_MAX) {
    live_slots++;
    return;
  }
  await new Promise<void>((r) => live_waiters.push(r));
  live_slots++;
}
function releaseLive(): void {
  live_slots--;
  live_waiters.shift()?.();
}

/** Backoff between reconnects — instant retry storms get killed instantly. */
const backoff = (stalls: number) =>
  new Promise<void>((r) => setTimeout(r, Math.min(2000 * stalls, 15000)));

function stallTimer(): Promise<typeof STALL> {
  return new Promise((r) => setTimeout(() => r(STALL), STALL_MS));
}

/** Pull-based tee: forwards body chunks downstream while feeding the writer. */
function teeStream(
  body: ReadableStream<Uint8Array>,
  writer: ReturnType<typeof shardWriter>,
  onDone?: () => Promise<void>,
  reconnect?: (delivered: number) => Promise<ReadableStream<Uint8Array> | null>,
): ReadableStream<Uint8Array> {
  let reader = body.getReader();
  let cancelled = false;
  let delivered = 0;
  let stalls = 0;
  let holds_live = false;
  const release = () => {
    if (holds_live) {
      holds_live = false;
      releaseLive();
    }
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!holds_live) {
        await acquireLive();
        holds_live = true;
      }
      // Keep reading within the same pull after a reconnect — see
      // shardReplayStream for why returning early deadlocks the consumer.
      for (;;) {
        const res = await Promise.race([reader.read(), stallTimer()]).catch((e) => {
          dbg('read_reject', { delivered, err: String(e) });
          return 'READ_ERR' as const;
        });
        if (res === 'READ_ERR' || res === STALL) {
          stalls++;
          void reader.cancel();
          dbg(res === STALL ? 'stall' : 'read_err', { delivered, stalls });
          if (stalls > MAX_STALLS || !reconnect) {
            release();
            controller.error(new Error(`hf-resumable: stream stalled ${stalls}×`));
            return;
          }
          await backoff(stalls);
          const nb = await reconnect(delivered).catch(() => null);
          if (!nb) {
            release();
            controller.error(new Error('hf-resumable: stall reconnect failed'));
            return;
          }
          dbg('reconnected', { delivered });
          reader = nb.getReader();
          continue;
        }
        const { done, value } = res;
        // NOTE: cancelling our stream resolves the pending underlying read()
        // with done=true — do NOT treat that as a clean completion: shards
        // must survive so the download can resume.
        if (done) {
          release();
          if (!cancelled) {
            await writer.end();
            await onDone?.();
            controller.close();
          }
          return;
        }
        if (value && !cancelled) {
          stalls = 0;
          writer.push(value);
          controller.enqueue(value);
          delivered += value.length;
          report_bytes?.(value.length);
        }
        return;
      }
    },
    cancel(reason) {
      cancelled = true;
      release();
      void reader.cancel(reason);
    },
  });
}

/** Opens a Range request from `offset`; returns the body only on a valid 206. */
async function rangeBody(
  url: string,
  offset: number,
  expected_total?: number,
): Promise<ReadableStream<Uint8Array> | null> {
  const resp = await fetch(url, { redirect: 'follow', headers: { Range: `bytes=${offset}-` } });
  if (resp.status !== 206 || !resp.body) {
    void resp.body?.cancel();
    return null;
  }
  if (expected_total !== undefined) {
    const total = Number((resp.headers.get('content-range') ?? '').split('/')[1]);
    if (total !== expected_total) {
      void resp.body.cancel();
      return null;
    }
  }
  return resp.body;
}

/** Fresh download: stream the response while persisting shards. */
async function fetchAndShard(
  cache: Cache,
  url: string,
  input: any,
  init: any,
): Promise<Response> {
  const resp = await fetch(input, init);
  if (!resp.ok || !resp.body) return resp;

  const size = Number(resp.headers.get('content-length') ?? 0);
  if (!size || size < SHARD_SIZE) return resp; // small files: passthrough

  const manifest: ShardManifest = { etag: etagOf(resp), size, done_count: 0 };
  await writeManifest(cache, url, manifest);
  const stream = teeStream(
    resp.body,
    shardWriter(cache, url, manifest, 0),
    () =>
      // Stream consumed → transformers stores the full file in its own cache
      // right after this; shards become redundant. Delete them so we never
      // hold the same bytes twice.
      deleteShardEntries(cache, url, manifest.done_count),
    (delivered) => rangeBody(url, delivered, size),
  );
  return new Response(stream, { status: 200, headers: resp.headers });
}

/**
 * Resume: emits persisted shards first, then continues the network download
 * with `Range: bytes={offset}-`. Falls back to a fresh download when the
 * server ignores Range (200), the manifest is stale, or a shard is missing.
 */
async function resumeResponse(
  cache: Cache,
  url: string,
  manifest: ShardManifest,
): Promise<Response | null> {
  const offset = manifest.done_count * SHARD_SIZE;

  // Preflight: every persisted shard must still be in the cache.
  for (let i = 0; i < manifest.done_count; i++) {
    if (!(await cache.match(shardKey(url, i)))) return null;
  }

  // Whole file already sharded (transformers' final put must have failed):
  // serve entirely from shards, no network needed.
  if (offset >= manifest.size) {
    const headers = new Headers();
    headers.set('content-length', String(manifest.size));
    return new Response(
      shardReplayStream(cache, url, manifest.done_count, null, manifest),
      { status: 200, headers },
    );
  }

  // HEADERS-ONLY probe: validates Range support + etag, then the body is
  // cancelled immediately. The live continuation is opened lazily inside the
  // stream once it reaches the live section and holds the live semaphore —
  // holding 4 open-but-unread probe bodies saturated the connection pool and
  // got every subsequent connection killed (empirical).
  const probe = await fetch(url, {
    redirect: 'follow',
    headers: { Range: `bytes=${offset}-` },
  }).catch((e) => {
    dbg('probe_reject', { url: url.split('/').pop(), offset, err: String(e) });
    throw e;
  });

  const etag = etagOf(probe);
  const total = Number((probe.headers.get('content-range') ?? '').split('/')[1]);
  const valid =
    probe.status === 206 &&
    total === manifest.size &&
    (!manifest.etag || !etag || etag === manifest.etag);
  void probe.body?.cancel();
  dbg('probe_ok', { url: url.split('/').pop(), status: probe.status, offset });

  if (!valid) {
    // 200 (Range ignored) or stale manifest — restart clean.
    return null;
  }

  const headers = new Headers(probe.headers);
  headers.delete('content-range');
  headers.set('content-length', String(manifest.size));
  const stream = shardReplayStream(
    cache,
    url,
    manifest.done_count,
    () => rangeBody(url, offset, manifest.size),
    manifest,
  );
  return new Response(stream, { status: 200, headers });
}

/**
 * Stream = stored shards 0..count-1 (from cache), then the live range body
 * whose chunks are persisted as new shards starting at `count`.
 */
function shardReplayStream(
  cache: Cache,
  url: string,
  count: number,
  liveSource: (() => Promise<ReadableStream<Uint8Array> | null>) | null,
  manifest?: ShardManifest,
): ReadableStream<Uint8Array> {
  let shard_idx = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let writer: ReturnType<typeof shardWriter> | null = null;
  let cancelled = false;
  let live_delivered = 0;
  let stalls = 0;
  let reader_used = false;
  let holds_live = false;
  const release = () => {
    if (holds_live) {
      holds_live = false;
      releaseLive();
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (cancelled) return;
      if (shard_idx < count) {
        const r = await cache.match(shardKey(url, shard_idx));
        if (!r) {
          controller.error(new Error(`hf-resumable: shard ${shard_idx} lost`));
          return;
        }
        controller.enqueue(new Uint8Array(await r.arrayBuffer()));
        shard_idx++;
        return;
      }
      if (!liveSource) {
        // Full replay from shards — transformers re-caches the file;
        // shard copies are redundant from here on.
        if (manifest) await deleteShardEntries(cache, url, manifest.done_count);
        controller.close();
        return;
      }
      writer ??= manifest ? shardWriter(cache, url, manifest, count) : null;
      // Serialize live streaming across files — parallel CDN bodies saturate
      // the per-host connection pool and die mid-flight (empirical). The live
      // body is opened only now, while holding the semaphore — never before.
      if (!holds_live) {
        await acquireLive();
        holds_live = true;
      }
      if (!reader) {
        const body = await liveSource().catch(() => null);
        if (!body) {
          release();
          controller.error(new Error('hf-resumable: live range request failed'));
          return;
        }
        reader = body.getReader();
        if (!reader_used) {
          reader_used = true;
          dbg('replay_live_start', { url: url.split('/').pop(), count });
        }
      }
      // Loop inside pull: after a stall/read-error reconnect we keep reading
      // the new body in the SAME pull — relying on the stream to re-invoke
      // pull() after an empty resolution leaves the consumer's pending read()
      // unanswered forever (observed empirically: reconnect → dead silence).
      for (;;) {
        const res = await Promise.race([reader.read(), stallTimer()]).catch((e) => {
          dbg('replay_read_reject', { live_delivered, err: String(e) });
          return 'READ_ERR' as const;
        });
        if (res === 'READ_ERR' || res === STALL) {
          stalls++;
          void reader.cancel();
          dbg(res === STALL ? 'replay_stall' : 'replay_read_err', { live_delivered, stalls });
          // Resume the live portion from the last delivered byte — the
          // persisted-shard part is unchanged (offset stays count*SHARD_SIZE).
          if (stalls > MAX_STALLS) {
            release();
            controller.error(new Error(`hf-resumable: stream stalled ${stalls}×`));
            return;
          }
          await backoff(stalls);
          const nb = await rangeBody(url, count * SHARD_SIZE + live_delivered, manifest?.size).catch(
            () => null,
          );
          if (!nb) {
            release();
            controller.error(new Error('hf-resumable: stall reconnect failed'));
            return;
          }
          dbg('replay_reconnected', { live_delivered });
          reader = nb.getReader();
          continue;
        }
        const { done, value } = res;
        // Pending read() resolves done=true on cancel — see teeStream.
        if (done) {
          release();
          if (!cancelled) {
            await writer?.end();
            if (manifest) await deleteShardEntries(cache, url, manifest.done_count);
            controller.close();
          }
          return;
        }
        if (value) {
          stalls = 0;
          writer?.push(value);
          controller.enqueue(value);
          live_delivered += value.length;
          report_bytes?.(value.length);
        }
        return;
      }
    },
    cancel(reason) {
      cancelled = true;
      release();
      void reader?.cancel(reason);
    },
  });
}

/**
 * Drop-in replacement for `env.fetch`. Only HuggingFace model URLs are
 * intercepted; everything else passes through untouched.
 */
export async function resumableFetch(input: any, init?: any): Promise<Response> {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : (input?.url ?? '');
  if (!HF_HOST_RE.test(url) || typeof caches === 'undefined') {
    return fetch(input, init);
  }

  dbg('fetch', { url: url.split('/').pop(), method: init?.method ?? 'GET' });
  let cache: Cache;
  try {
    cache = await caches.open(SHARD_CACHE_NAME);
  } catch {
    return fetch(input, init); // Cache API unavailable (incognito/iframes)
  }

  try {
    const manifest = await readManifest(cache, url);
    if (manifest && manifest.done_count > 0) {
      dbg('resume', { url: url.split('/').pop(), done: manifest.done_count });
      const resumed = await resumeResponse(cache, url, manifest);
      if (resumed) return resumed;
      dbg('resume_fallback_fresh', { url: url.split('/').pop() });
      // Stale/incomplete manifest — drop leftovers and start fresh.
      await deleteShardEntries(cache, url, manifest.done_count);
    }
    return await fetchAndShard(cache, url, input, init);
  } catch (e) {
    dbg('outer_catch', { url: url.split('/').pop(), err: String(e) });
    // Any bookkeeping failure must never break the download itself.
    return fetch(input, init);
  }
}
