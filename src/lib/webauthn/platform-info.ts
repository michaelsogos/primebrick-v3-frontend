/**
 * Capture the User-Agent Client Hints `platformVersion` for OS version
 * detection (Windows 10 vs Windows 11).
 *
 * `navigator.userAgent` reports "Windows NT 10.0" on BOTH Windows 10 and
 * Windows 11, so it cannot distinguish them. Chromium-based browsers
 * (Chrome, Edge) expose `navigator.userAgentData.getHighEntropyValues
 * (["platformVersion"])` which returns a version string where:
 *   - `1.x.x`–`10.x.x` = Windows 10
 *   - `13.x.x`+        = Windows 11
 *
 * Firefox and Safari do not support `userAgentData` — `getPlatformVersion`
 * returns `undefined` in that case, and the BE falls back to the generic
 * "Windows" label.
 *
 * This is async because `getHighEntropyValues` returns a Promise. Callers
 * should `await getPlatformVersion()` before POSTing to the BE.
 */
export async function getPlatformVersion(): Promise<string | undefined> {
  // Cast to access the non-standard `userAgentData` property (Chromium only).
  const nav = navigator as Navigator & {
    userAgentData?: {
      getHighEntropyValues?: (hints: string[]) => Promise<{ platformVersion?: string }>;
    };
  };
  if (!nav.userAgentData?.getHighEntropyValues) return undefined;
  try {
    const hint = await nav.userAgentData.getHighEntropyValues(["platformVersion"]);
    return hint?.platformVersion ?? undefined;
  } catch {
    // Some browsers may reject the hint request (Permissions-Policy).
    // Silently fall back — the BE handles a missing platformVersion.
    return undefined;
  }
}
