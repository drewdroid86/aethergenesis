uniform float uTime;
uniform vec3 uColor;
uniform float uTurbulence;
uniform float uOpacity;
uniform float uHbar;

varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;

#include <noise>

void main() {
    float n1 = fbm(vLocalPosition * 5.0 * uTurbulence + uTime * 0.5);
    float n2 = fbm(vLocalPosition * 10.0 * uTurbulence - uTime * 0.8);
    float noiseVal = (n1 + n2) * 0.5;
    
    vec3 finalColor = mix(uColor * 0.5, uColor * 1.5, noiseVal);
    
    // Quantum foam effect
    if (uHbar > 1.5) {
        float foam = sin(vLocalPosition.x * 500.0) * sin(vLocalPosition.y * 500.0) * sin(vLocalPosition.z * 500.0);
        float foamMod = (uHbar - 1.5) * 0.5;
        finalColor += foam * foamMod * uColor;
    }
    
    // Limb darkening
    float intensity = max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0)));
    finalColor *= smoothstep(0.0, 1.0, intensity * 1.2 + 0.2);
    
    gl_FragColor = vec4(finalColor, uOpacity);
}
