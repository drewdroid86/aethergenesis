# Bolt's Journal - Critical Performance Learnings

## 2025-05-15 - [Hot Path Optimization in Three.js]
**Learning:** In high-frequency rendering loops (60fps), `.forEach` and repeated object allocations (e.g., `vector.clone()`) introduce significant overhead and GC pressure. Expensive operations like matrix inversion (`matrix.invert()`) and GPU uniform updates should be guarded by "dirty" checks or equality comparisons to avoid redundant work when state hasn't changed.
**Action:** Replace `forEach` with standard `for` loops in animation paths. Use module-level persistent scratch objects for temporary calculations. Implement guarded assignments for all shader uniforms and heavy mathematical transformations.
