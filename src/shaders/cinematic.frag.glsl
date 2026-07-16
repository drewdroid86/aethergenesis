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
  float noise = random(uv + fract(time));
  float grain = (noise - 0.5) * 0.012;
  color += grain;

  // Vignette (avoiding undefined behavior smoothstep(0.8, 0.2) where edge0 > edge1)
  float dist = distance(uv, vec2(0.5));
  float vignette = 1.0 - smoothstep(0.4, 0.8, dist * 1.1);
  color *= mix(1.0, vignette, 0.25); // Subtle 25% vignette

  gl_FragColor = vec4(color, 1.0);
}
