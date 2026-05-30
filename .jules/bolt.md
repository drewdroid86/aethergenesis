## 2025-05-22 - Optimize Repulsion Physics and Hot Loops
**Learning:** The $O(N^2)$ repulsion physics loop in `Engine.update` was a major bottleneck as the number of stars increased. Standard `forEach` loops in high-frequency (60fps) animation paths introduce unnecessary closure allocations and function call overhead.
**Action:** Use AABB/Manhattan pruning and hoist property access in nested physics loops. Replace `forEach` with standard `for` loops in hot paths like `Engine.update` and `Engine.dispose`.

## 2025-05-23 - Lazy Initialization and Shared Resource Disposal
**Learning:** Initializing all possible states for hundreds of complex Three.js entities at startup causes significant CPU/memory spikes. However, implementing lazy loading requires precise disposal logic; calling `.dispose()` on shared global geometries (e.g., from a shared constant) inside an instance's cleanup method will break rendering for all other instances.
**Action:** Use lazy getters for expensive sub-systems. In disposal methods, only clean up instance-specific resources and ensure shared assets are preserved.

## 2024-05-22 - Static Scratchpads and InstancedMesh Count
**Learning:** Per-frame .clone() calls in InstancedMesh update loops (like CometSystem) cause significant GC pressure. Additionally, manually looping to scale hidden instances to zero is O(N) CPU work that Three.js handles natively via the .count property.
**Action:** Use module-level scratchpad objects (Vector3, Matrix4) for intermediate calculations. Set InstancedMesh.count to the exact number of active entities to let the GPU handle clipping efficiently.

## 2025-05-24 - Verification vs. Stale Memory
**Learning:** Previous session memories (entries 11, 15, 23, 31, 36) claimed that several hot-path optimizations—such as scratchpad hoisting in `PlanetarySystem.ts` and `forEach` replacement in `RemnantPhase.ts`—were already implemented. However, direct inspection revealed these were either local to the loop or entirely missing, leading to unnecessary per-frame allocations and closure overhead.
**Action:** Never rely solely on memory for the current state of optimizations. Always use `grep` or `read_file` to verify the "hotness" of a path and the presence of allocations before proceeding.

## 2024-05-30 - Optimized N-body physics worker
**Learning:** The N-body simulation in `nbodyWorker.ts` was suffering from significant per-frame overhead due to the creation of thousands of small objects (`{x, y, z}` force vectors) and array mapping operations in every tick. In Web Workers, these allocations trigger frequent garbage collection cycles, causing noticeable jitter in high-frequency physics loops.
**Action:** Use a module-level `accelBuffer` (Float32Array) to reuse memory for acceleration calculations. Refactor force-based logic into direct acceleration calculations (`a = G * M_other / r^3 * r_vector`) to eliminate redundant mass multiplications and divisions. This "zero-alloc" approach in the hot loop significantly reduces GC pressure and CPU cycles.
