## 2025-05-21 - [In-memory Map Denial of Service]
**Vulnerability:** Memory exhaustion (DoS) via unbounded growth of in-memory rate-limiting maps.
**Learning:** Even with a cleanup interval, an attacker can flood the server with requests from thousands of unique IP addresses within the window, potentially causing an Out-of-Memory (OOM) crash if the map has no size limit and eviction policy.
**Prevention:** Implement a strict `MAX_ENTRIES` cap for all in-memory trackers and use a FIFO eviction strategy (e.g., `map.delete(map.keys().next().value)`) when the limit is reached to ensure predictable memory usage.

## 2025-05-22 - [WebSocket Denial of Service and Resource Exhaustion]
**Vulnerability:** The WebSocket server lacked connection limits and per-client message rate limiting, making it susceptible to memory exhaustion (via OOM) and CPU exhaustion (via JSON parsing/broadcasting floods).
**Learning:** WebSocket connections are long-lived and stateful; unlike HTTP, they require explicit tracking of per-socket metadata to enforce limits effectively across the connection lifecycle.
**Prevention:** Always implement `MAX_CLIENTS` limits and per-socket message rate limiting. Use a Map to track socket metadata and ensure it is cleaned up on both `close` and `error` events to prevent memory leaks.
