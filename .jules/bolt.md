## 2025-05-22 - Optimize Repulsion Physics and Hot Loops
**Learning:** The $O(N^2)$ repulsion physics loop in `Engine.update` was a major bottleneck as the number of stars increased. Standard `forEach` loops in high-frequency (60fps) animation paths introduce unnecessary closure allocations and function call overhead.
**Action:** Use AABB/Manhattan pruning and hoist property access in nested physics loops. Replace `forEach` with standard `for` loops in hot paths like `Engine.update` and `Engine.dispose`.
