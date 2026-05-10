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

## 2026-05-30 - [Centralized Security Header Enforcement]
**Vulnerability:** Weak security policy enforcement via HTML meta tags and missing transport security.
**Learning:** CSP and Referrer policies defined in `<meta>` tags are limited in scope and don't cover all resource types or API responses. Missing `Strict-Transport-Security` (HSTS) leaves users vulnerable to SSL stripping.
**Prevention:** Centralize all security policies in server-side HTTP headers. Use `app.set('trust proxy', 1)` when running behind reverse proxies to ensure security logic (like rate limiting) receives the correct client IP.
