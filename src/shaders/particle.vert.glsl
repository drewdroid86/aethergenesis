attribute float size;
varying float vAlpha;
uniform float uAlpha;
void main() {
    vAlpha = uAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = mvPosition.z >= -0.1 ? 0.0 : clamp(size * (200.0 / max(-mvPosition.z, 1.0)), 1.0, 64.0);
    gl_Position = projectionMatrix * mvPosition;
}
