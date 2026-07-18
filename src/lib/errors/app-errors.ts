import { get } from 'svelte/store';
import { writable } from 'svelte/store';
import { toast } from '$lib/errors/toast';
import { t } from '$lib/i18n';
import type { RFC7807Error } from '$lib/errors/rfc7807';

export type ImpactLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

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
 * Toast mapping:
 * - CRITICAL: urgent / semaphore red (`--critical`), brighter than standard error
 * - HIGH: standard error (`toast.error` / destructive)
 * - MEDIUM: warning
 * - LOW: info
 * - NONE: success (green) — the operation completed, no impact on error state
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
    case 'NONE':
      return toast.success(message, opts);
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

export function clearAppErrors() {
  appErrors.set([]);
}

/**
 * Map RFC 7807 severity to ImpactLevel.
 * RFC7807 never sends `NONE` (it's always an error response), but we handle
 * it gracefully anyway. Defaults to HIGH if severity is not specified or invalid.
 */
function mapSeverityToImpact(severity?: string): ImpactLevel {
  if (severity && ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'].includes(severity)) {
    return severity as ImpactLevel;
  }
  return 'HIGH';
}

/** Detect RFC7807 shape: has both `type` (string) and `status` (number) fields. */
function isRFC7807Input(input: any): input is RFC7807Error & Record<string, any> {
  return typeof input?.type === 'string' && typeof input?.status === 'number';
}

/** Map RFC7807 fields to NotificationInput params. */
function normalizeRFC7807(error: RFC7807Error & Record<string, any>): NotificationInput {
  const impact = mapSeverityToImpact(error.severity);
  const tone: AppErrorTag['tone'] = 'danger';

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

  return {
    impact,
    message: error.detail,
    scope: error.title,
    tags,
    ...extraFields
  };
}

export type NotificationInput = {
  impact: ImpactLevel;
  message?: string;
  messageKey?: string;
  scope?: string;
  scopeKey?: string;
  tags?: AppErrorTag[];
  detail?: string;
  toast?: boolean;
  [key: string]: any;
};

/**
 * Unified notification method. Accepts either plain params or an RFC7807
 * error object (detected by presence of `type` + `status` fields).
 *
 * - ALWAYS shows a toast (unless `toast: false`).
 * - Adds an event card to the errors panel for all impacts EXCEPT `NONE`
 *   (success — toast only, no event card because it's not an error).
 *
 * @returns the error id (for programmatic dismissal if needed)
 */
export function pushNotification(
  input: NotificationInput | (RFC7807Error & Record<string, any>)
): string {
  // 1. Detect RFC7807 and normalize to NotificationInput
  const normalized = isRFC7807Input(input)
    ? normalizeRFC7807(input as RFC7807Error & Record<string, any>)
    : (input as NotificationInput);

  // 2. Translate i18n keys if present
  const tr = translate();
  const messageValue = normalized.messageKey ? tr(normalized.messageKey) : normalized.message ?? '';
  const scopeValue = normalized.scopeKey ? tr(normalized.scopeKey) : normalized.scope;

  // 3. Build AppError object
  const { impact, messageKey, message, scopeKey, scope, tags, detail, toast: showToast, ...extraFields } = normalized;

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
    ...extraFields
  };

  // 4. Add to errors panel ONLY if impact !== NONE
  if (impact !== 'NONE') {
    appErrors.update((xs) => prependCapped(xs, err));
  }

  // 5. Always show toast (unless toast === false)
  if (showToast !== false) {
    showImpactToast(impact, messageValue, scopeValue, tags, detail);
  }

  return err.id;
}
