/**
 * Named lucide path-data vocabulary for {@link GradientIcon} — the ONE place
 * gradient-stroked glyph geometry is declared. Consumers reference
 * `GRADIENT_ICON_PATHS.<name>` (+ `GRADIENT_ICON_STOPS.<name>` for
 * non-default colors); never inline raw `d` strings — duplicated geometry
 * drifts the same way duplicated icons do.
 *
 * Every entry here must also be rendered in the `special-icons` dev-guide
 * page (primebrick-v3-ui docs) — the catalog is the contract that keeps
 * gradient glyphs discoverable instead of re-authored.
 */
export const GRADIENT_ICON_PATHS = {
  /** lucide `check` — accept/confirm CTA (AI suggestion review, …). */
  check: ['M20 6 9 17l-5-5'],
  /** lucide `star` — favorites identity marker (amber stops, filled). */
  star: [
    'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
  ],
  /** lucide `lighthouse` — the FARO AI-guide CTA. */
  lighthouse: [
    'M12 3V2',
    'M16.066 16.865 7 22l2-11V6a3 3 0 016 0v5l2 11',
    'm19.792 4.5.866-.5',
    'm19.797 13.5.866.5',
    'M21 9h1',
    'M3 9H2',
    'm4.203 13.5-.866.5',
    'M4.208 4.5 3.342 4',
    'M5.5 22h13',
    'm7.932 16.875 7.377-4.178',
    'M8 11h8',
    'M8 7h8',
  ],
  /** lucide `external-link` — open-in-new affordance. */
  external_link: [
    'M15 3h6v6',
    'M10 14 21 3',
    'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  ],
} as const;

/** Named gradient stop palettes — `primary` is the component default and is
 *  declared for explicit overrides only. */
export const GRADIENT_ICON_STOPS = {
  /** Primary sky-400 → indigo-400 → sky-400 sweep (component default). */
  primary: ['#38bdf8', '#818cf8', '#38bdf8'],
  /** Amber sweep — the favorites star identity. */
  amber: ['#fbbf24', '#fb923c', '#fbbf24'],
} as const;
