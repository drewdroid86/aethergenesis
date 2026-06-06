## 2025-05-21 - [In-memory Map Denial of Service]
**Vulnerability:** Memory exhaustion (DoS) via unbounded growth of in-memory rate-limiting maps.
**Learning:** Even with a cleanup interval, an attacker can flood the server with requests from thousands of unique IP addresses within the window, potentially causing an Out-of-Memory (OOM) crash if the map has no size limit and eviction policy.
**Prevention:** Implement a strict `MAX_ENTRIES` cap for all in-memory trackers and use a FIFO eviction strategy (e.g., `map.delete(map.keys().next().value)`) when the limit is reached to ensure predictable memory usage.

## 2026-06-06 - [WebSocket Event Whitelisting]
**Vulnerability:** Arbitrary event broadcasting. The WebSocket server previously forwarded any message with a "type: event" or "event" property to all clients and local handlers without validation.
**Learning:** Open event buses can be abused to trigger unauthorized actions or perform DoS amplification if the client-side or server-side handlers don't strictly validate the event names.
**Prevention:** Always implement a strict whitelist of allowed event names at the entry point (the WebSocket  handler) to ensure only intended commands are processed and propagated.
