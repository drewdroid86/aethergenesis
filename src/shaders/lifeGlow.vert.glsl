attribute vec3 color;
attribute float size;
varying vec3 vColor;
void main() {
  vColor = color;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(size * (400.0 / -mvPosition.z), 1.0, 64.0);
  gl_Position = projectionMatrix * mvPosition;
}
