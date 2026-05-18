## 2024-05-24 - Progressive Disclosure of Keyboard Shortcuts
**Learning:** In immersive 3D applications, persistent keyboard shortcut lists can clutter the UI and distract from the visual experience. Using "hover-revealed" hints (e.g., adding `[Key]` text that only appears or becomes prominent when a user interacts with a related UI element) provides a way to educate users without permanent visual noise.

**Action:** Implement shortcut hints using a CSS group-hover pattern: `opacity-0 group-hover:opacity-50`. This keeps the UI clean for power users while providing discoverability for new users. Ensure these hints are placed near the primary action they represent (e.g., next to a button or slider title).

## 2024-05-24 - Input Protection for Global Shortcuts
**Learning:** Global keyboard listeners (like Space for Play/Pause or R for Reset) can cause data loss or frustration if they trigger while a user is typing in a form field.

**Action:** Always check `document.activeElement` in global keyboard handlers. If the active element is an `INPUT`, `TEXTAREA`, or has `isContentEditable`, the global shortcut should be suppressed.
