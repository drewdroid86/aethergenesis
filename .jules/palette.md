## 2025-05-04 - [Accessibility in Scientific Visualizations]
**Learning:** In complex Three.js visualizations, custom UI elements (like timeline scrubbers or orbital control buttons) are often implemented using non-semantic `div` tags to avoid default browser styling, making them invisible to screen readers and keyboard-only users.
**Action:** Always convert interactive containers to `<button>` elements or add `role="slider"` with `tabIndex={0}` and appropriate `aria-label` and `aria-value` attributes. Use `focus-visible` with a custom ring to provide clear visual feedback for keyboard navigation without affecting mouse-based aesthetics.

## 2025-05-15 - [ARIA Synchronization in Ref-Based Architectures]
**Learning:** In performance-critical components where UI state is managed via React refs (to bypass re-render overhead in animation loops), ARIA attributes like `aria-valuenow` can become stale for screen readers.
**Action:** Use direct DOM manipulation (`setAttribute`) within interaction handlers to synchronize ARIA attributes immediately. This ensures screen readers announce the correct value in real-time, even when visual updates are driven by refs or animation loops.
