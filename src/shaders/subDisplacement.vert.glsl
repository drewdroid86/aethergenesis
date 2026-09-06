varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vViewDir;
uniform float uTime;

#include <noise>

void main() {
    vec3 p = position;
    float d = noise_sin(p * 10.0 + uTime * 1.5) * 0.02;
    p += normal * d;
    vLocalPosition = p;
    vWorldPosition = (modelMatrix * vec4(p, 1.0)).xyz;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewDir = normalize(-mv.xyz);
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
}
