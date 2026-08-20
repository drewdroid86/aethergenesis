varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vNormal;
void main() {
    vLocalPosition = position;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
