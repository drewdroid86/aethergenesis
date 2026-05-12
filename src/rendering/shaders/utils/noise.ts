export const GLSL_NOISE_FBM = `
float hash(vec3 p) {
    p = fract(p * 0.3183099 + .1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i+vec3(0.0,0.0,0.0)),hash(i+vec3(1.0,0.0,0.0)),f.x),mix(hash(i+vec3(0.0,1.0,0.0)),hash(i+vec3(1.0,1.0,0.0)),f.x),f.y),
               mix(mix(hash(i+vec3(0.0,0.0,1.0)),hash(i+vec3(1.0,0.0,1.0)),f.x),mix(hash(i+vec3(0.0,1.0,1.0)),hash(i+vec3(1.0,1.0,1.0)),f.x),f.y),f.z);
}
float fbm(vec3 p) {
    float f = 0.0;
    f += 0.5000 * noise(p); p *= 2.5;
    f += 0.2500 * noise(p); 
    return f;
}
`;

export const GLSL_NOISE_SIN = `
float hash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 151.7182))) * 43758.5453);
}

float noise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(p + vec3(0,0,0)), hash(p + vec3(1,0,0)),f.x),
                   mix(hash(p + vec3(0,1,0)), hash(p + vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(p + vec3(0,0,1)), hash(p + vec3(1,0,1)),f.x),
                   mix(hash(p + vec3(0,1,1)), hash(p + vec3(1,1,1)),f.x),f.y),f.z);
}
`;
