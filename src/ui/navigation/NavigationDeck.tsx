import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { HeroStarSystem } from '../../rendering/systems/HeroStarSystem';
import { RadarContact, TargetWaypoint, BoresightTarget, AttitudeTelemetry } from '../../types/navigation';
import { 
    calculateTargetWaypoint, 
    calculateRadarContacts, 
    calculateAttitudeTelemetry, 
    formatAdaptiveDistance 
} from '../../utils/navigationMath';
import { computeSpectralClass } from '../../simulation/StellarPhysics';
import { TargetWaypointHUD } from './TargetWaypointHUD';
import { TacticalRadar } from './TacticalRadar';
import { BoresightScanner } from './BoresightScanner';
import { AttitudeIndicator } from './AttitudeIndicator';
import { GalacticCompassGimbal } from './GalacticCompassGimbal';
import { YouAreHereBadge } from './YouAreHereBadge';
import { SpatialBreadcrumbs } from './SpatialBreadcrumbs';
import { CosmicScaleLadder } from './CosmicScaleLadder';
import { SpatialLabelsLayer } from './SpatialLabelsLayer';
import { TargetLockHUD } from './TargetLockHUD';

export interface NavigationDeckProps {
    camera: THREE.PerspectiveCamera | null;
    stars: HeroStarSystem[];
    selectedStar: HeroStarSystem | null;
    onSelectStar: (star: HeroStarSystem | null) => void;
    onAlignCamera: () => void;
    uiRefs?: {
        hudX?: React.RefObject<HTMLSpanElement | null>;
        hudY?: React.RefObject<HTMLSpanElement | null>;
        hudZ?: React.RefObject<HTMLSpanElement | null>;
    };
    showRadar?: boolean;
    showBoresight?: boolean;
    showSpatialLabels?: boolean;
    visible?: boolean;
    renderBottom?: (slots: {
        left: React.ReactNode;
        right: React.ReactNode;
    }) => React.ReactNode;
}

