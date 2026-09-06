uniform float uTime;
uniform vec3 uColor;
uniform float uTurbulence;
uniform float uOpacity;
uniform float uLowDetail;

varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vViewDir;

#include <noise>

void main() {
    vec3 p = vLocalPosition * 5.0 * uTurbulence;
    vec3 shift = vec3(
        fbm(p + vec3(0.0, uTime * 0.3, 0.0)),
        fbm(p + vec3(1.7, 0.0, uTime * 0.3)),
        fbm(p + vec3(0.0, 0.0, uTime * 0.3))
    );
    
    float n1, n2, granulation;
    if (uLowDetail > 0.5) {
        n1 = fbm_3(p + shift);
        n2 = fbm_3(p * 2.0 - vec3(uTime * 0.5));
        granulation = 0.5;
    } else {
        n1 = fbm(p + shift);
        n2 = fbm(p * 2.0 - vec3(uTime * 0.5));
        granulation = fbm(vLocalPosition * 24.0 * uTurbulence + uTime * 0.2);
    }
    
    float noiseVal = (n1 * 0.5 + n2 * 0.3 + granulation * 0.2);
    
    // Solar sunspots: darken low density cell centers (using spec-compliant inverted smoothstep)
    float sunspotMask = 1.0 - smoothstep(0.22, 0.28, n1);
    
    vec3 baseCol = mix(uColor * 0.4, uColor * 1.6, noiseVal);
    vec3 finalColor = mix(baseCol, uColor * 0.1, sunspotMask * 0.7);
    
    // Eddington-approximation limb darkening: I(mu)/I(1) ≈ 0.4 + 0.6*mu
    float mu = max(0.0, dot(normalize(vNormal), normalize(vViewDir)));
    finalColor *= 0.4 + 0.6 * mu;
    
    gl_FragColor = vec4(finalColor, uOpacity);
}
