/**
 * Ext-JSON parsing for the Primebrick frontend.
 *
 * The BE serializes responses with `json-bigint` (via @primebrick/sdk middleware),
 * producing standard JSON where bigint values are JSON numbers. This wrapper
 * parses those responses with `json-bigint` using a reviver that forces ALL
 * integers to native `bigint`, making types predictable.
 * No `number | bigint` ambiguity: every integer is always `bigint`.
 *
 * This is a FE standalone implementation — it does NOT depend on @primebrick/sdk
 * (which is BE/US/DAL only). It installs `json-bigint` directly.
 */

import { apiFetch } from "./api";

// Canonical codec lives in @primebrick/core (env-neutral — remote module
// pages bundle it too). Re-exported so existing `$lib/api-ext` imports keep
// working; the fetch wrappers below stay FE-local.
export { extJsonParse, extJsonStringify } from "@primebrick/ui";
import { extJsonParse } from "@primebrick/ui";

/**
 * Fetch with Ext-JSON parsing.
 * Same as `apiFetch` but parses the response body with `extJsonParse` instead of
 * `res.json()`. Use this when the response contains bigint values (id, total, etc.).
 *
 * Returns the parsed data directly.
 */
export async function apiFetchExt<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const res = await apiFetch(input, init);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const text = await res.text();
  return extJsonParse<T>(text);
}

/**
 * Fetch with Ext-JSON parsing — returns both response and parsed data.
 * Useful when the caller needs access to response headers/status.
 *
 * For 204 No Content or empty bodies, `data` is `undefined`.
 */
export async function apiFetchExtWithResponse<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ res: Response; data: T | undefined }> {
  const res = await apiFetch(input, init);
  const text = await res.text();
  const data = text ? extJsonParse<T>(text) : (undefined as T);
  return { res, data };
}
