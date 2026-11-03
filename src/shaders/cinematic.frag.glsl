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
      uv += toCenter / max(dist, 1e-5) * amp;
    }
  }

  vec3 photonRingGlow = vec3(0.0);
  vec2 lensDispersion = vec2(0.0);
  // Chromatic / gravitational dispersion only while the lens is actually on.
  // An idle full-frame split is a lens artifact with no lens (wide field,
  // behind the camera, ordinary stars).
  vec2 chromaOffset = vec2(0.0);

  if (uLensingStrength > 0.001 && uBlackHoleRadius > 0.001) {
    vec2 delta = uv - uBlackHoleScreenPos;
    // Correct for aspect ratio to make the lens perfectly circular
    delta.x *= uAspectRatio;
    float dist = length(delta);

    // Einstein radius — same b_c the remnant meshes were scaled to.
    float rE = uBlackHoleRadius;
    // Tight shadow lip. Soft, but only a sliver of the radius, so the disk
    // cannot fill the silhouette.
    float edge = max(rE * 0.012, 0.0005);
    horizonMask = smoothstep(rE - edge, rE, dist);

    if (dist >= rE) {
      // Mild higher-order 1/r deflection. The disk vertex bend owns the
      // top/bottom wrap; this term bends the starfield and the limb. Samples
      // stay outside the shadow so bright disk pixels are not smeared into a
      // second ring.
      float deflection = (rE * rE / dist + 0.15 * rE * rE * rE / (dist * dist)) * uLensingStrength * 0.12;
      deflection *= smoothstep(rE, rE * 1.8, dist);
      float theta = max(rE, dist - min(dist * 0.72, deflection));

      vec2 normalDir = normalize(delta);
      uv = uBlackHoleScreenPos + normalDir * vec2(theta / uAspectRatio, theta);

      // Dispersion stays on the deflection, small enough that the limb
      // doesn't split into a prism stripe.
      lensDispersion = vec2(normalDir.x / uAspectRatio, normalDir.y) * (0.0011 * rE / max(0.01, dist)) * uLensingStrength;
      chromaOffset = (uv - 0.5) * 0.00045;
      // Keep the knife-edge itself white. Split only outside the ring.
      float dispGate = smoothstep(rE * 1.04, rE * 1.45, dist);
      lensDispersion *= dispGate;
      chromaOffset *= dispGate;

      // One knife-edge photon ring, just outside the shadow.
      float ringHalf = max(rE * 0.04, 0.0011);
      float dRing = dist - rE;
      if (dRing < ringHalf) {
        float t = 1.0 - dRing / ringHalf;
        float ringIntensity = pow(t, 2.6) * 0.8 * uLensingStrength;
        vec3 photonColor = mix(vec3(1.0, 0.58, 0.2), vec3(1.0, 0.98, 0.95), pow(t, 1.8));
        photonRingGlow = photonColor * ringIntensity;
      }
    }
  }

  vec3 color;
  if (uLensingStrength > 0.001) {
    float r = texture2D(tDiffuse, uv + chromaOffset + lensDispersion).r;
    float g = texture2D(tDiffuse, uv).g;
    float b = texture2D(tDiffuse, uv - chromaOffset - lensDispersion).b;
    color = vec3(r, g, b);
  } else {
    color = texture2D(tDiffuse, uv).rgb;
  }
  // The foreground disk can cross the apparent shadow. The scene depth test
  // already occludes the far disk with the black core; preserve that near image
  // inside the shadow instead of cutting a circular hole through the whole disk.
  vec3 foreground = texture2D(tDiffuse, vUv).rgb;
  float foregroundBrightness = max(foreground.r, max(foreground.g, foreground.b));
  float ringVisibility = 1.0 - smoothstep(0.03, 0.2, foregroundBrightness);
  color = mix(foreground, color, horizonMask) + photonRingGlow * ringVisibility;

  gl_FragColor = vec4(color, 1.0);
}
