#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D tDiffuse;
uniform float time;
varying vec2 vUv;

uniform vec2 uBlackHoleScreenPos;
uniform float uBlackHoleRadius;
uniform float uLensingStrength;
uniform float uAspectRatio;
uniform float uShockwave;

float random(vec2 p) {
  return fract(sin(dot(p.xy, vec2(12.9898,78.233))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;
  float horizonMask = 1.0;

  if (uShockwave > 0.001) {
    vec2 center = vec2(0.5);
    vec2 toCenter = uv - center;
    toCenter.x *= uAspectRatio;
    float dist = length(toCenter);
    float waveRadius = uShockwave * 0.8;
    float waveWidth = 0.06;
    float diff = abs(dist - waveRadius);
    if (diff < waveWidth) {
      float amp = (1.0 - diff / waveWidth) * (1.0 - uShockwave) * 0.04;
      uv += normalize(toCenter) * amp;
    }
  }

  vec3 photonRingGlow = vec3(0.0);
  vec2 lensDispersion = vec2(0.0);

  if (uLensingStrength > 0.001 && uBlackHoleRadius > 0.001) {
    vec2 delta = uv - uBlackHoleScreenPos;
    // Correct for aspect ratio to make the lens perfectly circular
    delta.x *= uAspectRatio;
    float dist = length(delta);
    
    // Einstein radius
    float rE = uBlackHoleRadius;
    
    if (dist < rE) {
      horizonMask = 0.0;
    } else {
      // Higher-order Schwarzschild gravitational deflection
      float theta = dist - (rE * rE / dist + 0.35 * rE * rE * rE / (dist * dist)) * uLensingStrength;
      
      // Convert back to UV space (de-adjusting aspect ratio)
      vec2 normalDir = normalize(delta);
      uv = uBlackHoleScreenPos + normalDir * vec2(theta / uAspectRatio, theta);

      // Gravitational dispersion: spectral offset along deflection normal
      lensDispersion = vec2(normalDir.x / uAspectRatio, normalDir.y) * (0.0035 * rE / max(0.01, dist)) * uLensingStrength;

      // Photon sphere glow ring and gravitational redshift at shadow threshold
      float photonRingWidth = rE * 0.22;
      float ringProximity = (dist - rE) / max(0.001, photonRingWidth);
      if (ringProximity < 1.0) {
        float ringIntensity = pow(1.0 - ringProximity, 3.5) * 2.2 * uLensingStrength;
        vec3 photonColor = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.95, 0.85), pow(1.0 - ringProximity, 5.0));
        photonRingGlow = photonColor * ringIntensity;
      }
    }
  }

  // Chromatic Aberration & Gravitational Dispersion (using warped uv)
  vec2 offset = (uv - 0.5) * 0.002;
  float r = texture2D(tDiffuse, uv + offset + lensDispersion).r;
  float g = texture2D(tDiffuse, uv).g;
  float b = texture2D(tDiffuse, uv - offset - lensDispersion).b;
  vec3 color = vec3(r, g, b) * horizonMask + photonRingGlow;

  // Dynamic Film Grain
  float noise = random(uv + fract(time));
  float grain = (noise - 0.5) * 0.012;
  color += grain;

  // Vignette (avoiding undefined behavior smoothstep(0.8, 0.2) where edge0 > edge1)
  float dist = distance(vUv, vec2(0.5));
  float vignette = 1.0 - smoothstep(0.4, 0.8, dist * 1.1);
  color *= mix(1.0, vignette, 0.25); // Subtle 25% vignette

  gl_FragColor = vec4(color, 1.0);
}
