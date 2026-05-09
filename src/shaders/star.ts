import { GLSL_NOISE } from './noise';

export const starVertexShader = `
  attribute vec3 color;
  attribute float size;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (400.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const starFragmentShader = `
  varying vec3 vColor;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    float alpha = exp(-dist * dist * 30.0);
    gl_FragColor = vec4(vColor, alpha);
  }
`;

export const nebulaFS = `
uniform float uTime;
uniform vec3 uColor;
uniform float uCollapse;
uniform vec3 uCameraPos;
uniform mat4 uInverseModelMatrix;

varying vec3 vLocalPosition;
varying vec3 vWorldPosition;

${GLSL_NOISE}

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
        density *= smoothstep(targetR, targetR * 0.6, d); // fade near edge
        
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
        
        if(alpha > 0.99) {
            alpha = 1.0;
            break;
        }
        
        // Step forward inside the sphere
        pos += rayDir * stepSize;
    }
    
    gl_FragColor = vec4(accCol, alpha * smoothstep(1.0, 0.9, uCollapse));
}
`;

export const starSurfaceFS = `
uniform float uTime;
uniform vec3 uColor;
uniform float uTurbulence;
uniform float uOpacity;

varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;

${GLSL_NOISE}

void main() {
    float n1 = fbm(vLocalPosition * 5.0 * uTurbulence + uTime * 0.5);
    float n2 = fbm(vLocalPosition * 10.0 * uTurbulence - uTime * 0.8);
    float noiseVal = (n1 + n2) * 0.5;
    
    vec3 finalColor = mix(uColor * 0.5, uColor * 1.5, noiseVal);
    
    // Limb darkening
    float intensity = max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0)));
    finalColor *= smoothstep(0.0, 1.0, intensity * 1.2 + 0.2);
    
    gl_FragColor = vec4(finalColor, uOpacity);
}
`;
