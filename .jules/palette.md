## 2025-05-22 - Discoverable Shortcuts in Immersive UIs
**Learning:** In cinematic or immersive simulations (like Three.js scenes), persistent keyboard shortcut labels can clutter the visual experience and break immersion. Using a "hover-to-reveal" pattern (Tailwind `group-hover`) allows power users to discover shortcuts naturally while keeping the UI clean for casual observation.
**Action:** Implement absolute-positioned, low-opacity hints that reveal on hover for icon-only buttons or interactive sliders.

## 2025-05-22 - Transient Feedback for Non-Destructive Actions
**Learning:** Standard "Copy" actions benefit from immediate, local visual confirmation ("Copied!") to reduce cognitive load, especially when the copied data (like coordinates) is not immediately visible to the user in their clipboard.
**Action:** Use a transient state (2s timeout) to swap button labels or show a tooltip confirming the action success.
