/**
 * Security: Robust regex for validating allowed origins in development.
 * Matches localhost, 127.0.0.1, and private IP ranges (RFC 1918, Tailscale).
 * Anchored with ^ and $ to prevent subdomain bypasses like 'http://10.attacker.com'.
 */
export const SAFE_DEV_ORIGIN_REGEX = /^https?:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+)(?::\d+)?$/;

/**
 * Validates if an origin is allowed based on explicit allowedOrigins list or safe dev patterns.
 */
export function isOriginAllowed(origin: string, allowedOrigins: string[], isDev: boolean): boolean {
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;
  // Note: in dev, we use a strict regex to prevent DNS rebinding or subdomain bypasses.
  // The regex already covers localhost (with and without ports).
  if (isDev && SAFE_DEV_ORIGIN_REGEX.test(origin)) return true;
  return false;
}
