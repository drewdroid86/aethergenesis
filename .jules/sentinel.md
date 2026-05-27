## 2025-05-21 - [In-memory Map Denial of Service]
**Vulnerability:** Memory exhaustion (DoS) via unbounded growth of in-memory rate-limiting maps.
**Learning:** Even with a cleanup interval, an attacker can flood the server with requests from thousands of unique IP addresses within the window, potentially causing an Out-of-Memory (OOM) crash if the map has no size limit and eviction policy.
**Prevention:** Implement a strict `MAX_ENTRIES` cap for all in-memory trackers and use a FIFO eviction strategy (e.g., `map.delete(map.keys().next().value)`) when the limit is reached to ensure predictable memory usage.

## 2025-05-22 - [Cross-Site WebSocket Hijacking (CSWH)]
**Vulnerability:** Lack of origin validation on WebSocket handshake allows unauthorized websites to connect and interact with the simulation state.
**Learning:** WebSockets are not restricted by the Same-Origin Policy (SOP). Browsers automatically send the `Origin` header during the handshake, which must be verified against a whitelist to prevent malicious sites from hijacking the connection.
**Prevention:** Use `verifyClient` or similar middleware to enforce strict `Origin` checks during the WebSocket upgrade process and implement payload size limits (`maxPayload`) to mitigate DoS risks.