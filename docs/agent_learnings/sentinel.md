## 2026-05-04 - [Secure AI Analysis]
**Vulnerability:** Information leakage in AI API error logs and potential for API abuse via rapid clicking.
**Learning:** Raw API errors can contain sensitive configuration or key fragments. Lack of throttling on client-side AI calls can lead to unintentional DoS or cost spikes.
**Prevention:** Always use generic error messages for AI-related failures in production. Implement client-side throttling/debouncing for high-cost API operations.

## 2026-05-15 - [LLM Response Schema Validation]
**Vulnerability:** Untrusted state updates from non-validated AI JSON responses.
**Learning:** LLM outputs are non-deterministic and can be influenced by indirect prompt injection or hallucinations. Parsing these directly into application state without strict schema validation can lead to UI breakage or logic errors.
**Prevention:** Treat LLM responses as untrusted user input. Implement strict field presence and type checking before committing AI-generated data to the global state.

## 2026-05-22 - [Config Leakage via Proxy Errors]
**Vulnerability:** Revealing environment state through error messages in an API proxy.
**Learning:** Returning specific error messages like "API key missing" when an LLM fails allows external actors to fingerprint the server's environment configuration and service availability.
**Prevention:** Mask internal configuration status behind generic HTTP status codes (e.g., 503 Service Unavailable) and log details only on the server side.

## 2026-05-11 - [Proxy IP Trust for Rate Limiting]
**Vulnerability:** Rate limiting by IP can be bypassed or incorrectly applied to the proxy server's IP if the application doesn't trust the proxy.
**Learning:** When running behind a load balancer or proxy (like Render, Heroku, or Nginx), `req.ip` will often return the proxy's IP instead of the client's. This means rate limiting could throttle all users globally or fail to block a specific malicious actor.
**Prevention:** Configure Express with `app.set('trust proxy', 1)` (or the appropriate number of hops) to ensure the `X-Forwarded-For` header is parsed correctly for client IP identification.

## 2026-05-12 - [Hardened AI Proxy & Payload Limits]
**Vulnerability:** Risk of payload-based DoS and untrusted data from LLM response.
**Learning:** Even with schema enforcement, LLM responses should be treated as untrusted. Sanitizing outputs protects the client. Setting overly restrictive payload limits (e.g., 1kb) can break legitimate requests; a balanced limit (e.g., 10kb-1mb) is safer.
**Prevention:** Implement strict whitelisting for AI response fields and set realistic payload limits on the server.

## 2025-05-24 - [ADQL Injection Prevention]
**Vulnerability:** Unsanitized user input concatenated into ADQL queries for the SIMBAD TAP service.
**Learning:** MCP servers that proxy queries to external SQL-like services (like SIMBAD's TAP ADQL) are vulnerable to injection if they don't escape control characters like single quotes.
**Prevention:** Always sanitize user-provided strings by escaping single quotes (replace `'` with `''`) before interpolating them into ADQL/SQL query strings.

## 2026-06-23 - [WebSocket Auth Bypass via handleProtocols]
**Vulnerability:** Authentication bypass in WebSocket servers using only `handleProtocols`.
**Learning:** The `handleProtocols` hook in the `ws` library is only triggered if the client sends a `Sec-WebSocket-Protocol` header. If the client omits this header, they can bypass subprotocol-based authentication entirely.
**Prevention:** Use `verifyClient` or manually handle the `upgrade` event to enforce that an authentication token is present and valid before accepting the connection. Additionally, always validate the `Origin` header to prevent Cross-Site WebSocket Hijacking (CSWH).
