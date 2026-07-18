/**
 * MCP OAuth client helpers — used by the consent screen to parse OAuth params
 * from the URL and build redirect URLs back to the BE authorize endpoint.
 */

/** OAuth parameters passed from BE → FE consent screen via query string. */
export interface McpConsentParams {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  mcp_client_name: string;
  scope: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
}

/** Scope metadata for display in the consent UI. */
export interface ScopeInfo {
  name: string;
  description: string;
}

/** Human-readable descriptions for known OAuth scopes. */
const SCOPE_DESCRIPTIONS: Record<string, string> = {
  'mcp:tools': 'Access MCP tools (list entities, CRUD operations, service management)',
  openid: 'Verify your identity',
  profile: 'Read your profile information',
  email: 'Read your email address',
};

/**
 * Parse consent parameters from the current URL query string.
 * Returns null if required parameters are missing.
 */
export function parseConsentParams(searchParams: URLSearchParams): McpConsentParams | null {
  const client_id = searchParams.get('client_id');
  const redirect_uri = searchParams.get('redirect_uri');
  const response_type = searchParams.get('response_type');
  const mcp_client_name = searchParams.get('mcp_client_name');
  const scope = searchParams.get('scope');

  if (!client_id || !redirect_uri || !response_type || !mcp_client_name || !scope) {
    return null;
  }

  return {
    client_id,
    redirect_uri,
    response_type,
    mcp_client_name,
    scope,
    state: searchParams.get('state') ?? undefined,
    code_challenge: searchParams.get('code_challenge') ?? undefined,
    code_challenge_method: searchParams.get('code_challenge_method') ?? undefined,
  };
}

/**
 * Parse the scope string into individual scope info objects for display.
 */
export function parseScopes(scopeString: string): ScopeInfo[] {
  return scopeString
    .split(' ')
    .filter((s) => s.length > 0)
    .map((name) => ({
      name,
      description: SCOPE_DESCRIPTIONS[name] ?? `Access: ${name}`,
    }));
}

/**
 * Build the BE authorize URL with consent_approved=true.
 * The FE redirects here after the user approves the consent.
 */
export function buildApproveUrl(params: McpConsentParams, beBaseUrl: string): string {
  const url = new URL('/mcp/oauth/authorize', beBaseUrl);
  url.searchParams.set('client_id', params.client_id);
  url.searchParams.set('redirect_uri', params.redirect_uri);
  url.searchParams.set('response_type', params.response_type);
  url.searchParams.set('scope', params.scope);
  url.searchParams.set('consent_approved', 'true');
  url.searchParams.set('mcp_client_name', params.mcp_client_name);

  if (params.state) {
    url.searchParams.set('state', params.state);
  }
  if (params.code_challenge) {
    url.searchParams.set('code_challenge', params.code_challenge);
    url.searchParams.set('code_challenge_method', params.code_challenge_method ?? 'S256');
  }

  return url.toString();
}

/**
 * Build the deny redirect URL — sends the user directly back to the AI client
 * with an access_denied error (per RFC 6749 §4.1.2.1).
 */
export function buildDenyUrl(params: McpConsentParams): string {
  const url = new URL(params.redirect_uri);
  url.searchParams.set('error', 'access_denied');
  url.searchParams.set('error_description', 'The user denied the consent request');

  if (params.state) {
    url.searchParams.set('state', params.state);
  }

  return url.toString();
}
