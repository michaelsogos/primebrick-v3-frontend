/**
 * RFC 7807 Problem Details for HTTP APIs
 * Standard error response format from backend
 */
export interface RFC7807Error {
  /** URI reference to error type */
  type: string;
  /** Short human-readable summary */
  title: string;
  /** HTTP status code */
  status: number;
  /** Human-readable explanation */
  detail: string;
  /** Application-specific error code (UPPERCASE_SNAKE_CASE) */
  internal_code?: string;
  /** URI reference to specific occurrence (API path) */
  instance?: string;
  /** Severity/impact level override */
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}
