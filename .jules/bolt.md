## 2025-05-14 - [Stateful Box-Muller Transform]
**Learning:** The Box-Muller transform generates two independent normally distributed values per computation. Caching the second value avoids redundant mathematical operations (Math.sqrt, Math.log, Math.sin/cos) and Math.random() calls in high-iteration loops.
**Action:** Use a module-level or closure-scoped cache for random number utilities that generate multiple values per cycle to improve initialization speed of large-scale systems (e.g., 50,000+ stars).
