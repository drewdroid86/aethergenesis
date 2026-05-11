## 2025-05-04 - [Accessibility in Scientific Visualizations]
**Learning:** In complex Three.js visualizations, custom UI elements (like timeline scrubbers or orbital control buttons) are often implemented using non-semantic `div` tags to avoid default browser styling, making them invisible to screen readers and keyboard-only users.
**Action:** Always convert interactive containers to `<button>` elements or add `role="slider"` with `tabIndex={0}` and appropriate `aria-label` and `aria-value` attributes. Use `focus-visible` with a custom ring to provide clear visual feedback for keyboard navigation without affecting mouse-based aesthetics.

## 2025-05-14 - [Semantic Buttons and ARIA Sliders]
**Learning:** In Three.js/Canvas-heavy apps, HUD elements are often implemented as nested divs with pointer events, which are completely inaccessible to screen readers and keyboard users. Converting these to semantic <button> elements and using ARIA roles (like role="slider") with dynamic attributes (aria-valuenow) provides a massive accessibility boost with minimal code changes.
**Action:** Always check if custom UI overlays use semantic tags and provide visual focus indicators for keyboard navigation.

## 2025-05-14 - [Interactive UI Robustness]
**Learning:** Custom UI controls (like sliders) in Canvas apps often suffer from "interaction freeze" if they only listen for local pointer events. Implementing `setPointerCapture` ensures the control continues to receive events even if the pointer moves outside the element's boundaries during a drag. Additionally, always ensure that "Play/Pause" controls are actually connected to the underlying simulation state to avoid "fake" UI elements.
**Action:** Use pointer capture for all custom drag/slider components and verify end-to-end functionality of all HUD buttons.

## 2025-05-15 - [ARIA Synchronization in Ref-Based Architectures]
**Learning:** In performance-critical components where UI state is managed via React refs (to bypass re-render overhead in animation loops), ARIA attributes like `aria-valuenow` can become stale for screen readers.
**Action:** Use direct DOM manipulation (`setAttribute`) within interaction handlers to synchronize ARIA attributes immediately. This ensures screen readers announce the correct value in real-time, even when visual updates are driven by refs or animation loops.

## 2025-05-16 - [Parameter Escape Hatches]
**Learning:** In sandbox simulations where users can drastically alter environment physics (e.g., Gravitation, Light Speed), it's easy to reach "unstable" states where the visualization becomes confusing or blank.
**Action:** Always provide a "Reset to Defaults" button (using the `RotateCcw` icon) in control panels. Adding a subtle hover animation (like `rotate-[-45deg]`) provides a satisfying micro-interaction that signals the "undo" nature of the action.

## 2025-05-16 - [ARIA Type Safety in React/TS]
**Learning:** The project's type-checking (`tsc --noEmit`) is strict about ARIA attributes. Passing `aria-valuemin="0"` as a string causes a type mismatch in `DetailedHTMLProps` for `div` elements, as it expects a number.
**Action:** Always use numeric literals (e.g., `aria-valuemin={0}`) for ARIA numeric attributes in JSX to avoid build failures in this repo's CI.
