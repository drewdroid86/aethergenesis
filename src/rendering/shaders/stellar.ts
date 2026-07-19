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


export const CinematicPassShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    uBlackHoleScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
    uBlackHoleRadius: { value: 0.0 },
    uLensingStrength: { value: 0.0 },
    uAspectRatio: { value: 1.0 }
  },
  vertexShader: resolveIncludes(cinematicVert),
  fragmentShader: resolveIncludes(cinematicFrag)
};
