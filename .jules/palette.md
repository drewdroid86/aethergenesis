## 2025-05-14 - [Semantic Buttons and ARIA Sliders]
**Learning:** In Three.js/Canvas-heavy apps, HUD elements are often implemented as nested divs with pointer events, which are completely inaccessible to screen readers and keyboard users. Converting these to semantic <button> elements and using ARIA roles (like role="slider") with dynamic attributes (aria-valuenow) provides a massive accessibility boost with minimal code changes.
**Action:** Always check if custom UI overlays use semantic tags and provide visual focus indicators for keyboard navigation.
## 2025-05-14 - [Interactive UI Robustness]
**Learning:** Custom UI controls (like sliders) in Canvas apps often suffer from "interaction freeze" if they only listen for local pointer events. Implementing `setPointerCapture` ensures the control continues to receive events even if the pointer moves outside the element's boundaries during a drag. Additionally, always ensure that "Play/Pause" controls are actually connected to the underlying simulation state to avoid "fake" UI elements.
**Action:** Use pointer capture for all custom drag/slider components and verify end-to-end functionality of all HUD buttons.
