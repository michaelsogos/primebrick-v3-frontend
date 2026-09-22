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

/** Pull-based tee: forwards body chunks downstream while feeding the writer. */
function teeStream(
  body: ReadableStream<Uint8Array>,
  writer: ReturnType<typeof shardWriter>,
  onDone?: () => Promise<void>,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      // NOTE: cancelling our stream resolves the pending underlying read()
      // with done=true — do NOT treat that as a clean completion: shards
      // must survive so the download can resume.
      if (done) {
        if (!cancelled) {
          await writer.end();
          await onDone?.();
          controller.close();
        }
        return;
      }
      if (value && !cancelled) {
        writer.push(value);
        controller.enqueue(value);
      }
    },
    cancel(reason) {
      cancelled = true;
      void reader.cancel(reason);
    },
  });
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
  const stream = teeStream(resp.body, shardWriter(cache, url, manifest, 0), () =>
    // Stream consumed → transformers stores the full file in its own cache
    // right after this; shards become redundant. Delete them so we never
    // hold the same bytes twice.
    deleteShardEntries(cache, url, manifest.done_count),
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

  const probe = await fetch(url, {
    redirect: 'follow',
    headers: { Range: `bytes=${offset}-` },
  });

  const etag = etagOf(probe);
  const total = Number((probe.headers.get('content-range') ?? '').split('/')[1]);
  const valid =
    probe.status === 206 &&
    total === manifest.size &&
    (!manifest.etag || !etag || etag === manifest.etag);

  if (!valid) {
    // 200 (Range ignored) or stale manifest — restart clean.
    void probe.body?.cancel();
    return null;
  }

  const headers = new Headers(probe.headers);
  headers.delete('content-range');
  headers.set('content-length', String(manifest.size));
  const stream = shardReplayStream(cache, url, manifest.done_count, probe.body, manifest);
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
  liveBody: ReadableStream<Uint8Array> | null,
  manifest?: ShardManifest,
): ReadableStream<Uint8Array> {
  let shard_idx = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let writer: ReturnType<typeof shardWriter> | null = null;
  let cancelled = false;

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
      if (!liveBody) {
        // Full replay from shards — transformers re-caches the file;
        // shard copies are redundant from here on.
        if (manifest) await deleteShardEntries(cache, url, manifest.done_count);
        controller.close();
        return;
      }
      reader ??= liveBody.getReader();
      writer ??= manifest ? shardWriter(cache, url, manifest, count) : null;
      const { done, value } = await reader.read();
      // Pending read() resolves done=true on cancel — see teeStream.
      if (done) {
        if (!cancelled) {
          await writer?.end();
          if (manifest) await deleteShardEntries(cache, url, manifest.done_count);
          controller.close();
        }
        return;
      }
      if (value) {
        writer?.push(value);
        controller.enqueue(value);
      }
    },
    cancel(reason) {
      cancelled = true;
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

  let cache: Cache;
  try {
    cache = await caches.open(SHARD_CACHE_NAME);
  } catch {
    return fetch(input, init); // Cache API unavailable (incognito/iframes)
  }

  try {
    const manifest = await readManifest(cache, url);
    if (manifest && manifest.done_count > 0) {
      const resumed = await resumeResponse(cache, url, manifest);
      if (resumed) return resumed;
      // Stale/incomplete manifest — drop leftovers and start fresh.
      await deleteShardEntries(cache, url, manifest.done_count);
    }
    return await fetchAndShard(cache, url, input, init);
  } catch {
    // Any bookkeeping failure must never break the download itself.
    return fetch(input, init);
  }
}
