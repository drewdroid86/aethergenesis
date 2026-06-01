## 2025-05-21 - Accessible AI Analysis Transitions
**Learning:** Adding `aria-live="polite"` and `role="region"` to AI-generated content ensures that screen readers announce the arrival of asynchronous analysis results, while Framer Motion's `AnimatePresence` provides the visual feedback necessary to reduce cognitive load during state transitions.
**Action:** Always combine accessibility attributes with entrance animations for asynchronous UI updates to provide both visual and auditory confirmation of completion.

## 2026-05-25 - Non-Intrusive Shortcut Discoverability
**Learning:** In minimalist/cinematic interfaces, persistent labels can clutter the UI. "Hover-revealed" hints (using `group-hover` and absolute positioning) provide excellent discoverability for keyboard shortcuts without sacrificing aesthetic purity. Additionally, global shortcuts must be guarded by checking `document.activeElement` to prevent interference with text inputs.
**Action:** Implement shortcut hints as absolute-positioned, low-opacity elements that transition to full opacity on parent hover. Always use `['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)` to gate global key listeners.

## 2024-05-22 - Unified Cinematic UI Patterns
**Learning:** Maintaining visual consistency across information-dense panels requires centralizing "utilitarian" styles like scrollbars. Custom CSS scrollbars that match the app's transparency and color palette (e.g., `scrollbar-color`) prevent the "browser-default" look from breaking immersion. Furthermore, using `AnimatePresence` for all floating HUD panels ensures a cohesive feel when switching between telemetry types.
**Action:** Define reusable utility classes for scrollbars in the global CSS and ensure all context-sensitive panels share a common motion/positioning framework to avoid layout shifts.
## 2025-01-24 - Hover-Revealed Shortcuts for Cinematic UI
**Learning:** In information-dense or visually-focused applications, persistent keyboard shortcut labels can cause visual clutter. Implementing "hover-revealed" hints using Tailwind's `group` and `group-hover` utilities maintains a clean "Cinematic UI" while providing immediate discoverability for power users.
**Action:** Use absolute-positioned, low-opacity hints (e.g., `-top-6 opacity-0 group-hover:opacity-100`) for icon-only buttons that have global keyboard equivalents.
