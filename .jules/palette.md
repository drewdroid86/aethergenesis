## 2025-05-21 - Accessible AI Analysis Transitions
**Learning:** Adding `aria-live="polite"` and `role="region"` to AI-generated content ensures that screen readers announce the arrival of asynchronous analysis results, while Framer Motion's `AnimatePresence` provides the visual feedback necessary to reduce cognitive load during state transitions.
**Action:** Always combine accessibility attributes with entrance animations for asynchronous UI updates to provide both visual and auditory confirmation of completion.

## 2026-05-25 - Non-Intrusive Shortcut Discoverability
**Learning:** In minimalist/cinematic interfaces, persistent labels can clutter the UI. "Hover-revealed" hints (using `group-hover` and absolute positioning) provide excellent discoverability for keyboard shortcuts without sacrificing aesthetic purity. Additionally, global shortcuts must be guarded by checking `document.activeElement` to prevent interference with text inputs.
**Action:** Implement shortcut hints as absolute-positioned, low-opacity elements that transition to full opacity on parent hover. Always use `['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)` to gate global key listeners.

## 2024-05-22 - Unified Cinematic UI Patterns
**Learning:** Maintaining visual consistency across information-dense panels requires centralizing "utilitarian" styles like scrollbars. Custom CSS scrollbars that match the app's transparency and color palette (e.g., `scrollbar-color`) prevent the "browser-default" look from breaking immersion. Furthermore, using `AnimatePresence` for all floating HUD panels ensures a cohesive feel when switching between telemetry types.
**Action:** Define reusable utility classes for scrollbars in the global CSS and ensure all context-sensitive panels share a common motion/positioning framework to avoid layout shifts.

## 2025-05-15 - [Accessible Control Feedbacks]
**Learning:** Combining `aria-describedby` with semantic sliders and hover-revealed keyboard hints provides a layered discovery model that balances cinematic minimalism with high accessibility. Using a transient "Copied!" state for both visual and ARIA label updates ensures screen reader users receive confirmation of background operations without intrusive alerts.
**Action:** Always implement the "hover-hint" pattern for keyboard shortcuts in dense, icon-heavy UIs to maintain a clean aesthetic while ensuring discoverability.

## 2025-06-10 - Audible Clipboard Feedback via aria-live
**Learning:** Background operations like "Copy to Clipboard" are often silent to screen readers. Implementing a dedicated, hidden `aria-live="polite"` region that receives transient text updates provides a non-intrusive way to confirm success for keyboard-only or screen reader users, complementing visual feedback (like "Copied!" tooltips).
**Action:** Centralize accessible announcements in information-dense HUDs to avoid multiple live regions and ensure consistent feedback for all interaction-triggered background tasks.
## 2026-06-10 - Motion Jitter and Centering
**Learning:** When using Framer Motion on elements that are vertically centered via CSS (`top-1/2`, `-translate-y-1/2`), there's a risk of layout jitter or conflict during entry/exit animations. Offloading the centering logic to Framer's `y: '-50%'` prop ensures that the initial, animate, and exit states are calculated from the same baseline, preventing vertical displacement "jumps."
**Action:** Prefer Framer Motion's `y` property for centering over CSS transforms when the element is part of an `AnimatePresence` sequence.
