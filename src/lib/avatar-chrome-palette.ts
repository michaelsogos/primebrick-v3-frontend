/**
 * Stable “random” avatar fallback colors on chrome bars (topbar).
 * Light: saturated ~600/700 + white text vs ~hsl(210 20% 96%).
 * Dark: saturated ~400/500 + white text vs ~hsl(222 47% 12%) (--topbar-chrome).
 * Same seed picks the same hue family in both themes.
 */

const AVATAR_CHROME_PALETTES = [
  { light: 'bg-sky-600 text-white', dark: 'dark:bg-sky-500 dark:text-white' },
  { light: 'bg-emerald-600 text-white', dark: 'dark:bg-emerald-500 dark:text-white' },
  { light: 'bg-violet-600 text-white', dark: 'dark:bg-violet-500 dark:text-white' },
  { light: 'bg-rose-600 text-white', dark: 'dark:bg-rose-500 dark:text-white' },
  { light: 'bg-indigo-600 text-white', dark: 'dark:bg-indigo-500 dark:text-white' },
  { light: 'bg-cyan-700 text-white', dark: 'dark:bg-cyan-500 dark:text-white' },
  { light: 'bg-fuchsia-600 text-white', dark: 'dark:bg-fuchsia-500 dark:text-white' },
  { light: 'bg-teal-600 text-white', dark: 'dark:bg-teal-500 dark:text-white' },
  { light: 'bg-blue-700 text-white', dark: 'dark:bg-blue-500 dark:text-white' },
  { light: 'bg-orange-600 text-white', dark: 'dark:bg-orange-500 dark:text-white' }
] as const;

/** Deterministic index in [0, length) for a stable color per seed (e.g. initials or user id). */
export function hashSeedToIndex(seed: string, modulo: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  const u = h >>> 0;
  return modulo === 0 ? 0 : u % modulo;
}

/** Classes for AvatarFallback: saturated in light and dark (contrast vs topbar chrome). */
export function avatarFallbackChromeClasses(seed: string): string {
  const i = hashSeedToIndex(seed, AVATAR_CHROME_PALETTES.length);
  const p = AVATAR_CHROME_PALETTES[i]!;
  return `${p.light} ${p.dark}`;
}
