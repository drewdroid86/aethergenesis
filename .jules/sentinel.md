## 2026-05-13 - [Hardened AI Proxy and Rate Limiting]
**Vulnerability:** Simple in-memory rate limiting was prone to memory exhaustion (DoS) and lacked standard headers. Error responses included hardcoded fallback data that could leak intended data structures.
**Learning:** Transitioning to `express-rate-limit` provides a more robust and standard way to handle abuse while protecting server memory.
**Prevention:** Use industry-standard middleware for rate limiting and ensure error handlers return generic messages without any structured application data.
