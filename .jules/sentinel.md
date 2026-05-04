## 2025-05-04 - Client-side API Key Exposure Pattern
**Vulnerability:** API keys (like GEMINI_API_KEY) are often exposed to the client-side bundle in AI Studio projects via Vite's `define` or `loadEnv`.
**Learning:** This is a common pattern for "frontend-only" AI apps, but it violates the principle of keeping secrets on the server.
**Prevention:** In a production environment, always use a backend proxy to interact with sensitive APIs.

## 2025-05-04 - CSP and Referrer Policy for Defense-in-Depth
**Vulnerability:** Lack of security headers (CSP, Referrer-Policy) in the HTML template.
**Learning:** Even if no immediate vulnerabilities are found, adding a strict CSP is a critical defense-in-depth measure.
**Prevention:** Always include basic security meta tags in the base HTML template of new projects.
