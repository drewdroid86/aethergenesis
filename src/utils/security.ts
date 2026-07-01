/**
 * Security: Robust, anchored regex matching for development origins.
 * Supports localhost, 127.0.0.1, private IP ranges (RFC 1918), and Tailscale IPs.
 * Ensures that 'localhost.attacker.com' or '127.0.0.1.com' cannot bypass the check.
 */
export const SAFE_DEV_ORIGIN_REGEX = /^http:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|100\.\d+\.\d+\.\d+)(?::\d+)?$/;

/**
 * Validates if an origin is allowed based on an explicit whitelist or safe dev patterns.
 */
export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[], isDev: boolean): boolean {
  if (!origin) return false;

  // 1. Check explicit whitelist
  if (allowedOrigins.includes(origin)) return true;

  // 2. In development, allow local/private ranges via anchored regex
  if (isDev && SAFE_DEV_ORIGIN_REGEX.test(origin)) {
    return true;
  }

  return false;
}
