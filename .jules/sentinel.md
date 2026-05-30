## 2025-05-21 - [In-memory Map Denial of Service]
**Vulnerability:** Memory exhaustion (DoS) via unbounded growth of in-memory rate-limiting maps.
**Learning:** Even with a cleanup interval, an attacker can flood the server with requests from thousands of unique IP addresses within the window, potentially causing an Out-of-Memory (OOM) crash if the map has no size limit and eviction policy.
**Prevention:** Implement a strict `MAX_ENTRIES` cap for all in-memory trackers and use a FIFO eviction strategy (e.g., `map.delete(map.keys().next().value)`) when the limit is reached to ensure predictable memory usage.

## 2025-05-22 - [WebSocket Resource Exhaustion and Loopback]
**Vulnerability:** Denial of Service (DoS) via WebSocket connection flooding and message rate-limiting bypass, plus redundant processing from loopback broadcasts.
**Learning:** WebSocket servers require explicit limits on both the number of concurrent connections and the message rate per client. Without an `exclude` parameter in broadcast functions, the sender receives their own messages, causing unnecessary overhead and potential loops.
**Prevention:** Implement `MAX_CLIENTS` check on connection, per-client rate limiting in the message handler, and an `exclude` parameter in broadcast logic to ignore the sender.
