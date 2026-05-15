## 2025-05-22 - [Closure Overhead and Culling Integrity]
**Learning:** In a Three.js simulation with 600+ entities updating every frame, the overhead of creating closures (like a `stepOp` helper) inside the `update` loop can lead to significant GC pressure and frame stutters. Furthermore, implementing culling requires extreme care: if internal state machines (like phase transitions) are skipped during culling, objects can become "stuck" in the wrong state when they return to the camera's view.

**Action:** Always move loop-helper functions to the module scope. When implementing early exits for culling, ensure that logical state transitions (the "why" of the object) still execute, even if the expensive visual updates (the "how") are skipped.
