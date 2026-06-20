float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise_3d(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(p + vec3(0,0,0)), hash(p + vec3(1,0,0)), f.x),
                   mix(hash(p + vec3(0,1,0)), hash(p + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(p + vec3(0,0,1)), hash(p + vec3(1,0,1)), f.x),
                   mix(hash(p + vec3(0,1,1)), hash(p + vec3(1,1,1)), f.x), f.y), f.z);
}

float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    vec3 shift = vec3(100.0, -120.0, 80.0); // Improved shifts to reduce axis correlation
    for (int i = 0; i < 5; ++i) {
        v += a * noise_3d(p);
        p = p * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

// High-performance 3-octave FBM for volumetric rendering
float fbm_3(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    vec3 shift = vec3(100.0, -120.0, 80.0);
    for (int i = 0; i < 3; ++i) {
        v += a * noise_3d(p);
        p = p * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

float noise_sin(vec3 p) {
  return sin(p.x * 1.5 + p.y * 1.1 + p.z * 1.8);
}
