/**
 * tryParseJsonObject — detect and normalize a JSON-object value.
 *
 * Returns the value when it is already a plain object (pg jsonb parser output),
 * or parses a `{...}` JSON string into a `Record`. Rejects null, undefined,
 * arrays, scalars, and non-object strings — used by the version-history panel
 * to decide whether an audit delta value renders as a JSON document.
 */
export function tryParseJsonObject(val: unknown): Record<string, unknown> | undefined {
  if (val === null || val === undefined) return undefined;
  // Already an object (from pg jsonb parser) — return as-is
  if (typeof val === 'object' && !Array.isArray(val)) return val as Record<string, unknown>;
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return undefined;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
      ? parsed as Record<string, unknown>
      : undefined;
  } catch { return undefined; }
}
