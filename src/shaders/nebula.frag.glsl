uniform float uTime;
uniform vec3 uColor;
uniform float uCollapse;
uniform vec3 uCameraPos;
uniform mat4 uInverseModelMatrix;
uniform float uOpacity;

varying vec3 vLocalPosition;
varying vec3 vWorldPosition;

#include <noise>

void main() {
    vec3 localCam = (uInverseModelMatrix * vec4(uCameraPos, 1.0)).xyz;
    vec3 rayDir = normalize(vLocalPosition - localCam);
    vec3 pos = vLocalPosition;
    
    float stepSize = 0.15;
    float alpha = 0.0;
    vec3 accCol = vec3(0.0);
    
    float progress = smoothstep(0.0, 1.0, uCollapse);
    
    for(int i=0; i<12; i++) {
        float d = length(pos);
        if(d > 1.0) break; // Sphere bounds
        
        // Swirling gas currents
        float angle = (1.0 - d) * 3.0 + uTime * 0.3;
        float s = sin(angle);
        float c = cos(angle);
        vec3 p = pos;
        p.xz = mat2(c, -s, s, c) * p.xz;
        p.xy = mat2(c, s, -s, c) * p.xy;
        
        // Raymarched 3D noise (use lower frequency to help performance)
        float n = fbm(p * 2.0 - rayDir * uTime * 0.1);
        
        // Tiny particle emissions/sparkles (use hash instead of expensive noise)
        float sparkles = pow(hash(p * 15.0 + uTime * 0.5), 8.0) * 1.5;
        
        // Target collapse radius
        float targetR = 1.0 - progress * 0.95; 
        
        // Density calculation
        float density = smoothstep(0.3, 0.7, n + sparkles * 0.1);
        density *= 1.0 - smoothstep(targetR * 0.6, targetR, d); // fade near edge
        
        // Calculate temperatures
        vec3 hotCore = vec3(1.0, 0.8, 0.4);
        vec3 coldGas = uColor;
        
        // Mix heat inside
        float temp = progress * (1.0 - d);
        vec3 heatColor = mix(coldGas, hotCore, temp);
        
        // Realistic light scattering (more light in dense areas near center)
        float scattering = pow(max(0.0, 1.0 - d), 2.0) * density;
        heatColor += hotCore * scattering * progress * 2.5;
        
        alpha += density * stepSize * 2.5;
        accCol += heatColor * density * stepSize * 3.0;
        
        // High-performance single-eval Hubble Palette Emission Lines
        float baseEmission = fbm_3(p * 5.0 + uTime * 0.05);
        float hAlphaLine = smoothstep(0.75, 0.95, baseEmission) * 0.3;
        float oIIILine   = smoothstep(0.8, 0.98, fract(baseEmission * 1.5)) * 0.25;
        float sIILine    = smoothstep(0.7, 0.9, fract(baseEmission * 2.2)) * 0.2;

        vec3 emissionColor = vec3(1.0, 0.1, 0.1) * hAlphaLine + 
                             vec3(0.1, 0.9, 0.8) * oIIILine + 
                             vec3(0.9, 0.2, 0.0) * sIILine;
        
        accCol += emissionColor * density * stepSize * 8.0;
        
        if(alpha > 0.99) {
            alpha = 1.0;
            break;
        }
        
        // Step forward inside the sphere
        pos += rayDir * stepSize;
    }
    
    gl_FragColor = vec4(accCol, alpha * smoothstep(1.0, 0.9, uCollapse) * uOpacity);
}
