## 2025-05-14 - [Semantic Buttons and ARIA Sliders]
**Learning:** In Three.js/Canvas-heavy apps, HUD elements are often implemented as nested divs with pointer events, which are completely inaccessible to screen readers and keyboard users. Converting these to semantic <button> elements and using ARIA roles (like role="slider") with dynamic attributes (aria-valuenow) provides a massive accessibility boost with minimal code changes.
**Action:** Always check if custom UI overlays use semantic tags and provide visual focus indicators for keyboard navigation.
