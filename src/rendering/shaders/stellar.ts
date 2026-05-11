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

export const CinematicPassShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    varying vec2 vUv;

    float random(vec2 p) {
      return fract(sin(dot(p.xy, vec2(12.9898,78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      // Chromatic Aberration
      vec2 offset = (uv - 0.5) * 0.002;
      float r = texture2D(tDiffuse, uv + offset).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - offset).b;
      vec3 color = vec3(r, g, b);

      // Dynamic Film Grain
      float grain = (random(uv * mod(time, 100.0)) - 0.5) * 0.04;
      color += grain;

      // Vignette
      float dist = distance(uv, vec2(0.5));
      color *= smoothstep(0.8, 0.2, dist * 1.1);

      gl_FragColor = vec4(color, 1.0);
    }
  `
};

export const nebulaFS = `
uniform float uTime;
uniform vec3 uColor;
uniform float uCollapse;
uniform vec3 uCameraPos;
uniform mat4 uInverseModelMatrix;

varying vec3 vLocalPosition;
varying vec3 vWorldPosition;

float hash(vec3 p) {
    p = fract(p * 0.3183099 + .1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i+vec3(0.0,0.0,0.0)),hash(i+vec3(1.0,0.0,0.0)),f.x),mix(hash(i+vec3(0.0,1.0,0.0)),hash(i+vec3(1.0,1.0,0.0)),f.x),f.y),
               mix(mix(hash(i+vec3(0.0,0.0,1.0)),hash(i+vec3(1.0,0.0,1.0)),f.x),mix(hash(i+vec3(0.0,1.0,1.0)),hash(i+vec3(1.0,1.0,1.0)),f.x),f.y),f.z);
}
float fbm(vec3 p) {
    float f = 0.0;
    f += 0.5000 * noise(p); p *= 2.5;
    f += 0.2500 * noise(p); 
    return f;
}

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

float hash(vec3 p) {
    p = fract(p * 0.3183099 + .1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i+vec3(0.0,0.0,0.0)),hash(i+vec3(1.0,0.0,0.0)),f.x),mix(hash(i+vec3(0.0,1.0,0.0)),hash(i+vec3(1.0,1.0,0.0)),f.x),f.y),
               mix(mix(hash(i+vec3(0.0,0.0,1.0)),hash(i+vec3(1.0,0.0,1.0)),f.x),mix(hash(i+vec3(0.0,1.0,1.0)),hash(i+vec3(1.0,1.0,1.0)),f.x),f.y),f.z);
}
float fbm(vec3 p) {
    float f = 0.0;
    f += 0.5000 * noise(p); p *= 2.5;
    f += 0.2500 * noise(p); 
    return f;
}

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

export const displacementVS = `
varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;
uniform float uTime;

float hash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 151.7182))) * 43758.5453);
}

float noise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(p + vec3(0,0,0)), hash(p + vec3(1,0,0)),f.x),
                   mix(hash(p + vec3(0,1,0)), hash(p + vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(p + vec3(0,0,1)), hash(p + vec3(1,0,1)),f.x),
                   mix(hash(p + vec3(0,1,1)), hash(p + vec3(1,1,1)),f.x),f.y),f.z);
}

void main() {
    vNormal = normalize(normalMatrix * normal);
    vec3 p = position;
    float d = noise(p * 5.0 + uTime * 2.0) * 0.15;
    p += normal * d;
    vLocalPosition = p;
    vWorldPosition = (modelMatrix * vec4(p, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const subtleDisplacementVS = `
varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;
uniform float uTime;

float hash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 151.7182))) * 43758.5453);
}

float noise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(p + vec3(0,0,0)), hash(p + vec3(1,0,0)),f.x),
                   mix(hash(p + vec3(0,1,0)), hash(p + vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(p + vec3(0,0,1)), hash(p + vec3(1,0,1)),f.x),
                   mix(hash(p + vec3(0,1,1)), hash(p + vec3(1,1,1)),f.x),f.y),f.z);
}

void main() {
    vNormal = normalize(normalMatrix * normal);
    vec3 p = position;
    float d = noise(p * 10.0 + uTime * 1.5) * 0.02;
    p += normal * d;
    vLocalPosition = p;
    vWorldPosition = (modelMatrix * vec4(p, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const basicVS = `
varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;
void main() {
    vLocalPosition = position;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
