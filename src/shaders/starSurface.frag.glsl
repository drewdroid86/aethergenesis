#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

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
        fbm(p + vec3(0.0, uTime * 0.28, 0.0)),
        fbm(p + vec3(1.7, 0.0, uTime * 0.28)),
        fbm(p + vec3(0.0, 3.1, uTime * 0.28))
    );
    
    float n1, n2, granulation, fineCell;
    if (uLowDetail > 0.5) {
        n1 = fbm_3(p + shift);
        n2 = fbm_3(p * 2.2 - vec3(uTime * 0.45));
        granulation = 0.5;
        fineCell = 0.5;
    } else {
        vec3 warpedP = p + shift * 1.35;
        n1 = fbm(warpedP);
        n2 = fbm(warpedP * 2.4 - vec3(uTime * 0.45));
        granulation = fbm(vLocalPosition * 26.0 * uTurbulence + shift * 0.8 + uTime * 0.22);
        fineCell = fbm_3(vLocalPosition * 52.0 * uTurbulence - uTime * 0.35);
    }
    
    // Sharp Bénard convection granules with bright upwelling centers and dark intergranular lanes
    float cellContrast = smoothstep(0.28, 0.72, granulation * 0.7 + fineCell * 0.3);
    float noiseVal = (n1 * 0.45 + n2 * 0.30 + cellContrast * 0.25);
    
    // Eddington viewing angle cosine mu = cos(theta)
    float mu = max(0.0, dot(normalize(vNormal), normalize(vViewDir)));
    
    // Solar sunspots: dark cool umbra core + filamentary penumbra surround (spec-compliant smoothstep)
    float sunspotUmbra = 1.0 - smoothstep(0.18, 0.225, n1);
    float sunspotMask = 1.0 - smoothstep(0.22, 0.29, n1 + (n2 - 0.5) * 0.06);
    
    // Bright magnetic faculae / plage networks ringing active regions (stronger near the limb)
    float faculaeBand = smoothstep(0.27, 0.34, n1) * (1.0 - smoothstep(0.34, 0.46, n1));
    float faculaeBoost = faculaeBand * smoothstep(0.42, 0.68, n2) * (0.45 + 0.85 * (1.0 - mu));
    
    // Planckian core-to-convection color ramp: hotter white-shifted upwelling cores, deeper intergranular lanes
    vec3 hotCoreColor = mix(uColor * 1.45, vec3(1.0, 0.98, 0.94), 0.35);
    vec3 coolLaneColor = uColor * vec3(0.48, 0.34, 0.22);
    vec3 baseCol = mix(coolLaneColor, hotCoreColor, smoothstep(0.20, 0.82, noiseVal));
    
    // Add bright magnetic faculae filaments
    baseCol += mix(uColor, vec3(1.0, 0.97, 0.90), 0.5) * faculaeBoost * 0.95;
    
    // Apply sunspot penumbra and deep umbra darkening
    vec3 penumbraCol = uColor * vec3(0.28, 0.16, 0.08);
    vec3 umbraCol = uColor * vec3(0.07, 0.03, 0.01);
    vec3 finalColor = mix(baseCol, penumbraCol, sunspotMask * 0.78);
    finalColor = mix(finalColor, umbraCol, sunspotUmbra * 0.92);
    
    // Wavelength-dependent Eddington-Barbier limb darkening:
    // Shorter (blue/green) wavelengths experience higher optical depth at grazing angles than red
    float eddingtonScalar = 0.4 + 0.6 * mu;
    vec3 chromaticLimb = vec3(
        pow(max(mu, 0.001), 0.36),
        pow(max(mu, 0.001), 0.55),
        pow(max(mu, 0.001), 0.80)
    );
    finalColor *= mix(vec3(eddingtonScalar), chromaticLimb, 0.65);
    
    // Subtle chromospheric spicule emission ring at extreme grazing limb
    float spiculeRim = pow(1.0 - mu, 4.5) * (0.6 + 0.4 * n2);
    finalColor += uColor * vec3(1.15, 0.65, 0.35) * spiculeRim * 0.32;
    
    gl_FragColor = vec4(finalColor, uOpacity);
}
