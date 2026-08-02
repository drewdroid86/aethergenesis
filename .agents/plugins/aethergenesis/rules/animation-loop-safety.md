# Rule: Animation Loop Safety

CRITICAL: The animation loop in src/core/engine.ts is sacred.
These patterns are ALWAYS forbidden:

1. cancelAnimationFrame() inside any catch block
2. await or Promise inside the physics tick function
3. setState() or any React state mutation inside the physics tick
4. Synchronous network calls inside the render loop
5. JSON.stringify of large objects inside the render loop

Errors must surface as non-blocking overlays, never as loop kills.
Pattern for error surfacing:
  try {
    // physics step
  } catch (error) {
    emitErrorOverlay(error)  // non-blocking UI notification
    // loop continues
  }

This rule is enforced on every commit touching engine.ts.
