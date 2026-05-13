## 2025-05-14 - [Stateful Box-Muller Transform]
**Learning:** The Box-Muller transform generates two independent normally distributed values per computation. Caching the second value avoids redundant mathematical operations (Math.sqrt, Math.log, Math.sin/cos) and Math.random() calls in high-iteration loops.
**Action:** Use a module-level or closure-scoped cache for random number utilities that generate multiple values per cycle to improve initialization speed of large-scale systems (e.g., 50,000+ stars).

## 2025-05-15 - [Global Resource Disposal Anti-pattern]
**Learning:** Disposing of module-level (global) shared resources (like Three.js geometries) within a React component's `useEffect` cleanup causes catastrophic failures if the component remounts (common in HMR or route changes). Shared resources must persist for the application lifecycle or be managed via a reference-counting factory.
**Action:** Never call `.dispose()` on global shared geometries/materials in a component cleanup. Only dispose of unique, instance-specific resources.

## 2025-05-15 - [React-Three Telemetry Sync]
**Learning:** Bypassing React for high-frequency updates (60fps) using direct DOM manipulation via `useRef` is highly efficient, but can desync the component's internal state used for ARIA attributes and low-frequency UI updates.
**Action:** Use a throttled state update (e.g., once per second) in the animation loop to synchronize React state with the "real" simulation values, maintaining accessibility and state consistency without performance degradation.

## 2026-05-07 - [Post-processing Resolution Scaling]
**Learning:** High-resolution post-processing passes like `UnrealBloomPass` can be a significant GPU bottleneck. Halving the resolution of these passes (e.g., `pass.resolution.set(w/2, h/2)`) can reclaim substantial GPU cycles with minimal impact on perceived visual fidelity.
**Action:** Scale down expensive post-processing effects by default to ensure smooth performance across a wider range of hardware.