export const NavigationDeck: React.FC<NavigationDeckProps> = ({
    camera,
    stars,
    selectedStar,
    onSelectStar,
    onAlignCamera,
    uiRefs,
    showRadar = true,
    showBoresight = true,
    showSpatialLabels = true,
    visible = true,
    renderBottom,
}) => {
    const [waypoint, setWaypoint] = useState<TargetWaypoint | null>(null);
    const [contacts, setContacts] = useState<RadarContact[]>([]);
    const [radarRange, setRadarRange] = useState(100);
    const [boresightTarget, setBoresightTarget] = useState<BoresightTarget | null>(null);
    const [nearestStarInfo, setNearestStarInfo] = useState({ name: 'Sol', distance: '0.00 AU' });
    const [cameraDistanceUnits, setCameraDistanceUnits] = useState(10);
    const [telemetry, setTelemetry] = useState<AttitudeTelemetry>({
        headingDeg: 0,
        pitchDeg: 0,
        altitudeFormatted: '+0.00 AU',
        distanceToTargetFormatted: '0.00 AU',
        targetName: 'Sol',
        fovDeg: 60,
        scaleRulerFormatted: '1.00 AU',
        scaleRulerWidthPx: 90
    });

    const raycasterRef = useRef(new THREE.Raycaster());
    const centerVecRef = useRef(new THREE.Vector2(0, 0));

    // High-frequency telemetry update loop (throttled to ~30fps for zero GC overhead)
    useEffect(() => {
        if (!camera || !visible) return;

        let frameId: number;
        let lastUpdateTime = 0;

        const updateLoop = (now: number) => {
            frameId = requestAnimationFrame(updateLoop);

            if (now - lastUpdateTime < 33) return;
            lastUpdateTime = now;

            const camPos = camera.position;

            // 1. Calculate Nearest Star & Camera Distance
            let minDist = Infinity;
            let nearest: HeroStarSystem | null = null;

            for (let i = 0; i < stars.length; i++) {
                const s = stars[i];
                const d = camPos.distanceTo(s.position);
                if (d < minDist) {
                    minDist = d;
                    nearest = s;
                }
            }

            if (nearest) {
                const name = nearest.physicsId ? `Star ${nearest.physicsId.substring(0, 6)}` : 'Host Star';
                setNearestStarInfo({
                    name,
                    distance: formatAdaptiveDistance(minDist).formatted
                });
                setCameraDistanceUnits(minDist);
            }

            // 2. Calculate Target Waypoint & Off-Screen Vector
            if (selectedStar) {
                const wp = calculateTargetWaypoint(
                    camera,
                    selectedStar.position,
                    selectedStar.physicsId ? `Star ${selectedStar.physicsId.substring(0, 6)}` : 'Host Star',
                    'Host Star'
                );
                setWaypoint(wp);
            } else {
                setWaypoint(null);
            }

            // 3. Calculate Radar Contacts (only if radar is active and rendered via slot)
            if (showRadar && (renderBottom != null) && stars.length > 0) {
                const c = calculateRadarContacts(camera, stars, selectedStar, radarRange);
                setContacts(c);
            }

            // 4. Calculate Attitude & Optical Scale Telemetry
            const att = calculateAttitudeTelemetry(camera, selectedStar);
            setTelemetry(att);

            // 5. Calculate Boresight Center Rangefinder Target
            if (showBoresight && stars.length > 0) {
                raycasterRef.current.setFromCamera(centerVecRef.current, camera);
                let closestStar: HeroStarSystem | null = null;
                let closestAngle = 0.08;

                const camForward = new THREE.Vector3();
                camera.getWorldDirection(camForward);
                const toStar = new THREE.Vector3();

                for (let i = 0; i < stars.length; i++) {
                    const s = stars[i];
                    toStar.subVectors(s.position, camera.position).normalize();
                    const dot = camForward.dot(toStar);
                    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
                    if (angle < closestAngle) {
                        closestAngle = angle;
                        closestStar = s;
                    }
                }

                if (closestStar) {
                    const dist = camera.position.distanceTo(closestStar.position);
                    const name = closestStar.physicsId ? `Star ${closestStar.physicsId.substring(0, 6)}` : 'Star';
                    setBoresightTarget({
                        id: closestStar.physicsId || 'star',
                        name,
                        type: 'Star System',
                        spectralClass: computeSpectralClass(closestStar.currentTemp || 5778),
                        distanceFormatted: formatAdaptiveDistance(dist).formatted,
                        mass_solar: closestStar.mass,
                        temp_K: Math.round(closestStar.currentTemp)
                    });
                } else {
                    setBoresightTarget(null);
                }
            }
        };

        frameId = requestAnimationFrame(updateLoop);
        return () => cancelAnimationFrame(frameId);
    }, [camera, stars, selectedStar, radarRange, showBoresight, showRadar, renderBottom, visible]);

    const handleSelectContact = (id: string) => {
        const found = stars.find(s => s.physicsId === id);
        if (found) {
            onSelectStar(found);
        }
    };

    return (
        <>
            {/* 3-Tier Distance LOD In-World Spatial Labels */}
            {visible && showSpatialLabels && (
                <SpatialLabelsLayer 
                    camera={camera}
                    stars={stars}
                    selectedStar={selectedStar}
                    onSelectStar={onSelectStar}
                />
            )}

            {/* 360° Target Lock Reticle & Off-Screen Waypoint Pointer */}
            {visible && (
                <TargetWaypointHUD 
                    waypoint={waypoint} 
                    onAlignCamera={onAlignCamera} 
                />
            )}

            {/* Center-Screen Flight Boresight Rangefinder */}
            {visible && showBoresight && (
                <BoresightScanner 
                    target={boresightTarget} 
                    selectedStarId={selectedStar?.physicsId}
                    onLockTarget={handleSelectContact} 
                />
            )}

            {/* TOP INSTRUMENTATION BAR: Breadcrumbs + Scale Ladder + You Are Here */}
            {visible && (
                <div className="absolute top-20 left-8 right-8 flex justify-between items-start z-20 pointer-events-none gap-4">
                    <div className="flex flex-col gap-2">
                        <SpatialBreadcrumbs 
                            starName={selectedStar?.physicsId ? `Star ${selectedStar.physicsId.substring(0, 6)}` : undefined}
                            onResetUniverse={onAlignCamera}
                            onFocusStar={onAlignCamera}
                        />
                        <CosmicScaleLadder 
                            currentDistanceUnits={cameraDistanceUnits}
                            formattedScale={telemetry.scaleRulerFormatted}
                        />
                    </div>

                    <div className="flex flex-col items-end gap-2">
                        <YouAreHereBadge 
                            nearestStarName={nearestStarInfo.name}
                            distanceToNearest={nearestStarInfo.distance}
                            uiRefs={uiRefs}
                        />
                    </div>
                </div>
            )}

            {/* Optional bottom slot delegation if renderBottom is provided */}
            {renderBottom?.({
                left: visible ? (
                    <FlightDeckTelemetry 
                        camera={camera}
                        selectedStar={selectedStar}
                        telemetry={telemetry}
                        uiRefs={uiRefs}
                    />
                ) : null,
                right: visible ? (
                    <TacticalFlightDeck 
                        camera={camera}
                        stars={stars}
                        selectedStar={selectedStar}
                        onSelectStar={onSelectStar}
                        onAlignCamera={onAlignCamera}
                        showRadar={showRadar}
                        contacts={contacts}
                        waypoint={waypoint}
                        radarRange={radarRange}
                        onRangeChange={setRadarRange}
                        cameraDistanceUnits={cameraDistanceUnits}
                        targetName={telemetry.targetName}
                    />
                ) : null
            })}
        </>
    );
};

