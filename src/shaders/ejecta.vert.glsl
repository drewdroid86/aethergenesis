attribute vec3 velocity;
uniform float uExp;
varying float vAlpha;
void main() {
    vAlpha = 1.0 - uExp;
    vec3 p = position + velocity * uExp * 100.0;
    vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (150.0 * (1.0 - uExp)) / -mvPos.z;
    gl_Position = projectionMatrix * mvPos;
}
