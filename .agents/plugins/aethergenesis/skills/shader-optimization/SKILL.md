---
name: shader-optimization
description: WebGL/GLSL cross-platform compliance rules, raymarching, domain warping, and post-processing tone mapping for ÆTHERGENESIS.
version: 1.0.0
---

# Shader Optimization & GLSL Compliance Skill

## Critical Rules for Mobile & ANGLE Drivers
1. **Reversed `smoothstep` Rule**:
   - `smoothstep(edge0, edge1, x)` with `edge0 > edge1` is **undefined** in WebGL 1.0/2.0 specs.
   - **Fix**: Use `(1.0 - smoothstep(edge1, edge0, x))` instead.

2. **Tone Mapping & Post-Processing**:
   - WebGL render targets require an explicit `OutputPass` at the end of the `EffectComposer` chain to apply `ACESFilmicToneMapping` and output in `SRGBColorSpace`.

3. **Domain-Warped FBM Noise**:
   - Use 3D Simplex noise with domain offset: `fbm(p + fbm(p + shift))` for realistic convective solar granulation and fluid nebula gas clouds.