export interface FlightDeckTelemetryProps {
    camera: THREE.PerspectiveCamera | null;
    selectedStar?: HeroStarSystem | null;
    telemetry?: AttitudeTelemetry;
    uiRefs?: {
        hudX?: React.RefObject<HTMLSpanElement | null>;
        hudY?: React.RefObject<HTMLSpanElement | null>;
        hudZ?: React.RefObject<HTMLSpanElement | null>;
    };
    className?: string;
}

/**
 * Self-contained bottom-left flight deck telemetry cluster (GalacticCompassGimbal + AttitudeIndicator).
 * Designed to slot into BottomHud's left prop.
 */
export const FlightDeckTelemetry: React.FC<FlightDeckTelemetryProps> = ({
    camera,
    selectedStar = null,
    telemetry: telemetryProp,
    uiRefs,
    className = '',
}) => {
    const [internalTelemetry, setInternalTelemetry] = useState<AttitudeTelemetry>({
        headingDeg: 0,
        pitchDeg: 0,
        altitudeFormatted: '+0.00 AU',
        distanceToTargetFormatted: '0.00 AU',
        targetName: 'Sol',
        fovDeg: 60,
        scaleRulerFormatted: '1.00 AU',
        scaleRulerWidthPx: 90
    });

    const activeTelemetry = telemetryProp ?? internalTelemetry;

    useEffect(() => {
        // Skip fallback RAF loop if telemetry is supplied externally (e.g. from NavigationDeck)
        if (!camera || telemetryProp != null) return;

        let frameId: number;
        let lastUpdateTime = 0;

        const updateLoop = (now: number) => {
            frameId = requestAnimationFrame(updateLoop);

            if (now - lastUpdateTime < 33) return;
            lastUpdateTime = now;

            const att = calculateAttitudeTelemetry(camera, selectedStar);
            setInternalTelemetry(att);
        };

        frameId = requestAnimationFrame(updateLoop);
        return () => cancelAnimationFrame(frameId);
    }, [camera, selectedStar, telemetryProp]);

    return (
        <div className={`pointer-events-none flex flex-col items-center md:items-start gap-2.5 ${className}`.trim()}>
            <GalacticCompassGimbal 
                camera={camera}
                headingDeg={activeTelemetry.headingDeg}
                pitchDeg={activeTelemetry.pitchDeg}
            />
            <AttitudeIndicator 
                telemetry={activeTelemetry} 
                uiRefs={uiRefs} 
            />
        </div>
    );
};

