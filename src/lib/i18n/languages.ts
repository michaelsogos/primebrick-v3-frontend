export const UI_LANGS = ['en', 'it', 'fr', 'es', 'de', 'pt'] as const;

export type UiLang = (typeof UI_LANGS)[number];

export const DEFAULT_LANG: UiLang = 'en';

export function normalizeLang(input: string | null | undefined): UiLang | null {
  if (!input) return null;
  const lowered = input.toLowerCase();
  const base = lowered.split('-')[0] ?? lowered;
  if ((UI_LANGS as readonly string[]).includes(base)) return base as UiLang;
  return null;
}

