varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;
uniform float uTime;

#include <noise>

void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec3 p = position;
    float d = noise_sin(p * 10.0 + uTime * 1.5) * 0.02;
    p += normal * d;
    vLocalPosition = p;
    vWorldPosition = (modelMatrix * vec4(p, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
