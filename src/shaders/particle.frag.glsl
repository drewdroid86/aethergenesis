uniform vec3 uColor;
varying float vAlpha;
void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float d = length(coord);
    if(d > 0.5) discard;
    gl_FragColor = vec4(uColor, vAlpha * (1.0 - d*2.0));
}
