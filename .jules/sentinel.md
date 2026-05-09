## 2026-05-04 - [Secure AI Analysis]
**Vulnerability:** Information leakage in AI API error logs and potential for API abuse via rapid clicking.
**Learning:** Raw API errors can contain sensitive configuration or key fragments. Lack of throttling on client-side AI calls can lead to unintentional DoS or cost spikes.
**Prevention:** Always use generic error messages for AI-related failures in production. Implement client-side throttling/debouncing for high-cost API operations.

## 2026-05-15 - [LLM Response Schema Validation]
**Vulnerability:** Untrusted state updates from non-validated AI JSON responses.
**Learning:** LLM outputs are non-deterministic and can be influenced by indirect prompt injection or hallucinations. Parsing these directly into application state without strict schema validation can lead to UI breakage or logic errors.
**Prevention:** Treat LLM responses as untrusted user input. Implement strict field presence and type checking before committing AI-generated data to the global state.
