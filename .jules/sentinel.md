## 2025-05-15 - WebSocket Security Hardening
**Vulnerability:** Hardcoded `ws://` protocol and unvalidated event broadcasting.
**Learning:** Hardcoded insecure protocols lead to Mixed Content blocks in secure environments (HTTPS), and broadcasting unvalidated events allows any connected client to trigger disruptive global actions (like `reset`) across all user sessions.
**Prevention:** Dynamically detect protocol (`ws:` vs `wss:`) and use strict event whitelisting to validate incoming messages before processing or broadcasting.
