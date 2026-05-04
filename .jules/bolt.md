## 2025-05-15 - [Stellar Initialization Bottleneck]
**Learning:** Initializing multiple Three.js objects with unique geometries is a major source of CPU/GPU overhead. Reusing shared geometries at the module level significantly reduces setup time (by ~88% in this case) and GC pressure.
**Action:** Always look for opportunities to pool or reuse Three.js resources like Geometries and Materials when dealing with multiple instances of similar systems.

**Optimization Results:**
- Galaxy generation (50k stars): ~81ms -> ~70ms (13.5% improvement via randomGaussian optimization)
- Hero star initialization (12 systems): ~180ms -> ~21ms (88.3% improvement via geometry reuse)
- Total setup: ~261ms -> ~91ms (65.1% faster)
