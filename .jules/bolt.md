## 2026-05-24 - Optimize physics loop and reduce closure overhead
**Learning:** The (N^2)$ repulsion physics loop was a major bottleneck for CPU performance, especially at higher star counts. Standard `.forEach` loops in hot paths (60fps) contribute to GC pressure due to constant closure allocation.
**Action:** Apply Manhattan distance pruning to skip expensive calculations for distant entities in (N^2)$ loops. Prioritize standard `for` loops over `.forEach` in high-frequency update and animation paths.
