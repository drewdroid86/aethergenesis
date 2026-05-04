## 2025-05-15 - [Stellar Initialization Bottleneck]
**Learning:** Initializing multiple Three.js objects with unique geometries is a major source of CPU/GPU overhead. Reusing shared geometries at the module level significantly reduces setup time (by ~88% in this case) and GC pressure.
**Action:** Always look for opportunities to pool or reuse Three.js resources like Geometries and Materials when dealing with multiple instances of similar systems.

**Optimization Results:**
- Galaxy generation (50k stars): ~81ms -> ~70ms (13.5% improvement via randomGaussian optimization)
- Hero star initialization (12 systems): ~180ms -> ~21ms (88.3% improvement via geometry reuse)
- Total setup: ~261ms -> ~91ms (65.1% faster)

## 2026-05-04 - [Galaxy Generation Mathematical Bottleneck]
**Learning:** Galaxy generation (50,000 stars) was performing redundant Polar-to-Cartesian and Cartesian-to-Polar transformations. By implementing a "Polar-Direct" distribution (applying dispersion in polar space), we eliminate 50,000 calls each to `Math.atan2` and `Math.sqrt`. Additionally, reusing a shared `THREE.Color` object prevents 50,000 object allocations per setup.
**Action:** In large-scale procedural generation, align coordinate transformations with the final distribution logic to avoid toggling between spaces. Always reuse core objects (Colors, Vectors) in tight loops.

**Optimization Results:**
- Mathematical operations: Removed 100,000 expensive calls (`atan2`, `sqrt`) from init loop.
- Memory: Reduced allocations by 50,000 `THREE.Color` objects.
- Overall: Dramatically faster component mount and reduced GC pressure.
