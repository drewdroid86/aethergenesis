## 2025-05-15 - [Affordance and Shortcuts in 3D Environments]
**Learning:** In Three.js-based interfaces, users often struggle to identify interactive objects without visual affordances. Raycasting against dedicated `hitMesh` objects to update the cursor to `pointer` provides an essential "hover" state. Additionally, global shortcuts (Space/Escape) must be carefully guarded with `document.activeElement` checks and `e.preventDefault()` to avoid conflicting with accessible UI controls and page scrolling.
**Action:** Always implement cursor feedback for 3D hit targets and ensure global key listeners respect focused interactive elements.

## 2025-05-14 - [Semantic Buttons and ARIA Sliders]
**Learning:** In Three.js/Canvas-heavy apps, HUD elements are often implemented as nested divs with pointer events, which are completely inaccessible to screen readers and keyboard users. Converting these to semantic <button> elements and using ARIA roles (like role="slider") with dynamic attributes (aria-valuenow) provides a massive accessibility boost with minimal code changes.
**Action:** Always check if custom UI overlays use semantic tags and provide visual focus indicators for keyboard navigation.

## 2025-05-14 - [Interactive UI Robustness]
**Learning:** Custom UI controls (like sliders) in Canvas apps often suffer from "interaction freeze" if they only listen for local pointer events. Implementing `setPointerCapture` ensures the control continues to receive events even if the pointer moves outside the element's boundaries during a drag. Additionally, always ensure that "Play/Pause" controls are actually connected to the underlying simulation state to avoid "fake" UI elements.
**Action:** Use pointer capture for all custom drag/slider components and verify end-to-end functionality of all HUD buttons.

## 2025-05-15 - [ARIA Synchronization in Ref-Based Architectures]
**Learning:** In performance-critical components where UI state is managed via React refs (to bypass re-render overhead in animation loops), ARIA attributes like `aria-valuenow` can become stale for screen readers.
**Action:** Use direct DOM manipulation (`setAttribute`) within interaction handlers to synchronize ARIA attributes immediately. This ensures screen readers announce the correct value in real-time, even when visual updates are driven by refs or animation loops.
