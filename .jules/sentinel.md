## 2025-05-21 - [In-memory Map Denial of Service]
**Vulnerability:** Memory exhaustion (DoS) via unbounded growth of in-memory rate-limiting maps.
**Learning:** Even with a cleanup interval, an attacker can flood the server with requests from thousands of unique IP addresses within the window, potentially causing an Out-of-Memory (OOM) crash if the map has no size limit and eviction policy.
**Prevention:** Implement a strict `MAX_ENTRIES` cap for all in-memory trackers and use a FIFO eviction strategy (e.g., `map.delete(map.keys().next().value)`) when the limit is reached to ensure predictable memory usage.

## 2025-05-22 - [WebSocket DoS and Loopback Vulnerability]
**Vulnerability:** Potential resource exhaustion through unbounded WebSocket connections and message flooding, plus DoS amplification via loopback.
**Learning:** WebSocket servers require explicit connection limits and per-client message rate limiting to survive automated flood attacks. Forwarding events without an exclusion parameter can cause redundant processing or loopback cycles.
**Prevention:** Enforce `MAX_CLIENTS` and a per-connection `MESSAGE_RATE_LIMIT`. Update broadcast functions to support an `exclude` parameter that skips the message originator.
