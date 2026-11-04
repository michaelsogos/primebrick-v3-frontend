/**
 * Stable “random” avatar fallback colors on chrome bars (topbar).
 * Light: saturated ~600/700 + white text vs ~hsl(210 20% 96%).
 * Dark: saturated ~400/500 + white text vs ~hsl(222 47% 12%) (--topbar-chrome).
 * Same seed picks the same hue family in both themes.
 *
 * Color math (luminance, rgb/hsl conversion) is shared — canonical
 * implementations live in @primebrick/ui `colors/contrast`.
 */

import { cssToLuminance, hexToRgb, hslToHex } from '@primebrick/ui';

export { hslToHex };

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
  return cssToLuminance(hex) ?? 0.5; // Default to middle if invalid
}

/**
 * Determine if text should be white or black based on background luminance
 * Returns 'white' for dark backgrounds, 'black' for light backgrounds
 */
export function getContrastTextColor(hex: string): 'white' | 'black' {
  const luminance = cssToLuminance(hex);
  return luminance != null && luminance > 0.5 ? 'black' : 'white';
}

// ─── Avatar gradient logic ────────────────────────────────────────────────
// The user's avatar_color is used as the centroid of a gradient. Start and
// end colors are computed by shifting hue ±30° and lightness ±12%, producing
// two distinct but harmonious colors (like the PrimeBrick logo sky→indigo).

/**
 * Convert hex color to HSL.
 * @returns [hue(0-360), saturation(0-100), lightness(0-100)] or null if invalid
 */
export function hexToHsl(hex: string): [number, number, number] | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

/**
 * Determine text color (white or black) based on the average luminance of two
 * gradient colors. Used for gradient backgrounds where the midpoint luminance
 * is more representative than either endpoint alone.
 */
export function getGradientContrastTextColor(startHex: string, endHex: string): 'white' | 'black' {
  const avgLuminance = (calculateLuminance(startHex) + calculateLuminance(endHex)) / 2;
  return avgLuminance > 0.5 ? 'black' : 'white';
}

/**
 * Compute a gradient from a user's avatar color (used as centroid).
 * Start: hue − 30°, lightness − 12% (darker, cooler).
 * End: hue + 30°, lightness + 12% (lighter, warmer).
 * Falls back to a solid color (start === end === input) if the input is invalid.
 */
export function computeAvatarGradient(hex: string): {
  start: string;
  end: string;
  textColor: 'white' | 'black';
} {
  const hsl = hexToHsl(hex);
  if (!hsl) {
    // Invalid input — return a solid fallback using the raw hex
    return { start: hex, end: hex, textColor: getContrastTextColor(hex) };
  }
  const [h, s, l] = hsl;
  const start = hslToHex(h - 30, s, l - 12);
  const end = hslToHex(h + 30, s, l + 12);
  const textColor = getGradientContrastTextColor(start, end);
  return { start, end, textColor };
}

/**
 * Build the CSS background declaration for an avatar gradient.
 * Returns a string like `linear-gradient(135deg, #abc, #def)` ready for inline style.
 */
export function avatarGradientCss(hex: string): string {
  const { start, end } = computeAvatarGradient(hex);
  return `linear-gradient(135deg, ${start}, ${end})`;
}
