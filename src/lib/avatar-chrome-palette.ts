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

/** Map palette index to hex color value for color picker */
export function avatarChromePaletteToHex(index: number): string {
  const hexValues = [
    '#0284c7',  // sky-600
    '#059669',  // emerald-600
    '#7c3aed',  // violet-600
    '#e11d48',  // rose-600
    '#4f46e5',  // indigo-600
    '#0e7490',  // cyan-700
    '#c026d3',  // fuchsia-600
    '#0d9488',  // teal-600
    '#1d4ed8',  // blue-700
    '#ea580c'   // orange-600
  ];
  return hexValues[index] || '#3b82f6'; // Default to sky-500 if out of range
}

/**
 * Calculate relative luminance of a hex color
 * Returns a value between 0 (black) and 1 (white)
 */
export function calculateLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5; // Default to middle if invalid

  const [r, g, b] = rgb.map((channel) => {
    channel = channel / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Convert hex color to RGB array
 */
function hexToRgb(hex: string): [number, number, number] | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
      ]
    : null;
}

/**
 * Determine if text should be white or black based on background luminance
 * Returns 'white' for dark backgrounds, 'black' for light backgrounds
 */
export function getContrastTextColor(hex: string): 'white' | 'black' {
  const luminance = calculateLuminance(hex);
  return luminance > 0.5 ? 'black' : 'white';
}
