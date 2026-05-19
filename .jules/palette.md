## 2025-05-14 - Interactive Telemetry & Discoverable Controls
**Learning:** In complex 3D simulations, users often need to extract precise data (like coordinates) for reference. Providing a one-click "Copy" action directly in the HUD telemetry with immediate visual feedback (icon swap) reduces friction. Additionally, keyboard-driven navigation (like timeline scrubbing) is often "hidden" from users; adding small, context-aware keyboard hints that appear on hover significantly improves discoverability without cluttering the UI.
**Action:** Always include clipboard-copy affordances for telemetry data and use "hover-revealed" keyboard hints (e.g., `[Arrows to Seek]`) for non-obvious interaction patterns.

## 2025-05-15 - Async Feedback & Global Shortcuts
**Learning:** Providing explicit visual feedback for long-running async operations (like AI scans) via spinners and pulsing icons prevents user uncertainty and "double-clicking." Combining this with global keyboard shortcuts (like `Escape` to close panels) and subtle discoverability hints (hover-revealed labels) creates a "pro" feel while remaining accessible.
**Action:** Use `Loader` icons with `aria-busy` for async buttons and implement `Escape` to dismiss overlays, paired with hover hints for education.
## 2025-05-14 - Hover-Revealed Shortcuts & 3D Affordance
**Learning:** Hover-revealed keyboard hints (using Tailwind's `group-hover`) provide excellent discoverability for power users without cluttering the persistent UI for casual observers. In 3D environments, standard UI expectations are often suspended, so visual cursor affordance (changing to 'pointer' on hover) is critical for indicating that 3D entities are interactive.
**Action:** Implement `group-hover` hints for non-obvious shortcuts and prioritize cursor state synchronization with raycasting results in all interactive 3D views.
