varying vec3 vColor;
void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) discard;
  float alpha = exp(-dist * dist * 30.0);
  gl_FragColor = vec4(vColor, alpha);
}
