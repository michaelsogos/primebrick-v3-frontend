/**
 * browser-translator — Tier-0 on-device translation via the W3C
 * Translator/LanguageDetector built-in AI APIs (Chrome 138+, Edge 148+,
 * Opera 122+ desktop — Firefox/Safari expose no JS surface).
 *
 * The browser owns model download, quota and cache, and the downloaded
 * model is shared across every website — zero bytes, zero VRAM and zero
 * cache management on our side. Availability is per language-PAIR:
 * `Translator.availability` answers 'available' | 'downloadable' |
 * 'unavailable' (a 'downloadable' pair warms through `monitor` on
 * `create`). Callers degrade gracefully — this engine is optional; the
 * Opus-MT worker path is the universal fallback once tier-1 lands.
 *
 * Language normalization: our UiLang tags are region-qualified
 * (it-IT, pt-PT, en-GB…) while the built-in models index on primary
 * subtags — 'en-GB' and 'en-US' resolve to the same 'en' model, so an
 * en-GB↔en-US "translation" is a verbatim copy, not a pretend pair.
 */

declare global {
  /** W3C built-in AI surface — not yet in TypeScript's DOM lib. */
  // eslint-disable-next-line no-var
  var Translator:
    | {
        availability(options: {
          sourceLanguage: string;
          targetLanguage: string;
        }): Promise<MtAvailability>;
        create(options: {
          sourceLanguage: string;
          targetLanguage: string;
          monitor?: (monitor: EventTarget) => void;
          signal?: AbortSignal;
        }): Promise<{
          translate(text: string): Promise<string>;
          translateStreaming(text: string): AsyncIterable<string>;
          destroy(): void;
        }>;
      }
    | undefined;
  // eslint-disable-next-line no-var
  var LanguageDetector:
    | {
        availability(options?: {
          expectedInputLanguages?: string[];
        }): Promise<MtAvailability>;
        create(options?: {
          expectedInputLanguages?: string[];
          monitor?: (monitor: EventTarget) => void;
        }): Promise<{
          detect(text: string): Promise<{ detectedLanguage: string; confidence: number }[]>;
          destroy(): void;
        }>;
      }
    | undefined;
}

export type MtAvailability = 'available' | 'downloadable' | 'unavailable';

/** The browser exposes a `Translator` global? (Chromium-only for now.) */
export function browserTranslatorSupported(): boolean {
  return typeof Translator !== 'undefined';
}

/** 'it-IT' → 'it' — built-in models index on the primary subtag. */
export function toMtLang(tag: string): string {
  return tag.split('-')[0].toLowerCase();
}

/**
 * Per-pair capability probe. Same-language pairs (en-GB↔en-US) report
 * 'available' — a verbatim copy needs no model.
 */
export async function browserPairAvailability(
  source_tag: string,
  target_tag: string,
): Promise<MtAvailability> {
  const sourceLanguage = toMtLang(source_tag);
  const targetLanguage = toMtLang(target_tag);
  if (sourceLanguage === targetLanguage) return 'available';
  if (!browserTranslatorSupported()) return 'unavailable';
  try {
    return await Translator!.availability({ sourceLanguage, targetLanguage });
  } catch {
    return 'unavailable';
  }
}

/**
 * Translate `text` from `source_tag` to `target_tag` (UiLang tags —
 * normalized to primary subtags internally). A cold pair downloads its
 * model inside `create` — `onDownloadProgress` reports the 0..1 fraction
 * so callers can show the warm-up inline.
 */
export async function translateBrowser(
  text: string,
  source_tag: string,
  target_tag: string,
  onDownloadProgress?: (fraction: number) => void,
): Promise<string> {
  const sourceLanguage = toMtLang(source_tag);
  const targetLanguage = toMtLang(target_tag);
  if (!text.trim() || sourceLanguage === targetLanguage) return text;
  if (!browserTranslatorSupported()) throw new Error('TRANSLATOR_UNSUPPORTED');
  const session = await Translator!.create({
    sourceLanguage,
    targetLanguage,
    monitor: onDownloadProgress
      ? (m) =>
          m.addEventListener('downloadprogress', (e) => {
            const ev = e as ProgressEvent;
            onDownloadProgress(ev.total > 0 ? ev.loaded / ev.total : ev.loaded);
          })
      : undefined,
  });
  try {
    return await session.translate(text);
  } finally {
    session.destroy();
  }
}

/** LanguageDetector — opportunistic source detection for free-typed text. */
export async function detectBrowserLanguage(text: string): Promise<string | null> {
  if (typeof LanguageDetector === 'undefined' || !text.trim()) return null;
  try {
    const detector = await LanguageDetector.create();
    try {
      const [top] = await detector.detect(text);
      return top?.detectedLanguage ?? null;
    } finally {
      detector.destroy();
    }
  } catch {
    return null;
  }
}
