import { cn } from '$lib/utils';

export type TailwindColorToken = `${string}-${number}`;

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
  const color = m?.[1] ?? 'zinc';
  const shade = clampShade(Number(m?.[2] ?? 300));

  // Excel-like readability: lighter background + darker text.
  const bg = clampShade(shade <= 200 ? 50 : shade - 200);
  const text = clampShade(shade >= 600 ? shade : shade + 400);

  // Dark mode: invert the contrast, keep a soft tinted bg.
  const darkBg = clampShade(shade >= 700 ? 950 : shade + 600);
  const darkText = clampShade(shade <= 300 ? 200 : shade - 200);

  // Map color names to hex values for inline style usage
  const colorMap: Record<string, string> = {
    zinc: '#71717a',
    slate: '#64748b',
    gray: '#6b7280',
    red: '#ef4444',
    orange: '#f97316',
    amber: '#f59e0b',
    yellow: '#eab308',
    lime: '#84cc16',
    green: '#22c55e',
    emerald: '#10b981',
    teal: '#14b8a6',
    cyan: '#06b6d4',
    sky: '#0ea5e9',
    blue: '#3b82f6',
    indigo: '#6366f1',
    violet: '#8b5cf6',
    purple: '#a855f7',
    fuchsia: '#d946ef',
    pink: '#ec4899',
    rose: '#f43f5e'
  };

  const baseColor = colorMap[color] || colorMap.zinc;

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

