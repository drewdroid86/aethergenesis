## 2025-05-22 - Backend Hardening and DoS Mitigation
**Vulnerability:** Potential server crashes due to missing `req.body` validation and memory exhaustion in the in-memory rate limiter.
**Learning:** Even with `express.json()` limiters, application-level state (like rate-limiting maps) must be explicitly bounded using eviction strategies (e.g., FIFO) to prevent slow-leak memory exhaustion DoS. Destructuring `req.body` without a prior existence check is a common "happy path" oversight that leads to 500 errors or process crashes.
**Prevention:** Always validate `req.body` type and existence before access. Implement strict capacity limits on all in-memory caches/maps with explicit eviction policies.
