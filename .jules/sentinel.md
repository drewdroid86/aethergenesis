## 2025-05-14 - Redundant Server-Side Fallback and CSP Hardening
**Vulnerability:** Redundant hardcoded fallback data in server-side error handler and missing isolation/feature-restriction security headers.
**Learning:** Returning specific fallback data on server errors violates "Fail Securely" and can be redundant if the client already implements a UI fallback.
**Prevention:** Always return generic error messages from the backend and use the client for UI-specific fallback logic. Implement isolation headers like COOP/CORP by default.
