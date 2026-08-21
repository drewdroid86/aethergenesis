import * as THREE from 'three';
import { FormattedDistance, RadarContact, TargetWaypoint, AttitudeTelemetry } from '../types/navigation';
import { HeroStarSystem } from '../rendering/systems/HeroStarSystem';
import { computeSpectralClass } from '../simulation/StellarPhysics';

// Astronomical Conversion Constants
export const AU_TO_KM = 149597870.7; // 1 AU in km
export const LY_TO_AU = 63241.077;    // 1 Light-Year in AU
export const PC_TO_LY = 3.26156;      // 1 Parsec in Light-Years
export const KPC_TO_LY = 3261.56;

// Reusable scratch vectors to ensure zero GC allocations during high-frequency telemetry updates
const _camForward = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _projected = new THREE.Vector3();

/**
 * Converts internal simulation distance units to human-readable astronomical units
 * dynamically scaling from km -> AU -> ly -> kpc.
 */
export function formatAdaptiveDistance(distanceUnits: number): FormattedDistance {
    const d = Math.max(0, distanceUnits);

    if (d < 0.01) {
        // Less than 0.01 AU (~1.5 million km) -> Format in kilometers
        const km = d * AU_TO_KM;
        if (km < 1000) {
            return { value: km, unit: 'km', formatted: `${km.toFixed(0)} km` };
        }
        return { value: km, unit: 'km', formatted: `${Math.round(km).toLocaleString()} km` };
    }

    if (d < 500) {
        // Interplanetary scale: 0.01 AU to 500 AU
        if (d < 10) {
            return { value: d, unit: 'AU', formatted: `${d.toFixed(2)} AU` };
        }
        return { value: d, unit: 'AU', formatted: `${d.toFixed(1)} AU` };
    }

    // Interstellar scale: convert AU to light-years (or if large coordinate, directly interpret)
    const ly = d > 10000 ? d / 1000 : d / LY_TO_AU;
    if (ly < 1000) {
        return { value: ly, unit: 'ly', formatted: `${ly.toFixed(2)} ly` };
    }

    const kpc = ly / 1000;
    return { value: kpc, unit: 'kpc', formatted: `${kpc.toFixed(2)} kpc` };
}

/**
 * Calculates a dynamic, responsive optical scale bar ruler
 * given the camera's focus distance, FOV, and viewport dimensions.
 */
export function calculateScaleRuler(
    camera: THREE.PerspectiveCamera,
    focusDistance: number,
    viewportWidthPx: number
): { formatted: string; widthPx: number; fovDeg: number } {
    const fovRad = (camera.fov * Math.PI) / 180;
    const aspect = camera.aspect || (window.innerWidth / (window.innerHeight || 1));
    const frustumWidth = 2.0 * Math.max(0.1, focusDistance) * Math.tan(fovRad * 0.5) * aspect;

    // We want a ruler width between 70px and 150px
    const targetPixelWidth = Math.max(80, Math.min(140, viewportWidthPx * 0.1));
    const targetWorldSpan = (targetPixelWidth / viewportWidthPx) * frustumWidth;

    // Nice round scale numbers in AU or km/ly
    const candidateSpans = [
        0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0, 5000.0
    ];

    let chosenSpan = candidateSpans[0];
    let minDiff = Math.abs(candidateSpans[0] - targetWorldSpan);

    for (const span of candidateSpans) {
        const diff = Math.abs(span - targetWorldSpan);
        if (diff < minDiff) {
            minDiff = diff;
            chosenSpan = span;
        }
    }

    const actualPixelWidth = Math.round((chosenSpan / frustumWidth) * viewportWidthPx);
    const distanceInfo = formatAdaptiveDistance(chosenSpan);

    return {
        formatted: distanceInfo.formatted,
        widthPx: Math.max(40, Math.min(220, actualPixelWidth)),
        fovDeg: Math.round(camera.fov)
    };
}

/**
 * Calculates 360-degree target waypoint telemetry including screen-space projection,
 * off-screen edge clamping, bearing angle, and distance badge.
 */
export function calculateTargetWaypoint(
    camera: THREE.PerspectiveCamera,
    targetPosition: THREE.Vector3,
    targetName: string,
    targetType: string = 'Star'
): TargetWaypoint {
    _projected.copy(targetPosition);
    _projected.project(camera);

    const isBehind = _projected.z > 1.0;
    const rawX = (_projected.x + 1.0) * 0.5;
    const rawY = (1.0 - _projected.y) * 0.5;

    const isOnScreen = !isBehind && rawX >= 0.05 && rawX <= 0.95 && rawY >= 0.05 && rawY <= 0.95;

    // Angle from screen center (0.5, 0.5)
    let dx = rawX - 0.5;
    let dy = rawY - 0.5;

    if (isBehind) {
        dx = -dx;
        dy = -dy;
    }

    const angleRad = Math.atan2(dy, dx);
    const angleDeg = ((angleRad * 180) / Math.PI + 360) % 360;

    // Clamped screen edge coordinates for off-screen pointer
    let screenX = rawX;
    let screenY = rawY;

    if (!isOnScreen) {
        const margin = 0.06;
        const cosA = Math.cos(angleRad);
        const sinA = Math.sin(angleRad);

        // Intersect ray with screen bounding box [margin, 1-margin]
        const boundX = (1.0 - 2.0 * margin) * 0.5;
        const boundY = (1.0 - 2.0 * margin) * 0.5;

        const scaleX = cosA !== 0 ? Math.abs(boundX / cosA) : Infinity;
        const scaleY = sinA !== 0 ? Math.abs(boundY / sinA) : Infinity;
        const scale = Math.min(scaleX, scaleY);

        screenX = 0.5 + cosA * scale;
        screenY = 0.5 + sinA * scale;
    }

    // Relative Bearing calculation (angle between camera look vector and target)
    camera.getWorldDirection(_camForward);
    _toTarget.subVectors(targetPosition, camera.position).normalize();
    const distanceToTarget = camera.position.distanceTo(targetPosition);

    const forwardDot = Math.max(-1.0, Math.min(1.0, _camForward.dot(_toTarget)));
    const totalAngleOffBoresight = Math.round((Math.acos(forwardDot) * 180) / Math.PI);

    // Elevation angle
    const elevationRad = Math.asin(Math.max(-1.0, Math.min(1.0, _toTarget.y)));
    const elevationAngleDeg = Math.round((elevationRad * 180) / Math.PI);

    const distanceFormatted = formatAdaptiveDistance(distanceToTarget).formatted;

    return {
        targetName,
        targetType,
        distanceFormatted,
        screenX: Math.max(0.04, Math.min(0.96, screenX)),
        screenY: Math.max(0.04, Math.min(0.96, screenY)),
        isOnScreen,
        angleDeg: Math.round(angleDeg),
        bearingDeg: totalAngleOffBoresight,
        elevationAngleDeg
    };
}

