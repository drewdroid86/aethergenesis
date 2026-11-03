import * as THREE from 'three';
import { resolveIncludes } from '../../utils/shaderLoader';

import nebulaFrag from '../../shaders/nebula.frag.glsl?raw';
import starSurfaceFrag from '../../shaders/starSurface.frag.glsl?raw';
import displacementVert from '../../shaders/displacement.vert.glsl?raw';
import subDisplacementVert from '../../shaders/subDisplacement.vert.glsl?raw';
import lifeGlowVert from '../../shaders/lifeGlow.vert.glsl?raw';
import lifeGlowFrag from '../../shaders/lifeGlow.frag.glsl?raw';
import basicVert from '../../shaders/basic.vert.glsl?raw';
import particleVert from '../../shaders/particle.vert.glsl?raw';
import particleFrag from '../../shaders/particle.frag.glsl?raw';
import ejectaVert from '../../shaders/ejecta.vert.glsl?raw';
import ejectaFrag from '../../shaders/ejecta.frag.glsl?raw';
import cinematicVert from '../../shaders/cinematic.vert.glsl?raw';
import cinematicFrag from '../../shaders/cinematic.frag.glsl?raw';

export const starVertexShader = resolveIncludes(lifeGlowVert);
export const starFragmentShader = resolveIncludes(lifeGlowFrag);

export const nebulaFS = resolveIncludes(nebulaFrag);
export const starSurfaceFS = resolveIncludes(starSurfaceFrag);
export const displacementVS = resolveIncludes(displacementVert);
export const subtleDisplacementVS = resolveIncludes(subDisplacementVert);
export const basicVS = resolveIncludes(basicVert);
export const particleVS = resolveIncludes(particleVert);
export const particleFS = resolveIncludes(particleFrag);
export const ejectaVS = resolveIncludes(ejectaVert);
export const ejectaFS = resolveIncludes(ejectaFrag);

export const glowVS = /* glsl */`
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vLocalPos;
void main() {
    vLocalPos = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
}
`;

export const glowFS = /* glsl */`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec3 uColor;
uniform vec3 uHotColor;
uniform float uOpacity;
uniform float uSurfaceRatio;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vLocalPos;
void main() {
    float mu = clamp(abs(dot(normalize(vNormal), normalize(vViewDir))), 0.0, 1.0);
    // Projected height above the photosphere, normalized to the shell's outer edge.
    float projectedRadius = sqrt(max(0.0, 1.0 - mu * mu));
    float height = clamp((projectedRadius - uSurfaceRatio) / (1.0 - uSurfaceRatio), 0.0, 1.0);
    // Coronal helmet-streamer radial structure (K-corona magnetic anisotropy)
    vec3 dir = normalize(vLocalPos);
    float theta = atan(dir.z, dir.x);
    float phi = asin(clamp(dir.y, -1.0, 1.0));
    float streamers = 0.62 + 0.38 * pow(0.5 + 0.5 * sin(theta * 8.0 + cos(phi * 4.0) * 2.0), 2.0);
    streamers *= 0.85 + 0.15 * cos(phi * 6.0);
    // AESTHETIC: not physics-derived, intentional optically thin profile, fading to zero.
    float glow = exp(-height * (7.0 - 3.0 * streamers)) * (1.0 - smoothstep(0.65, 1.0, height));
    // Optically thin continuum cue sampled from the stellar palette, not a coronal blackbody.
    vec3 col = mix(uColor, uHotColor, 0.75);
    gl_FragColor = vec4(col * 1.2, glow * streamers * uOpacity * 0.09);
}
`;



export const CinematicPassShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    uBlackHoleScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
    uBlackHoleRadius: { value: 0.0 },
    uLensingStrength: { value: 0.0 },
    uAspectRatio: { value: 1.0 },
    uShockwave: { value: 0.0 }
  },
  vertexShader: resolveIncludes(cinematicVert),
  fragmentShader: resolveIncludes(cinematicFrag)
};
