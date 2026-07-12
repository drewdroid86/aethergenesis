/**
 * Security: Robust regex for matching safe dev origins (localhost, 127.0.0.1, and RFC 1918 / Tailscale private ranges).
 * Anchored with ^ and : to prevent subdomain bypasses like "http://localhost.evil.com".
 */
export const SAFE_DEV_ORIGIN_REGEX = /^http:\/\/(localhost|\[::1\]|127\.0\.0\.1|100\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/;

/**
 * Validates if an origin is allowed based on explicit allowed list and dev environment rules.
 * Centralized to ensure consistent security across Express and WebSocket servers.
 */
export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[], isDev: boolean): boolean {
    if (!origin) return false;

    // 1. Check explicit allowed list
    if (allowedOrigins.includes(origin)) return true;

    // 2. In dev mode, allow localhost and private network ranges using robust regex
    if (isDev && SAFE_DEV_ORIGIN_REGEX.test(origin)) {
        return true;
    }

    return false;
}
