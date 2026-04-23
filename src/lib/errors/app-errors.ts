import { get } from 'svelte/store';
import { writable } from 'svelte/store';
import { toast } from '$lib/errors/toast';
import { t } from '$lib/i18n';

export type ImpactLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type AppErrorTag = {
  label: string;
  tone?: 'neutral' | 'danger' | 'warning' | 'info' | 'success';
};

/** Newest-first ring buffer cap; overflow drops the oldest tail entry. */
const MAX_APP_ERRORS = 50;

export type AppError = {
  id: string;
  impact: ImpactLevel;
  /** i18n key for user-facing message (preferred). */
  messageKey?: string;
  /** Literal user-facing message (fallback when no key exists). */
  message?: string;
  /** i18n key for the short scope label (preferred). */
  scopeKey?: string;
  /** Literal scope label (fallback). */
  scope?: string;
  tags?: AppErrorTag[];
  detail?: string;
  createdAt: number;
};

export const appErrors = writable<AppError[]>([]);

const TOAST_DURATION_MS = 5000;

function translate() {
  return get(t);
}

function baseToastOpts(description?: string) {
  const d = description?.trim();
  return {
    ...(d ? { description: d } : {}),
    duration: TOAST_DURATION_MS
  };
}

/**
 * Toast mapping (no `success` — these are error-domain notifications):
 * - CRITICAL: urgent / semaphore red (`--critical`), brighter than standard error
 * - HIGH: standard error (`toast.error` / destructive)
 * - MEDIUM: warning
 * - LOW: info
 */
function showImpactToast(impact: ImpactLevel, message: string, description?: string) {
  const opts = baseToastOpts(description);
  switch (impact) {
    case 'CRITICAL':
      return toast.critical(message, opts);
    case 'HIGH':
      return toast.error(message, opts);
    case 'MEDIUM':
      return toast.warning(message, opts);
    case 'LOW':
      return toast.info(message, opts);
    default:
      return toast.error(message, opts);
  }
}

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function prependCapped(xs: AppError[], err: AppError): AppError[] {
  const next = [err, ...xs];
  return next.length > MAX_APP_ERRORS ? next.slice(0, MAX_APP_ERRORS) : next;
}

export function pushAppError(input: { message: string; scope?: string; detail?: string; toast?: boolean }) {
  const err: AppError = {
    id: uid('err'),
    impact: 'HIGH',
    message: input.message,
    scope: input.scope,
    detail: input.detail,
    createdAt: Date.now()
  };
  appErrors.update((xs) => prependCapped(xs, err));

  if (input.toast !== false) {
    toast.error(input.message, baseToastOpts(input.scope));
  }

  return err.id;
}

export function pushImpactError(input: {
  impact: ImpactLevel;
  messageKey?: string;
  message?: string;
  scopeKey?: string;
  scope?: string;
  tags?: AppErrorTag[];
  detail?: string;
  toast?: boolean;
}) {
  const tr = translate();
  const message = input.messageKey ? tr(input.messageKey) : input.message ?? '';
  const scope = input.scopeKey ? tr(input.scopeKey) : input.scope;

  const err: AppError = {
    id: uid('err'),
    impact: input.impact,
    messageKey: input.messageKey,
    message: input.message,
    scopeKey: input.scopeKey,
    scope: input.scope,
    tags: input.tags,
    detail: input.detail,
    createdAt: Date.now()
  };
  appErrors.update((xs) => prependCapped(xs, err));

  if (input.toast !== false) {
    showImpactToast(input.impact, message, scope);
  }

  return err.id;
}

export function clearAppErrors() {
  appErrors.set([]);
}
