#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D tDiffuse;
uniform float time;
varying vec2 vUv;

void main() {
    vec4 source = texture2D(tDiffuse, vUv);
    vec3 color = source.rgb;
    // AESTHETIC: not physics-derived, intentional display-space grade after ACES/sRGB.
    float vignette = 1.0 - smoothstep(0.4, 0.8, distance(vUv, vec2(0.5)) * 1.1);
    color *= mix(1.0, vignette, 0.12);
    float noise = fract(sin(dot(mod(gl_FragCoord.xy, 512.0) + fract(time), vec2(12.9898, 78.233))) * 43758.5453);
    // Keep the black-hole shadow and empty sky black; do not lift them with grain.
    float grainMask = smoothstep(0.02, 0.15, max(color.r, max(color.g, color.b)));
    color += (noise - 0.5) * 0.004 * grainMask;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), source.a);
}
