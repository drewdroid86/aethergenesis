## 2025-05-21 - [In-memory Map Denial of Service]
**Vulnerability:** Memory exhaustion (DoS) via unbounded growth of in-memory rate-limiting maps.
**Learning:** Even with a cleanup interval, an attacker can flood the server with requests from thousands of unique IP addresses within the window, potentially causing an Out-of-Memory (OOM) crash if the map has no size limit and eviction policy.
**Prevention:** Implement a strict `MAX_ENTRIES` cap for all in-memory trackers and use a FIFO eviction strategy (e.g., `map.delete(map.keys().next().value)`) when the limit is reached to ensure predictable memory usage.

## 2025-05-22 - [WebSocket DoS and Mixed Content Vulnerabilities]
**Vulnerability:** Lack of connection limits, per-client rate limiting, and hardcoded `ws://` protocols in the simulation sync engine.
**Learning:** WebSocket servers without explicit connection caps or per-client message limits can be easily overwhelmed by malicious clients or legitimate broadcast loops. Hardcoded `ws://` protocols cause mixed-content failures in HTTPS production environments.
**Prevention:** Always implement `MAX_CLIENTS` and per-connection message counters with automatic metadata cleanup. Dynamically detect `window.location.protocol` to use `wss:` in production to ensure secure transport and bypass browser mixed-content blocks.
