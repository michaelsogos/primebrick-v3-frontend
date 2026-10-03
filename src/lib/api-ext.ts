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
  // useNativeBigInt is intentionally OFF: in that mode json-bigint converts
  // EVERY number token to native bigint, so any float in the payload throws
  // "Cannot convert <float> to a BigInt". In default mode floats arrive as
  // BigNumber objects (or plain numbers) and the reviver below sorts them.
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
    // Only safe integers become bigint — huge float tokens (e.g. 1.7e308)
    // arrive as `number`, are integer-valued, and must NOT be bigint-ified.
    if (typeof value === "number") {
      return Number.isSafeInteger(value) ? BigInt(value) : value;
    }
    // Integers beyond MAX_SAFE_INTEGER arrive as BigNumber — convert to
    // bigint without precision loss; non-integer BigNumbers stay numbers
    // (bignumber.js's isInteger() is unreliable on json-bigint values).
    if (
      typeof value === "object" &&
      value !== null &&
      (value as object).constructor?.name === "BigNumber"
    ) {
      const bn = value as { toString(): string; toNumber(): number };
      try {
        return BigInt(bn.toString());
      } catch {
        return bn.toNumber();
      }
    }
    return value;
  }) as T;
}

/**
 * Serialize a value to an Ext-JSON string.
 * BigInt values are serialized as JSON numbers (e.g. 42n → "42").
 * Floats are serialized as JSON numbers (e.g. 3.14 → "3.14").
 *
 * Use this for request bodies that contain bigint values (e.g. config
 * values for the `bigint` config type). The BE's ext-json body parser
 * will parse them back to native `bigint`.
 */
export function extJsonStringify(data: unknown): string {
  return jsonBigInstance.stringify(data);
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
