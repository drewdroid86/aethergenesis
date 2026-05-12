attribute float size;
varying float vAlpha;
uniform float uAlpha;
void main() {
    vAlpha = uAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (200.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
}
