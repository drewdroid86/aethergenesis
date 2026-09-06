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
void main() {
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
uniform float uOpacity;
uniform float uFalloff;
uniform float uTint;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
    float rim = 1.0 - abs(dot(vNormal, vViewDir));
    float glow = exp(-rim * uFalloff);          // Gaussian-ish falloff, no hard edge
    // Corona is optically thin and hotter → push slightly toward white
    vec3 col = mix(uColor, vec3(1.0), uTint * rim);
    gl_FragColor = vec4(col, glow * uOpacity);
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
