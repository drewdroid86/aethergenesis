## 2025-05-22 - [Closure Overhead and Culling Integrity]
**Learning:** In a Three.js simulation with 600+ entities updating every frame, the overhead of creating closures (like a `stepOp` helper) inside the `update` loop can lead to significant GC pressure and frame stutters. Furthermore, implementing culling requires extreme care: if internal state machines (like phase transitions) are skipped during culling, objects can become "stuck" in the wrong state when they return to the camera's view.

**Action:** Always move loop-helper functions to the module scope. When implementing early exits for culling, ensure that logical state transitions (the "why" of the object) still execute, even if the expensive visual updates (the "how") are skipped.

## 2025-05-23 - [Caching Raycasting Targets in Event Listeners]
**Learning:** High-frequency event listeners (like `onPointerMove`) that perform O(N) array transformations (e.g., `entities.map(e => e.mesh)`) to provide targets for raycasting create significant CPU overhead and GC pressure. This is especially impactful in React when these transformations happen inside hooks that are sensitive to state changes.

**Action:** Cache raycasting target arrays in a `useRef` and only update them when the underlying entity collection actually changes (e.g., on system initialization or detail tier change).
