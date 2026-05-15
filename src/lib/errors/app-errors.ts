import { get } from 'svelte/store';
import { writable } from 'svelte/store';
import { toast } from '$lib/errors/toast';
import { t } from '$lib/i18n';
import type { RFC7807Error } from '$lib/errors/rfc7807';

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
  /** Extra fields beyond standard AppError fields (e.g., RFC7807 extra fields) */
  [key: string]: any;
};

export const appErrors = writable<AppError[]>([]);

const TOAST_DURATION_MS = 5000;

function translate() {
  return get(t);
}

function baseToastOpts(description?: string, tags?: AppErrorTag[], detail?: string) {
  const d = description?.trim();
  return {
    ...(d ? { description: d } : {}),
    ...(tags?.length ? { tags } : {}),
    ...(detail ? { detail } : {}),
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
function showImpactToast(impact: ImpactLevel, message: string, description?: string, tags?: AppErrorTag[], detail?: string) {
  const opts = baseToastOpts(description);
  if (tags?.length) opts.tags = tags;
  if (detail) opts.detail = detail;
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
  [key: string]: any; // Allow extra fields
}) {
  const tr = translate();
  const messageValue = input.messageKey ? tr(input.messageKey) : input.message ?? '';
  const scopeValue = input.scopeKey ? tr(input.scopeKey) : input.scope;

  // Extract standard fields
  const { impact, messageKey, message, scopeKey, scope, tags, detail, toast, ...extraFields } = input;

  const err: AppError = {
    id: uid('err'),
    impact,
    messageKey,
    message,
    scopeKey,
    scope,
    tags,
    detail,
    createdAt: Date.now(),
    ...extraFields // Preserve extra fields like duplicateResults
  };

  appErrors.update((xs) => prependCapped(xs, err));

  if (input.toast !== false) {
    showImpactToast(input.impact, messageValue, scopeValue, input.tags, input.detail);
  }

  return err.id;
}

export function clearAppErrors() {
  appErrors.set([]);
}

/**
 * Map RFC 7807 severity to ImpactLevel
 * Defaults to HIGH if severity is not specified or invalid
 */
function mapSeverityToImpact(severity?: string): ImpactLevel {
  if (severity && ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(severity)) {
    return severity as ImpactLevel;
  }
  // Default to HIGH if not specified
  return 'HIGH';
}

/**
 * Push RFC 7807 compliant error from backend
 * Accepts the exact RFC 7807 error response from the backend without DTO transformation
 * Preserves extra fields beyond standard RFC7807 fields for detailed error viewing
 */
export function pushRFC7807Error(error: RFC7807Error & Record<string, any>, options?: { showToast?: boolean }) {
  const impact = mapSeverityToImpact(error.severity);
  const tone: 'danger' | 'neutral' | 'warning' | 'info' | 'success' = 'danger';

  const tags: AppErrorTag[] = [];
  if (error.internal_code) {
    tags.push({ label: error.internal_code, tone });
  }
  tags.push({ label: `HTTP ${error.status}`, tone });
  if (error.instance) {
    tags.push({ label: error.instance, tone });
  }

  // Extract extra fields beyond standard RFC7807 fields
  const rfc7807Fields = ['type', 'title', 'status', 'detail', 'instance', 'internal_code', 'severity'];
  const extraFields: Record<string, any> = {};
  for (const key in error) {
    if (!rfc7807Fields.includes(key)) {
      extraFields[key] = error[key];
    }
  }

  pushImpactError({
    impact,
    message: error.detail,
    scope: error.title,
    detail: undefined,
    tags,
    toast: options?.showToast !== false,
    ...extraFields, // Preserve extra fields like duplicateResults
  });
}
