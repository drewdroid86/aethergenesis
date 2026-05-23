## 2026-05-20 - [Backend Resilience & HSTS Hardening]
**Vulnerability:** Memory exhaustion DoS via unbounded in-memory rate limit map; potential server crash from malformed JSON destructuring; implementation detail leakage via unhandled exceptions.
**Learning:** Even with a `MAX_ENTRIES` constant defined, it must be explicitly enforced during map insertion to prevent OOM. Destructuring `req.body` without a prior existence and type check is a common vector for 400-level server crashes.
**Prevention:** Always implement FIFO eviction for in-memory caches; validate `req.body` existence before destructuring; use a global error handler to sanitize all 500-level responses.
