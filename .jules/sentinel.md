## 2025-05-21 - [In-memory Map Denial of Service]
**Vulnerability:** Memory exhaustion (DoS) via unbounded growth of in-memory rate-limiting maps.
**Learning:** Even with a cleanup interval, an attacker can flood the server with requests from thousands of unique IP addresses within the window, potentially causing an Out-of-Memory (OOM) crash if the map has no size limit and eviction policy.
**Prevention:** Implement a strict `MAX_ENTRIES` cap for all in-memory trackers and use a FIFO eviction strategy (e.g., `map.delete(map.keys().next().value)`) when the limit is reached to ensure predictable memory usage.

## 2025-05-22 - [Insecure WebSocket Default Secret in Production]
**Vulnerability:** Use of hardcoded default secrets for WebSocket authentication in production environments.
**Learning:** Fallback values like 'default_secret' are often left in place for developer convenience but pose a critical risk if deployed to production. Security middleware must explicitly block these known insecure values in production modes.
**Prevention:** Implement strict environment-based checks (e.g., checking `NODE_ENV === 'production'`) to reject known default or insecure configuration values for sensitive credentials.

## 2025-05-22 - [Overly Permissive Content Security Policy for Connect-Src]
**Vulnerability:** Use of overly broad `ws:` and `wss:` schemes in `connect-src` directive of Content Security Policy.
**Learning:** Allowing all WebSocket connections can enable data exfiltration via unauthorized WebSocket servers. CSP should be as restrictive as possible, targeting specific origins and ports.
**Prevention:** Dynamically generate the `connect-src` directive based on the application's authorized origins and specific service ports (e.g., WebSocket port 3001) to ensure defense in depth.
