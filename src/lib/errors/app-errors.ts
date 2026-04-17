import { writable } from "svelte/store";

export type ImpactLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type AppErrorTag = {
  label: string;
  tone?: "neutral" | "danger" | "warning" | "info" | "success";
};

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

export type AppToast = {
  id: string;
  impact: ImpactLevel;
  messageKey?: string;
  message?: string;
  scopeKey?: string;
  scope?: string;
  tags?: AppErrorTag[];
  createdAt: number;
};

export const appErrors = writable<AppError[]>([]);
export const appToasts = writable<AppToast[]>([]);

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function pushAppError(input: { message: string; scope?: string; detail?: string; toast?: boolean }) {
  const err: AppError = {
    id: uid("err"),
    impact: "MEDIUM",
    message: input.message,
    scope: input.scope,
    detail: input.detail,
    createdAt: Date.now(),
  };
  appErrors.update((xs) => [err, ...xs]);

  if (input.toast !== false) {
    const toast: AppToast = {
      id: uid("toast"),
      impact: err.impact,
      message: input.message,
      scope: input.scope,
      createdAt: err.createdAt,
    };
    appToasts.update((xs) => [toast, ...xs]);
    setTimeout(() => {
      appToasts.update((xs) => xs.filter((t) => t.id !== toast.id));
    }, 5000);
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
  const err: AppError = {
    id: uid("err"),
    impact: input.impact,
    messageKey: input.messageKey,
    message: input.message,
    scopeKey: input.scopeKey,
    scope: input.scope,
    tags: input.tags,
    detail: input.detail,
    createdAt: Date.now(),
  };
  appErrors.update((xs) => [err, ...xs]);

  if (input.toast !== false) {
    const toast: AppToast = {
      id: uid("toast"),
      impact: err.impact,
      messageKey: err.messageKey,
      message: err.message,
      scopeKey: err.scopeKey,
      scope: err.scope,
      tags: err.tags,
      createdAt: err.createdAt,
    };
    appToasts.update((xs) => [toast, ...xs]);
    setTimeout(() => {
      appToasts.update((xs) => xs.filter((t) => t.id !== toast.id));
    }, 5000);
  }

  return err.id;
}

export function clearAppErrors() {
  appErrors.set([]);
}

