import { writable } from "svelte/store";

export type AppError = {
  id: string;
  message: string;
  scope?: string;
  detail?: string;
  createdAt: number;
};

export type AppToast = {
  id: string;
  message: string;
  scope?: string;
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
    message: input.message,
    scope: input.scope,
    detail: input.detail,
    createdAt: Date.now(),
  };
  appErrors.update((xs) => [err, ...xs]);

  if (input.toast !== false) {
    const toast: AppToast = {
      id: uid("toast"),
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

export function clearAppErrors() {
  appErrors.set([]);
}

