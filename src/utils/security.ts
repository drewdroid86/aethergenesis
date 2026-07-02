/**
 * Security: Centralized origin validation utility.
 * Protects against Cross-Site WebSocket Hijacking (CSWH) and CORS bypasses
 * by using anchored regex for private and local IP ranges.
 */

// Matches:
// - localhost and 127.0.0.1 (with optional port)
// - 10.x.x.x (Private RFC 1918)
// - 192.168.x.x (Private RFC 1918)
// - 100.64.x.x - 100.127.x.x (Tailscale/Carrier-grade NAT)
export const SAFE_DEV_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

/**
 * Validates if an origin is allowed based on explicit whitelist or safe dev patterns.
 */
export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[], isDev: boolean): boolean {
  if (!origin) return false;

  // 1. Check explicit whitelist (production & dev)
  if (allowedOrigins.includes(origin)) return true;

  // 2. Check safe dev patterns (localhost and private network)
  if (isDev && SAFE_DEV_ORIGIN_REGEX.test(origin)) {
    return true;
  }

  return false;
}
