## 2025-05-14 - Redundant Server-Side Fallback and CSP Hardening
**Vulnerability:** Redundant hardcoded fallback data in server-side error handler and missing isolation/feature-restriction security headers.
**Learning:** Returning specific fallback data on server errors violates "Fail Securely" and can be redundant if the client already implements a UI fallback.
**Prevention:** Always return generic error messages from the backend and use the client for UI-specific fallback logic. Implement isolation headers like COOP/CORP by default.

## 2025-05-15 - Untrusted LLM Output and API Contract Synchronization
**Vulnerability:** Insecure parsing of LLM responses and availability issues due to client-server logic mismatch.
**Learning:** LLM responses are untrusted and can be malformed; calling `JSON.parse` without protection can crash the request handler. Furthermore, availability is a security concern (CIA triad); mismatched validation logic between client and server renders features unavailable.
**Prevention:** Wrap all AI output parsing in `try-catch` blocks and implement strict length/range sanitization. Ensure validation constants (like star phases) are synchronized across the stack.
