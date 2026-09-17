import { createHighlighter, type Highlighter } from 'shiki';

/**
 * Shared lazy Shiki highlighter for JSON rendering.
 * Single instance + module-level html cache keyed by code string —
 * identical payloads across call sites share the same highlighted html.
 */
let highlighter: Highlighter | null = null;
let pending: Promise<Highlighter> | null = null;
const htmlCache = new Map<string, string>();

async function getHighlighter(): Promise<Highlighter> {
  pending ??= createHighlighter({
    themes: ['light-plus', 'github-dark-default'],
    langs: ['json'],
  });
  return (highlighter ??= await pending);
}

/**
 * Highlight JSON to html with dual light/dark themes.
 * `value` may be a JSON string or any serializable value.
 * Throws on shiki failure — callers provide their own fallback.
 */
export async function highlightJson(value: unknown): Promise<string> {
  const code = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const hit = htmlCache.get(code);
  if (hit) return hit;
  const hl = await getHighlighter();
  const html = hl.codeToHtml(code, {
    lang: 'json',
    themes: { light: 'light-plus', dark: 'github-dark-default' },
  });
  htmlCache.set(code, html);
  return html;
}
