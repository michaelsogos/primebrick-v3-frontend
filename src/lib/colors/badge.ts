import tailwindColors from 'tailwindcss/colors';

export type TailwindColorToken = `${string}-${number}`;

export type TailwindSwatch = {
	/** e.g. "emerald-500" */
	token: TailwindColorToken;
	/** CSS color value (oklch string from tailwindcss/colors) */
	css: string;
	/** Approximate sRGB hex ("#RRGGBB") for labels/readouts. */
	hex: string;
	family: string;
	shade: number;
};

/** oklch("L% C H") → "#RRGGBB" (sRGB). Used for swatch readouts — the
 *  badge classes keep the original oklch css for paint fidelity. */
function oklchCssToHex(css: string): string {
	const m = css.match(/oklch\(([\d.]+)%?\s+([\d.]+)\s+([\d.]+)/);
	if (!m) return css;
	const L = parseFloat(m[1]) / 100;
	const C = parseFloat(m[2]);
	const hRad = (parseFloat(m[3]) * Math.PI) / 180;
	const a = C * Math.cos(hRad);
	const b = C * Math.sin(hRad);
	const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = L - 0.0894841775 * a - 1.291485548 * b;
	const l = l_ * l_ * l_;
	const mm = m_ * m_ * m_;
	const ss = s_ * s_ * s_;
	const toSrgb = (x: number) =>
		x >= 0.0031308 ? 1.055 * Math.pow(x, 1 / 2.4) - 0.055 : 12.92 * x;
	const ch = (x: number) =>
		Math.min(Math.max(0, Math.round(toSrgb(x) * 255)), 255)
			.toString(16)
			.padStart(2, '0')
			.toUpperCase();
	return `#${ch(+4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss)}${ch(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss)}${ch(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * ss)}`;
}

const TAILWIND_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** Full Tailwind palette flattened: every family × shade, ordered family-then-shade.
 *  Built once at module load; used by the color-picker "system" grid and the
 *  searchable token dropdown. */
export const tailwindSwatches: TailwindSwatch[] = (() => {
	const out: TailwindSwatch[] = [];
	for (const [family, shades] of Object.entries(
		tailwindColors as Record<string, unknown>
	)) {
		if (!shades || typeof shades !== 'object' || Array.isArray(shades)) continue;
		const record = shades as Record<string, string>;
		for (const shade of TAILWIND_SHADES) {
			const css = record[String(shade)];
			if (typeof css === 'string') {
				out.push({ token: `${family}-${shade}`, css, hex: oklchCssToHex(css), family, shade });
			}
		}
	}
	return out;
})();

/** Unique family names — declaration order reversed: vivid chromatic
 *  families first (pink, rose, red, …), the neutral/gray ramp last. */
export const tailwindFamilies: string[] = [
	...new Set(tailwindSwatches.map((s) => s.family))
].reverse();

function clampShade(v: number) {
  const allowed = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
  let best: number = allowed[0];
  let bestDist = Math.abs(v - best);
  for (const s of allowed) {
    const d = Math.abs(v - s);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best as (typeof allowed)[number];
}

export function badgeClassesFromToken(token: TailwindColorToken | string | null | undefined) {
  // token example: "zinc-300"
  const m = token?.match(/^([a-z]+)-(\d{2,3})$/);
  let baseColor: string;
  if (m) {
    // Full Tailwind palette (all families × shades 50–950), imported from
    // tailwindcss/colors — no hand-maintained hex map. Shade-aware:
    // `emerald-300` resolves to that exact shade, not the family default.
    const family = (tailwindColors as Record<string, unknown>)[m[1]];
    const shade = clampShade(Number(m[2]));
    baseColor =
      family && typeof family === 'object'
        ? ((family as Record<number, string>)[shade] ?? (family as Record<number, string>)[300])
        : (tailwindColors as Record<string, Record<number, string>>).zinc[300];
  } else if (token && (token.startsWith('#') || /^[a-z]+\s*\(/.test(token))) {
    // Free-form CSS color from the color picker (hex / rgb / hsl / oklch).
    baseColor = token;
  } else {
    baseColor = (tailwindColors as Record<string, Record<number, string>>).zinc[300];
  }

  // Generate solid background, text, and border colors (no opacity for better visibility on colored backgrounds)
  const bgColor = baseColor;
  const borderColor = baseColor;
  const textColor = '#ffffff'; // white text for solid colored badges
  const darkBgColor = baseColor;
  const darkBorderColor = baseColor;
  const darkTextColor = '#ffffff'; // white text for dark mode as well

  return {
    bgColor,
    borderColor,
    textColor,
    darkBgColor,
    darkBorderColor,
    darkTextColor
  };
}



