/**
 * Security: Anchored regex to prevent subdomain bypasses (e.g., http://10.attacker.com)
 * Matches localhost, 127.0.0.1, and common private network ranges (RFC 1918, Tailscale).
 */
export const SAFE_DEV_ORIGIN_REGEX = /^http:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+)(:\d+)?$/;

/**
 * Validates if an origin is allowed based on hardcoded allowed origins or development patterns.
 */
export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;

  const isDev = process.env.NODE_ENV !== 'production';
  return !!(isDev && SAFE_DEV_ORIGIN_REGEX.test(origin));
}
