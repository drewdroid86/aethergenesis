## 2025-05-15 - [Garbage Collection in High-Frequency Loops]
**Learning:** High-frequency animation loops (60-120+ FPS) that perform even simple object allocations like `vector.clone()` can lead to significant GC pressure and frame stutters, especially when multiplied by the number of entities (e.g., nebulae). Reusing a module-scoped or class-scoped temporary variable is a standard but critical pattern in Three.js simulations.
**Action:** Always audit `.update()` methods for `.clone()`, `new THREE.Vector3()`, or object literals `{}`. Use a persistent temporary object instead.

## 2025-05-15 - [Interface Consistency During Refactoring]
**Learning:** When refactoring calls in a hot loop (like removing redundant visibility checks), it's easy to accidentally swap arguments if the interface is not intuitive or if you are working with multiple similar signatures. The `PhaseComponent` interface had `(..., cameraPos, physics, ...)` while my initial refactor assumed `(..., physics, cameraPos, ...)`.
**Action:** Always run `pnpm lint` (or `tsc --noEmit`) immediately after any refactoring of method calls to catch type mismatches early.
