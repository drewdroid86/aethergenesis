## 2025-05-04 - [Accessibility in Scientific Visualizations]
**Learning:** In complex Three.js visualizations, custom UI elements (like timeline scrubbers or orbital control buttons) are often implemented using non-semantic `div` tags to avoid default browser styling, making them invisible to screen readers and keyboard-only users.
**Action:** Always convert interactive containers to `<button>` elements or add `role="slider"` with `tabIndex={0}` and appropriate `aria-label` and `aria-value` attributes. Use `focus-visible` with a custom ring to provide clear visual feedback for keyboard navigation without affecting mouse-based aesthetics.

## 2025-05-15 - [Keyboard Overrides in Animation Loops]
**Learning:** When adding keyboard navigation to elements that are also updated by a high-frequency animation loop (like a timeline progress bar), the animation loop will often overwrite manual state updates immediately.
**Action:** Use a "scrubbing" or "manual override" flag (e.g., `isScrubbingRef.current = true`) when processing keyboard events. The animation loop should check this flag before applying automatic updates to ensure the user's manual navigation is reflected visually.
