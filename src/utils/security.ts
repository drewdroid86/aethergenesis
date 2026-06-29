/**
 * Security: Robust anchored regex matching specific private/local hostnames and IP ranges
 * to prevent subdomain bypasses (e.g. evil.localhost.com) that occur with startsWith/includes.
 * Matches: localhost, 127.0.0.1, RFC 1918 (Private IPs), and Tailscale IP ranges.
 */
export const SAFE_DEV_ORIGIN_REGEX = /^https?:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+)(?::\d+)?$/;

/**
 * Validates if an origin is allowed based on a whitelist and development-only regex.
 * @param origin The origin header from the request
 * @param allowedOrigins Explicitly allowed production/staging origins
 * @param isDev Whether the application is running in development mode
 */
export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[], isDev: boolean): boolean {
    if (!origin) return false;

    // 1. Check against explicit whitelist
    if (allowedOrigins.includes(origin)) return true;

    // 2. In development, allow local/private network origins via strict regex
    if (isDev && SAFE_DEV_ORIGIN_REGEX.test(origin)) {
        return true;
    }

    return false;
}
