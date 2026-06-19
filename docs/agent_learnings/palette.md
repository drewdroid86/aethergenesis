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

## 2025-05-16 - [Parameter Escape Hatches]
**Learning:** In sandbox simulations where users can drastically alter environment physics (e.g., Gravitation, Light Speed), it's easy to reach "unstable" states where the visualization becomes confusing or blank.
**Action:** Always provide a "Reset to Defaults" button (using the `RotateCcw` icon) in control panels. Adding a subtle hover animation (like `rotate-[-45deg]`) provides a satisfying micro-interaction that signals the "undo" nature of the action.

## 2025-05-16 - [ARIA Type Safety in React/TS]
**Learning:** The project's type-checking (`tsc --noEmit`) is strict about ARIA attributes. Passing `aria-valuemin="0"` as a string causes a type mismatch in `DetailedHTMLProps` for `div` elements, as it expects a number.
**Action:** Always use numeric literals (e.g., `aria-valuemin={0}`) for ARIA numeric attributes in JSX to avoid build failures in this repo's CI.

## 2025-05-16 - [Keyboard Navigation for Custom Sliders]
**Learning:** Custom slider components (implemented as divs with `role="slider"`) require explicit `tabIndex={0}` and keyboard event handlers (`onKeyDown`) to be accessible. In performance-sensitive Three.js apps where state updates are throttled or ref-driven, using direct DOM manipulation (`setAttribute`) for `aria-valuenow` and `aria-valuetext` ensures that screen readers remain synchronized with the visual state without triggering expensive React re-renders.
**Action:** Always implement Arrow, Home, and End key support for custom sliders and synchronize ARIA attributes directly when using ref-based state management.

## 2026-06-15 - [State-Driven Feedback vs. Hover States]
**Learning:** Tooltips for action confirmations (like "Copied!") that rely on CSS `:hover` are easily missed if the user moves their cursor immediately after clicking. Decoupling confirmation visibility from the hover state using transient React state and a fixed timer ensures the feedback is perceived regardless of subsequent mouse movement.
**Action:** Use local state and `setTimeout` to manage the visibility of confirmation tooltips, rather than relying on the mouse remaining over the element.

## 2026-06-15 - [Throttled UI Feedback with Countdowns]
**Learning:** Throttled or rate-limited interactions (like AI 'Deep Scans') can appear unresponsive if the UI doesn't explicitly communicate the cooldown. Providing a visible countdown directly on the button during the lockout period transforms a "dead" interaction into a predictable system state.
**Action:** Implement visual countdowns or duration-based progress indicators for all rate-limited UI actions.
