## 2025-05-15 - [Affordance and Shortcuts in 3D Environments]
**Learning:** In Three.js-based interfaces, users often struggle to identify interactive objects without visual affordances. Raycasting against dedicated `hitMesh` objects to update the cursor to `pointer` provides an essential "hover" state. Additionally, global shortcuts (Space/Escape) must be carefully guarded with `document.activeElement` checks and `e.preventDefault()` to avoid conflicting with accessible UI controls and page scrolling.
**Action:** Always implement cursor feedback for 3D hit targets and ensure global key listeners respect focused interactive elements.

## 2025-05-15 - [Keyboard Navigation for Custom Sliders]
**Learning:** Custom 'scrubber' or timeline components using `role="slider"` are much more accessible when supporting `Home` and `End` keys alongside arrow keys. This allows for rapid navigation of the simulation state (e.g., jumping to the beginning or end of a stellar lifecycle).
**Action:** Include `Home` and `End` support in all slider-like custom components.
