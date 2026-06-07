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

## 2024-05-24 - Screen Reader Feedback for Clipboard Actions
**Learning:** For background actions like "copy to clipboard" that have only transient visual feedback, an `aria-live="polite"` region is essential for accessibility. Without it, screen reader users are left unaware if the action succeeded. Furthermore, icon-only buttons should always have explicit `aria-label` even if `title` is present, as `title` is not reliably announced by all assistive technologies.
**Action:** Implement a central or component-specific `aria-live` announcement state for non-visual success confirmations. Ensure all icon-only buttons use `aria-label` for primary accessibility and `title` for mouse tooltips.
