import { GLSL_NOISE_SIMPLE } from './noise';

export const displacementVS = `
varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;
uniform float uTime;
uniform float uHbar;

${GLSL_NOISE_SIMPLE}

void main() {
    vNormal = normalize(normalMatrix * normal);
    vec3 p = position;
    float baseNoise = noise(p * 5.0 + uTime * 2.0);
    float foam = noise(p * 50.0 + uTime * 10.0) * (uHbar - 1.0) * 0.5;
    if (uHbar < 1.0) foam = 0.0;
    float d = baseNoise * 0.15 + foam;
    p += normal * d;
    vLocalPosition = p;
    vWorldPosition = (modelMatrix * vec4(p, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const subtleDisplacementVS = `
varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;
uniform float uTime;
uniform float uHbar;

${GLSL_NOISE_SIMPLE}

void main() {
    vNormal = normalize(normalMatrix * normal);
    vec3 p = position;
    float baseNoise = noise(p * 10.0 + uTime * 1.5);
    float foam = noise(p * 50.0 + uTime * 10.0) * (uHbar - 1.0) * 0.5;
    if (uHbar < 1.0) foam = 0.0;
    float d = baseNoise * 0.02 + foam;
    p += normal * d;
    vLocalPosition = p;
    vWorldPosition = (modelMatrix * vec4(p, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const basicVS = `
varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;
void main() {
    vLocalPosition = position;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const CinematicPassFragment = `
    uniform sampler2D tDiffuse;
    uniform float time;
    varying vec2 vUv;

    float random(vec2 p) {
      return fract(sin(dot(p.xy, vec2(12.9898,78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      // Chromatic Aberration
      vec2 offset = (uv - 0.5) * 0.002;
      float r = texture2D(tDiffuse, uv + offset).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - offset).b;
      vec3 color = vec3(r, g, b);

      // Dynamic Film Grain
      float grain = (random(uv * mod(time, 100.0)) - 0.5) * 0.04;
      color += grain;

      // Vignette
      float dist = distance(uv, vec2(0.5));
      color *= smoothstep(0.8, 0.2, dist * 1.1);

      gl_FragColor = vec4(color, 1.0);
    }
`;

export const CinematicPassVertex = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;
