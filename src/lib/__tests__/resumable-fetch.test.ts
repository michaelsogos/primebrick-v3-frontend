import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SHARD_SIZE is 64MB — too big to cross in a test with real data.
// We re-mock the module constant by testing behavior with small buffers via
// a tiny internal seam: the module reads SHARD_SIZE at call time, so we
// can't shrink it without DI. Instead we use >64MB synthetic chunks —
// subarray slices share memory, so cost is low.
const SHARD_SIZE = 64 * 1024 * 1024;
const FILE_URL =
  "https://huggingface.co/onnx-community/Test-Model/resolve/main/onnx/model_q4f16.onnx";

// ── In-memory Cache API stub ──────────────────────────────────────────────
class MemCache {
  store = new Map<string, Response>();
  async match(key: string | Request) {
    const k = typeof key === "string" ? key : key.url;
    return this.store.get(k)?.clone();
  }
  async put(key: string | Request, resp: Response) {
    const k = typeof key === "string" ? key : key.url;
    this.store.set(k, resp.clone());
  }
  async delete(key: string | Request) {
    const k = typeof key === "string" ? key : key.url;
    return this.store.delete(k);
  }
  async keys() {
    return [...this.store.keys()].map((k) => new Request(k));
  }
}

const cachesRegistry = new Map<string, MemCache>();

async function streamBytes(body: ReadableStream<Uint8Array>): Promise<number> {
  const reader = body.getReader();
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
  }
  return total;
}

function resp206(total: number, offset: number, bodyLen: number, etag = '"v1"') {
  return new Response(new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(bodyLen));
      c.close();
    },
  }), {
    status: 206,
    headers: {
      "content-range": `bytes ${offset}-${total - 1}/${total}`,
      "content-length": String(bodyLen),
      etag,
    },
  });
}

