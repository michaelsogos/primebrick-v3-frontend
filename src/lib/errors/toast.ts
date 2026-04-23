import { toast as sonnerToast } from 'svelte-sonner';
import type { ExternalToast } from 'svelte-sonner';
import EventToast from '$lib/components/toasts/EventToast.svelte';
import { get } from 'svelte/store';
import { t } from '$lib/i18n';

/** Matches `app.css` — `li.toast-impact-critical` rules for surface + copy color. */
export const TOAST_CRITICAL_CLASS = 'toast-impact-critical';

type ToastTone = 'critical' | 'error' | 'warning' | 'info';

function toastEvent(tone: ToastTone, message: string, data?: ExternalToast) {
  const scope = typeof data?.description === 'string' ? data.description : undefined;
  const tr = get(t);

  const label =
    tone === 'critical'
      ? tr('impact.criticalError')
      : tone === 'error'
        ? tr('impact.error')
        : tone === 'warning'
          ? tr('impact.warning')
          : tr('impact.information');

  return sonnerToast.custom(EventToast, {
    ...data,
    unstyled: true,
    duration: 5000,
    componentProps: {
      label,
      title: scope ?? '',
      message,
      time: Date.now(),
      tone
    }
  });
}

/**
 * Urgent / CRITICAL — not the same as {@link sonnerToast.error}.
 * `richColors: false` avoids Sonner’s pale error chip; copy color is forced in `app.css`
 * via `li.toast-impact-critical [data-title]` / `[data-description]` (beats Sonner’s grays).
 */
export function toastCritical(message: string, data?: ExternalToast) {
  return toastEvent('critical', message, {
    ...data,
    richColors: false,
    class: [TOAST_CRITICAL_CLASS, data?.class].filter(Boolean).join(' ')
  });
}

/** Sonner `toast` API plus {@link toastCritical} for shell / app use. */
export const toast = Object.assign(sonnerToast, {
  critical: toastCritical,
  error: (message: string, data?: ExternalToast) => toastEvent('error', message, data),
  warning: (message: string, data?: ExternalToast) => toastEvent('warning', message, data),
  info: (message: string, data?: ExternalToast) => toastEvent('info', message, data)
}) as typeof sonnerToast & {
  critical: typeof toastCritical;
  error: typeof sonnerToast.error;
  warning: typeof sonnerToast.warning;
  info: typeof sonnerToast.info;
};
