export type ModuleInfo = {
  id: string;
  name: string;
  enabled: boolean;
};

/** Proxy/gateway/timeouts: backend likely down or unreachable. */
export function isUnreachableHttpStatus(status: number): boolean {
  if (status === 502 || status === 503 || status === 504) return true;
  if (status >= 520 && status <= 524) return true;
  return false;
}

/** Thrown when the API cannot be reached (network failure or typical proxy errors). */
export class ApiUnreachableError extends Error {
  override readonly name = 'ApiUnreachableError';
  readonly status: number | null;

  constructor(status: number | null = null) {
    super('ApiUnreachableError');
    this.status = status;
  }
}

export async function fetchModules(): Promise<ModuleInfo[]> {
  let res: Response;
  try {
    res = await fetch('/api/v1/modules');
  } catch {
    throw new ApiUnreachableError(null);
  }
  if (!res.ok) {
    if (isUnreachableHttpStatus(res.status)) {
      throw new ApiUnreachableError(res.status);
    }
    throw new Error(`Modules request failed (${res.status})`);
  }
  const data = (await res.json()) as { modules: ModuleInfo[] };
  return data.modules;
}