/**
 * Calculates radar contacts relative to the camera for the tactical 2.5D radar scope.
 */
export function calculateRadarContacts(
    camera: THREE.PerspectiveCamera,
    stars: HeroStarSystem[],
    selectedStar: HeroStarSystem | null,
    maxRadarRangeAU: number = 100
): RadarContact[] {
    const contacts: RadarContact[] = [];
    const camPos = camera.position;

    // Get camera yaw on horizontal plane
    camera.getWorldDirection(_camForward);
    const camYaw = Math.atan2(_camForward.x, _camForward.z);

    const cosYaw = Math.cos(-camYaw);
    const sinYaw = Math.sin(-camYaw);

    for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        const dx = star.position.x - camPos.x;
        const dy = star.position.y - camPos.y;
        const dz = star.position.z - camPos.z;

        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (distance > maxRadarRangeAU && star !== selectedStar) continue;

        // Rotate into camera-relative orientation (forward is +Y on 2D radar, right is +X)
        const relX = (dx * cosYaw - dz * sinYaw) / maxRadarRangeAU;
        const relY = -(dx * sinYaw + dz * cosYaw) / maxRadarRangeAU;

        // Clamp to radar circle boundary
        const distFromCenter = Math.sqrt(relX * relX + relY * relY);
        let clampedX = relX;
        let clampedY = relY;
        if (distFromCenter > 0.95) {
            clampedX = (relX / distFromCenter) * 0.95;
            clampedY = (relY / distFromCenter) * 0.95;
        }

        const spectral = computeSpectralClass(star.currentTemp || 5778);
        const name = star.physicsId ? `Star ${star.physicsId.substring(0, 6)}` : `Host Star ${i + 1}`;

        contacts.push({
            id: star.physicsId || `star_${i}`,
            name,
            spectralClass: spectral,
            distance,
            distanceFormatted: formatAdaptiveDistance(distance).formatted,
            relX: clampedX,
            relY: clampedY,
            elevationRel: Math.max(-1.0, Math.min(1.0, dy / maxRadarRangeAU)),
            isSelected: star === selectedStar,
            isHostStar: i === 0
        });

        if (contacts.length >= 24) break;
    }

    return contacts;
}

/**
 * Calculates complete flight attitude & spatial orientation telemetry.
 */
export function calculateAttitudeTelemetry(
    camera: THREE.PerspectiveCamera,
    selectedStar: HeroStarSystem | null
): AttitudeTelemetry {
    camera.getWorldDirection(_camForward);

    // 1. Heading (0° North/Galactic Core to 360°)
    let headingDeg = Math.round((Math.atan2(_camForward.x, _camForward.z) * 180) / Math.PI);
    if (headingDeg < 0) headingDeg += 360;

    // 2. Pitch angle relative to ecliptic plane (-90° down to +90° up)
    const pitchDeg = Math.round((Math.asin(Math.max(-1.0, Math.min(1.0, _camForward.y))) * 180) / Math.PI);

    // 3. Ecliptic / Galactic Altitude
    const hostPosY = selectedStar ? selectedStar.position.y : 0;
    const altitudeUnits = camera.position.y - hostPosY;
    const sign = altitudeUnits >= 0 ? '+' : '−';
    const altInfo = formatAdaptiveDistance(Math.abs(altitudeUnits));
    const altitudeFormatted = `${sign}${altInfo.formatted}`;

    // 4. Distance to target
    let distanceToTargetFormatted = '0.00 AU';
    let targetName = 'Galactic Center';

    if (selectedStar) {
        const d = camera.position.distanceTo(selectedStar.position);
        distanceToTargetFormatted = formatAdaptiveDistance(d).formatted;
        targetName = selectedStar.physicsId ? `Star ${selectedStar.physicsId.substring(0, 6)}` : 'Host Star';
    }

    // 5. Scale Ruler
    const ruler = calculateScaleRuler(camera, selectedStar ? camera.position.distanceTo(selectedStar.position) : 10, window.innerWidth);

    return {
        headingDeg,
        pitchDeg,
        altitudeFormatted,
        distanceToTargetFormatted,
        targetName,
        fovDeg: ruler.fovDeg,
        scaleRulerFormatted: ruler.formatted,
        scaleRulerWidthPx: ruler.widthPx
    };
}