export interface TacticalFlightDeckProps {
    camera: THREE.PerspectiveCamera | null;
    stars: HeroStarSystem[];
    selectedStar: HeroStarSystem | null;
    onSelectStar: (star: HeroStarSystem | null) => void;
    onAlignCamera: () => void;
    showRadar?: boolean;
    contacts?: RadarContact[];
    waypoint?: TargetWaypoint | null;
    radarRange?: number;
    onRangeChange?: (range: number) => void;
    cameraDistanceUnits?: number;
    targetName?: string;
    className?: string;
}

/**
 * Self-contained bottom-right tactical flight deck cluster (TargetLockHUD + TacticalRadar).
 * Designed to slot into BottomHud's right prop alongside action buttons.
 */
export const TacticalFlightDeck: React.FC<TacticalFlightDeckProps> = ({
    camera,
    stars,
    selectedStar,
    onSelectStar,
    onAlignCamera,
    showRadar = true,
    contacts: contactsProp,
    waypoint: waypointProp,
    radarRange: radarRangeProp,
    onRangeChange: onRangeChangeProp,
    cameraDistanceUnits: cameraDistanceUnitsProp,
    targetName: targetNameProp,
    className = '',
}) => {
    const isControlled = contactsProp != null;

    const [internalWaypoint, setInternalWaypoint] = useState<TargetWaypoint | null>(null);
    const [internalContacts, setInternalContacts] = useState<RadarContact[]>([]);
    const [internalRadarRange, setInternalRadarRange] = useState(100);
    const [internalDistanceUnits, setInternalDistanceUnits] = useState(10);
    const [internalTargetName, setInternalTargetName] = useState('Sol');

    const activeWaypoint = waypointProp !== undefined ? waypointProp : internalWaypoint;
    const activeContacts = contactsProp ?? internalContacts;
    const activeRadarRange = radarRangeProp ?? internalRadarRange;
    const handleRangeChange = onRangeChangeProp ?? setInternalRadarRange;
    const activeDistanceUnits = cameraDistanceUnitsProp ?? internalDistanceUnits;
    const activeTargetName = targetNameProp ?? internalTargetName;

    useEffect(() => {
        // Skip fallback RAF loop if contacts are supplied externally (e.g. from NavigationDeck)
        if (!camera || isControlled) return;

        let frameId: number;
        let lastUpdateTime = 0;

        const updateLoop = (now: number) => {
            frameId = requestAnimationFrame(updateLoop);

            if (now - lastUpdateTime < 33) return;
            lastUpdateTime = now;

            const camPos = camera.position;

            if (selectedStar) {
                const d = camPos.distanceTo(selectedStar.position);
                setInternalDistanceUnits(d);
                const sName = selectedStar.physicsId ? `Star ${selectedStar.physicsId.substring(0, 6)}` : 'Host Star';
                setInternalTargetName(sName);
                const wp = calculateTargetWaypoint(
                    camera,
                    selectedStar.position,
                    sName,
                    'Host Star'
                );
                setInternalWaypoint(wp);
            } else {
                setInternalWaypoint(null);
                setInternalTargetName('Sol');
            }

            if (stars.length > 0) {
                const c = calculateRadarContacts(camera, stars, selectedStar, activeRadarRange);
                setInternalContacts(c);
            }
        };

        frameId = requestAnimationFrame(updateLoop);
        return () => cancelAnimationFrame(frameId);
    }, [camera, stars, selectedStar, activeRadarRange, isControlled]);

    const handleSelectContact = (id: string) => {
        const found = stars.find(s => s.physicsId === id);
        if (found) {
            onSelectStar(found);
        }
    };

    return (
        <div className={`pointer-events-none flex flex-col items-center md:items-end gap-3 ${className}`.trim()}>
            {selectedStar && (
                <TargetLockHUD 
                    star={selectedStar}
                    distanceUnits={activeDistanceUnits}
                    bearingDeg={activeWaypoint?.bearingDeg || 0}
                    onFocus={onAlignCamera}
                    onWarpTo={onAlignCamera}
                    onClearTarget={() => onSelectStar(null)}
                />
            )}

            {showRadar && (
                <TacticalRadar 
                    contacts={activeContacts}
                    selectedTargetName={activeTargetName}
                    onSelectContact={handleSelectContact}
                    rangeAU={activeRadarRange}
                    onRangeChange={handleRangeChange}
                />
            )}
        </div>
    );
};
