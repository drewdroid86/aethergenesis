attribute vec3 velocity;
uniform float uExp;
varying float vAlpha;
void main() {
    float expClamped = clamp(uExp, 0.0, 1.0);
    vAlpha = 1.0 - expClamped;
    vec3 p = position + velocity * expClamped * 100.0;
    vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = mvPos.z >= -0.1 ? 0.0 : clamp(max(0.0, (150.0 * (1.0 - expClamped)) / max(-mvPos.z, 1.0)), 0.0, 64.0);
    gl_Position = projectionMatrix * mvPos;
}
