uniform float uTime;
uniform vec3 uColor;
uniform float uTurbulence;
uniform float uOpacity;
uniform float uLowDetail;

varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;

#include <noise>

void main() {
    float n1, n2;
    if (uLowDetail > 0.5) {
        n1 = fbm_3(vLocalPosition * 5.0 * uTurbulence + uTime * 0.5);
        n2 = fbm_3(vLocalPosition * 10.0 * uTurbulence - uTime * 0.8);
    } else {
        n1 = fbm(vLocalPosition * 5.0 * uTurbulence + uTime * 0.5);
        n2 = fbm(vLocalPosition * 10.0 * uTurbulence - uTime * 0.8);
    }
    float noiseVal = (n1 + n2) * 0.5;
    
    vec3 finalColor = mix(uColor * 0.5, uColor * 1.5, noiseVal);
    
    // Quadratic limb darkening — scientifically accurate (Claret 2000)
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float mu = max(0.0, dot(normalize(vNormal), viewDir));
    float u1 = 0.4;
    float u2 = 0.3;
    float limbDarkening = 1.0 - u1 * (1.0 - mu) - u2 * (1.0 - mu) * (1.0 - mu);
    limbDarkening = clamp(limbDarkening, 0.0, 1.0);
    finalColor *= limbDarkening;
    
    gl_FragColor = vec4(finalColor, uOpacity);
}
