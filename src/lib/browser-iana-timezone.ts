/**
 * IANA time zone from the environment’s default `Intl.DateTimeFormat` (e.g. `Europe/Rome`).
 * In the browser this reflects the user’s system time zone. Call from client-only UI after mount
 * if you must avoid SSR/server defaults.
 */
export function getResolvedIanaTimeZone(): string | null {
  try {
    const tz = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === 'string' && tz.length > 0 ? tz : null;
  } catch {
    return null;
  }
}
