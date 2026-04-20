import { toast as sonnerToast } from 'svelte-sonner';
import type { ExternalToast } from 'svelte-sonner';

/** Matches `app.css` — `li.toast-impact-critical` rules for surface + copy color. */
export const TOAST_CRITICAL_CLASS = 'toast-impact-critical';

/**
 * Urgent / CRITICAL — not the same as {@link sonnerToast.error}.
 * `richColors: false` avoids Sonner’s pale error chip; copy color is forced in `app.css`
 * via `li.toast-impact-critical [data-title]` / `[data-description]` (beats Sonner’s grays).
 */
export function toastCritical(message: string, data?: ExternalToast) {
  return sonnerToast.error(message, {
    ...data,
    richColors: false,
    class: [TOAST_CRITICAL_CLASS, data?.class].filter(Boolean).join(' '),
    classes: data?.classes
  });
}

/** Sonner `toast` API plus {@link toastCritical} for shell / app use. */
export const toast = Object.assign(sonnerToast, {
  critical: toastCritical
}) as typeof sonnerToast & { critical: typeof toastCritical };
