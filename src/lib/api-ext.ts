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

import JSONBig from "json-bigint";
import { apiFetch } from "./api";

const jsonBigInstance = JSONBig({
  useNativeBigInt: true,
  strict: true,
});

/**
 * Parse an Ext-JSON string.
 *
 * ALL integers are returned as native `bigint` (via reviver).
 * Floats (values with decimal point or scientific notation) are returned as `number`.
 * Strings, booleans, null are unaffected.
 */
export function extJsonParse<T = unknown>(text: string): T {
  return jsonBigInstance.parse(text, (_key, value) => {
    if (typeof value === "number" && Number.isInteger(value)) {
      return BigInt(value);
    }
    return value;
  }) as T;
}

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
