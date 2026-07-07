## 2025-01-24 - Contextual Keyboard Shortcut Discoverability
**Learning:** Using `group-hover` for keyboard shortcut hints (like `[Esc]` or `[Arrows to Seek]`) makes them invisible to keyboard-only users, creating a "secret" UI that fails accessibility parity.
**Action:** Always pair `group-hover` with `group-focus-within` and `group-focus-visible` on the parent container to ensure discoverability during tab navigation. This maintains a clean UI for casual users while surfacing power-user hints to those actively interacting via keyboard.
