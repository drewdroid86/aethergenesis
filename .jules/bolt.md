## 2025-05-21 - Hot Loop Optimization & Allocation Reduction
**Learning:** High-frequency animation loops (60fps) suffer from object allocation pressure and redundant calculations. Using `addScaledVector` instead of `clone().multiplyScalar()` eliminates thousands of temporary `Vector3` objects per second. Implementing Manhattan distance pruning in $O(n^2)$ loops provides a significant speedup by skipping expensive multiplications for distant entities.
**Action:** Always prefer in-place vector operations (e.g., `addScaledVector`, `copy`) in `update` methods. Use Manhattan distance as a cheap pre-filter for spatial proximity checks.

## 2025-05-21 - Type Safety in Rendering Systems
**Learning:** The `PlanetarySystem` constructor is strictly defined to accept only a star object. Attempting to pass additional configuration (like planet count) as a second argument triggers `TS2554` build errors, even if intended for future scalability.
**Action:** Stick to the established constructor signatures for rendering systems to maintain build stability.
