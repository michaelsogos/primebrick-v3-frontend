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
  const ring = clampShade(shade);

  // Dark mode: invert the contrast, keep a soft tinted bg.
  const darkBg = clampShade(shade >= 700 ? 950 : shade + 600);
  const darkText = clampShade(shade <= 300 ? 200 : shade - 200);
  const darkRing = clampShade(shade <= 300 ? 300 : shade);

  return cn(
    'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
    `bg-${color}-${bg}/50 text-${color}-${text} ring-${color}-${ring}/20`,
    `dark:bg-${color}-${darkBg}/30 dark:text-${color}-${darkText} dark:ring-${color}-${darkRing}/25`
  );
}

