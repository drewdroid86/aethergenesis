## 2025-05-14 - Redundant Server-Side Fallback and CSP Hardening
**Vulnerability:** Redundant hardcoded fallback data in server-side error handler and missing isolation/feature-restriction security headers.
**Learning:** Returning specific fallback data on server errors violates "Fail Securely" and can be redundant if the client already implements a UI fallback.
**Prevention:** Always return generic error messages from the backend and use the client for UI-specific fallback logic. Implement isolation headers like COOP/CORP by default.

## 2025-05-15 - Untrusted LLM Output and API Contract Synchronization
**Vulnerability:** Insecure parsing of LLM responses and availability issues due to client-server logic mismatch.
**Learning:** LLM responses are untrusted and can be malformed; calling `JSON.parse` without protection can crash the request handler. Furthermore, availability is a security concern (CIA triad); mismatched validation logic between client and server renders features unavailable.
**Prevention:** Wrap all AI output parsing in `try-catch` blocks and implement strict length/range sanitization. Ensure validation constants (like star phases) are synchronized across the stack.

## 2025-05-16 - Global Error Handling and Request Validation Robustness
**Vulnerability:** Potential for process crashes and stack trace leakage via unhandled asynchronous errors in Express routes.
**Learning:** Even with individual try-catch blocks, missing a global error handler in Express can lead to the default error handler being used, which may expose environment details or crash the process. Furthermore, destructuring `req.body` without verifying its type can lead to unhandled type errors.
**Prevention:** Always implement a four-argument global error middleware as the last step in the Express app. Perform explicit type checks on `req.body` before destructuring for defense-in-depth.

## 2026-05-17 - Rate Limiter DoS and Input Bound Hardening
**Vulnerability:** Potential for a permanent Denial of Service (DoS) for new users due to a fixed-size rate limiter without an eviction policy, and lack of upper bounds on numeric inputs.
**Learning:** In-memory maps used for security (like rate limiting) must have a defined eviction policy (e.g., LRU or FIFO) to prevent "filling up" and blocking legitimate new traffic. Furthermore, input validation should not only check types but also enforce "reasonable" physical bounds to prevent unexpected model behavior or resource strain.
**Prevention:** Always implement an eviction policy for in-memory security stores when they reach a maximum capacity. Enforce semantic upper and lower bounds on all numeric inputs as part of a defense-in-depth strategy.
