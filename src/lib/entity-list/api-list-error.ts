/**
 * api-list-error — shared helpers for entity list/meta fetch error handling.
 *
 * Lifted from the ×5 verbatim copies that lived inside every list page
 * (users / customers / organizations / roles / clients). Canonical shape:
 * RFC 7807 fields preferred, `error`/`title` legacy fields supported.
 */
import {
  ApiDatabaseUnavailableError,
  ApiUnreachableError
} from '$lib/api';
import type { AppErrorTag } from '$lib/errors/app-errors';

/** Fetch-level error carrying the BE error code + HTTP status + RFC 7807 extras. */
export class ApiListError extends Error {
  readonly status: number;
  readonly code: string;
  readonly internalCode?: string;
  readonly instance?: string;

  constructor(code: string, status: number, internalCode?: string, instance?: string) {
    super(code);
    this.code = code;
    this.status = status;
    this.internalCode = internalCode;
    this.instance = instance;
  }
}

export interface ApiErrorDetails {
  code: string | null;
  internalCode: string | null;
  instance: string | null;
  status: number | null;
}

/** Parse the response body for RFC 7807 / legacy `error` fields (best-effort). */
export async function readApiErrorDetails(res: Response): Promise<ApiErrorDetails> {
  try {
    const data = (await res.json()) as {
      error?: unknown;
      title?: unknown;
      internal_code?: unknown;
      instance?: unknown;
      status?: unknown;
    };
    const code =
      typeof data?.error === 'string' ? data.error : typeof data?.title === 'string' ? data.title : null;
    const internalCode = typeof data?.internal_code === 'string' ? data.internal_code : null;
    const instance = typeof data?.instance === 'string' ? data.instance : null;
    const status = typeof data?.status === 'number' ? data.status : res.status;
    return { code, internalCode, instance, status };
  } catch {
    return { code: null, internalCode: null, instance: null, status: res.status };
  }
}

export function isAbortError(e: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError') ||
    (e instanceof Error && e.name === 'AbortError')
  );
}

/** Normalize any thrown value into `{code, status}` for notification mapping. */
export function asApiListError(e: unknown): { code: string; status: number | null } | null {
  if (e instanceof ApiDatabaseUnavailableError) {
    return { code: 'DATABASE_UNAVAILABLE', status: e.status };
  }
  if (e instanceof ApiUnreachableError) {
    return { code: 'BACKEND_OFFLINE', status: e.status };
  }
  if (!e || typeof e !== 'object') return null;
  const anyE = e as { name?: string; code?: string; message?: string; status?: number | null };
  const code =
    typeof anyE.code === 'string' ? anyE.code : typeof anyE.message === 'string' ? anyE.message : null;
  const status = typeof anyE.status === 'number' ? anyE.status : null;
  if (!code) return null;
  return { code, status };
}

/** Gateway / proxy / network — not application-level DB down (`ApiDatabaseUnavailableError`). */
export function isBackendGatewayUnreachable(code: string, status: number | null): boolean {
  if (code === 'DATABASE_UNAVAILABLE') return false;
  return code === 'BACKEND_OFFLINE' || (status !== null && (status === 502 || status === 503 || status === 504));
}

/** When status is unknown (gated), show HTTP 502 as the agreed "proxy/offline" tag. */
export function httpTagForGatewayFailure(status: number | null): number {
  return typeof status === 'number' ? status : 502;
}

export function backendOfflineTags(status: number | null): AppErrorTag[] {
  const http = httpTagForGatewayFailure(status);
  return [
    { label: 'BACKEND_OFFLINE', tone: 'danger' },
    { label: `HTTP ${http}`, tone: 'danger' }
  ];
}
