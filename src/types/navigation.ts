export type NavDistanceUnit = 'km' | 'AU' | 'ly' | 'kpc';

export interface FormattedDistance {
    value: number;
    unit: NavDistanceUnit;
    formatted: string;
}

export interface RadarContact {
    id: string;
    name: string;
    spectralClass: string;
    distance: number;
    distanceFormatted: string;
    relX: number; // -1 to 1 on radar plane
    relY: number; // -1 to 1 on radar plane
    elevationRel: number; // vertical height offset for stem rendering
    isSelected: boolean;
    isHostStar?: boolean;
}

export interface TargetWaypoint {
    targetName: string;
    targetType: string;
    distanceFormatted: string;
    screenX: number; // 0 to 1
    screenY: number; // 0 to 1
    isOnScreen: boolean;
    angleDeg: number; // 0-360 angle for edge pointer
    bearingDeg: number; // relative bearing from camera forward vector
    elevationAngleDeg: number;
}

export interface BoresightTarget {
    id: string;
    name: string;
    type: string;
    spectralClass?: string;
    distanceFormatted: string;
    mass_solar?: number;
    temp_K?: number;
}

export interface AttitudeTelemetry {
    headingDeg: number; // 0 - 360 yaw relative to galactic core
    pitchDeg: number;   // -90 to +90 pitch relative to ecliptic/galactic plane
    altitudeFormatted: string; // e.g. "+0.32 AU" or "-1.4 ly"
    distanceToTargetFormatted: string;
    targetName: string;
    fovDeg: number;
    scaleRulerFormatted: string;
    scaleRulerWidthPx: number;
}
