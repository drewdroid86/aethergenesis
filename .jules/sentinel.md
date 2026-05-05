## 2026-05-04 - [Secure AI Analysis]
**Vulnerability:** Information leakage in AI API error logs and potential for API abuse via rapid clicking.
**Learning:** Raw API errors can contain sensitive configuration or key fragments. Lack of throttling on client-side AI calls can lead to unintentional DoS or cost spikes.
**Prevention:** Always use generic error messages for AI-related failures in production. Implement client-side throttling/debouncing for high-cost API operations.
