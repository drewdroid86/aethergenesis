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

## 2025-05-25 - Zero-Alloc Workers and Force Caching
**Learning:** In high-frequency Web Workers (60Hz), even small object allocations (like Vector3 for forces) create significant GC pressure that manifests as micro-stutters. Furthermore, the Velocity Verlet integrator provides a mathematical opportunity to cache forces between steps, halving the most expensive O(N^2) operation in the simulation.
**Action:** Use Float32Arrays for all internal worker state and intermediate calculations. Implement 'forcesValid' flags to reuse force buffers across integration steps where possible.

## 2025-05-26 - Hot-path Physics and Math Optimizations
**Learning:** High-frequency (60fps) physics loops and distance checks are major CPU consumers. Using `lengthSq()` instead of `length()` eliminates hundreds of `Math.sqrt()` calls per frame. Hoisting property access (e.g., `p1x = p1.x`) in nested loops reduces the overhead of JS engine property lookups. Refactoring force math to `1/dist - 1/minDist` reduces arithmetic complexity in the repulsion loop. In the N-body worker, refactoring cubic distance math from `r*r*r` to `(rSq + softeningSq) * r` saves one multiplication per interaction.
**Action:** Always prefer squared distance comparisons for thresholds. Hoist object property access out of hot inner loops. Look for mathematical simplifications that reduce the number of operations in (N^2)$ or (N)$ paths.