describe("resumableFetch", () => {
  beforeEach(() => {
    cachesRegistry.clear();
    vi.stubGlobal("caches", {
      open: async (name: string) => {
        if (!cachesRegistry.has(name)) cachesRegistry.set(name, new MemCache());
        return cachesRegistry.get(name)!;
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("passes non-HF URLs through untouched", async () => {
    const spy = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", spy);
    const { resumableFetch } = await import("$lib/ai/resumable-fetch");
    await resumableFetch("https://api.example.com/x");
    expect(spy).toHaveBeenCalledWith("https://api.example.com/x", undefined);
  });

  it("passes through small HF files without sharding", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", {
      status: 200,
      headers: { "content-length": "2" },
    }));
    const { resumableFetch } = await import("$lib/ai/resumable-fetch");
    const r = await resumableFetch(FILE_URL.replace(".onnx", ".json"));
    expect(await r.text()).toBe("{}");
    const cache = cachesRegistry.get("hf-resumable");
    expect(cache?.store.size ?? 0).toBe(0);
  });

  it("streams a large file and persists shards + manifest", async () => {
    const size = SHARD_SIZE + 100; // 1 full shard + tail
    vi.stubGlobal("fetch", async () => new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(size)); // one big chunk → sliced by writer
          c.close();
        },
      }),
      { status: 200, headers: { "content-length": String(size), etag: '"v1"' } },
    ));
    const { resumableFetch } = await import("$lib/ai/resumable-fetch");
    const r = await resumableFetch(FILE_URL);
    expect(r.status).toBe(200);
    expect(await streamBytes(r.body!)).toBe(size);

    // After the stream completes, shards are cleaned up (transformers
    // stores the whole file itself) — no double storage.
    const cache = cachesRegistry.get("hf-resumable")!;
    expect(await cache.match(`${FILE_URL}?__resume_manifest`)).toBeFalsy();
    expect(await cache.match(`${FILE_URL}?__resume_shard=0`)).toBeFalsy();
    expect(await cache.match(`${FILE_URL}?__resume_shard=1`)).toBeFalsy();
  });

  it("keeps persisted shards when the stream is abandoned mid-file", async () => {
    const size = SHARD_SIZE + 100;
    let releaseSecondChunk: (() => void) | null = null;
    const gate = new Promise<void>((res) => { releaseSecondChunk = res; });
    vi.stubGlobal("fetch", async () => new Response(
      new ReadableStream({
        async start(c) {
          c.enqueue(new Uint8Array(SHARD_SIZE));
          await gate;                 // never resolves — simulates interruption
          c.enqueue(new Uint8Array(100));
          c.close();
        },
      }),
      { status: 200, headers: { "content-length": String(size), etag: '"v1"' } },
    ));
    const { resumableFetch } = await import("$lib/ai/resumable-fetch");
    const r = await resumableFetch(FILE_URL);
    const reader = r.body!.getReader();
    await reader.read(); // first shard worth of bytes
    await new Promise((res) => setTimeout(res, 50)); // let shard write land
    await reader.cancel();

    const cache = cachesRegistry.get("hf-resumable")!;
    const manifest = await (await cache.match(`${FILE_URL}?__resume_manifest`))!.json();
    expect(manifest.done_count).toBe(1);
    expect(await cache.match(`${FILE_URL}?__resume_shard=0`)).toBeTruthy();
    releaseSecondChunk!();
  });

  it("resumes an interrupted download via Range and replays stored shards first", async () => {
    const size = SHARD_SIZE + 100;
    // Pre-seed: shard 0 already persisted + manifest
    const { resumableFetch } = await import("$lib/ai/resumable-fetch");
    const cache = cachesRegistry.get("hf-resumable") ?? new MemCache();
    cachesRegistry.set("hf-resumable", cache);
    await cache.put(`${FILE_URL}?__resume_shard=0`, new Response(new Uint8Array(SHARD_SIZE)));
    await cache.put(`${FILE_URL}?__resume_manifest`, new Response(JSON.stringify({
      etag: '"v1"', size, done_count: 1,
    })));

    let seenRange = "";
    vi.stubGlobal("fetch", async (_u: any, init: any) => {
      seenRange = init?.headers?.Range ?? "";
      return resp206(size, SHARD_SIZE, 100);
    });

    const r = await resumableFetch(FILE_URL);
    expect(seenRange).toBe(`bytes=${SHARD_SIZE}-`);
    expect(r.headers.get("content-length")).toBe(String(size));
    // Stream = stored shard (64MB) + live tail (100B)
    expect(await streamBytes(r.body!)).toBe(size);
    // After completion all resume artifacts are cleaned up.
    expect(await cache.match(`${FILE_URL}?__resume_manifest`)).toBeFalsy();
  });

  it("restarts fresh when the stored etag no longer matches", async () => {
    const size = SHARD_SIZE + 100;
    const { resumableFetch } = await import("$lib/ai/resumable-fetch");
    const cache = new MemCache();
    cachesRegistry.set("hf-resumable", cache);
    await cache.put(`${FILE_URL}?__resume_shard=0`, new Response(new Uint8Array(SHARD_SIZE)));
    await cache.put(`${FILE_URL}?__resume_manifest`, new Response(JSON.stringify({
      etag: '"old"', size, done_count: 1,
    })));

    vi.stubGlobal("fetch", async (_u: any, init: any) => {
      if (init?.headers?.Range) return resp206(size, SHARD_SIZE, 100, '"new"');
      return new Response(new ReadableStream({
        start(c) { c.enqueue(new Uint8Array(size)); c.close(); },
      }), { status: 200, headers: { "content-length": String(size), etag: '"new"' } });
    });

    const r = await resumableFetch(FILE_URL);
    expect(await streamBytes(r.body!)).toBe(size);
    // Completed download → resume artifacts cleaned up again.
    expect(await cache.match(`${FILE_URL}?__resume_manifest`)).toBeFalsy();
  });

  it("serves fully-sharded files entirely from cache (no network)", async () => {
    const size = SHARD_SIZE;
    const { resumableFetch } = await import("$lib/ai/resumable-fetch");
    const cache = new MemCache();
    cachesRegistry.set("hf-resumable", cache);
    await cache.put(`${FILE_URL}?__resume_shard=0`, new Response(new Uint8Array(SHARD_SIZE)));
    await cache.put(`${FILE_URL}?__resume_manifest`, new Response(JSON.stringify({
      etag: '"v1"', size, done_count: 1,
    })));

    const spy = vi.fn(async () => new Response("nope"));
    vi.stubGlobal("fetch", spy);
    const r = await resumableFetch(FILE_URL);
    expect(spy).not.toHaveBeenCalled();
    expect(await streamBytes(r.body!)).toBe(size);
  });
});
