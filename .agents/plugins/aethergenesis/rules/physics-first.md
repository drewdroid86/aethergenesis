# Rule: Physics First

StellarPhysics.ts is the single source of truth.
These patterns are ALWAYS forbidden:

1. Setting shader uniforms to hardcoded values
2. Phase transitions triggered by timers or frame counters
3. Color values not derived from temperature_K via colorTempToRGB()
4. Scale values not derived from radius_solar
5. Any physical quantity invented in a rendering file

Every shader uniform must trace back to a StellarState field.
If a value is purely aesthetic, add this comment:
  // AESTHETIC: not physics-derived, intentional
