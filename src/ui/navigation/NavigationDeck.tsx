import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { HeroStarSystem } from '../../rendering/systems/HeroStarSystem';
import { RadarContact, TargetWaypoint, BoresightTarget, AttitudeTelemetry } from '../../types/navigation';
import { 
    calculateTargetWaypoint, 
    calculateRadarContacts, 
    calculateAttitudeTelemetry, 
    formatAdaptiveDistance,
    WORLD_UNITS_PER_AU
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
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { HudCoordRefs } from '../../utils/hooks/useSimulation';

const _deckCamForward = new THREE.Vector3();
const _deckToStar = new THREE.Vector3();

export interface NavigationDeckProps {
    camera: THREE.PerspectiveCamera | null;
    stars: HeroStarSystem[];
    activeStarCount?: number;
    selectedStar: HeroStarSystem | null;
    onSelectStar: (star: HeroStarSystem | null) => void;
    onAlignCamera: () => void;
    onResetCamera?: () => void;
    // H1 fix: per-consumer coordinate refs. Sharing one ref object across
    // conditionally-mounted elements (badge drawer, attitude fallback) lets
    // React null it on unmount, freezing the tick-loop updates for the rest.
    coordUiRefs?: {
        badge?: HudCoordRefs;
        attitude?: HudCoordRefs;
    };
    showRadar?: boolean;
    showBoresight?: boolean;
    showSpatialLabels?: boolean;
    visible?: boolean;
    renderBottom?: (slots: {
        left: React.ReactNode;
        right: React.ReactNode;
    }) => React.ReactNode;
    // Optional top-cluster composition slot. When provided, the top
    // instrumentation bar node is passed out for the caller to place (e.g.
    // inside a phone-width scrollable column next to the header HUD) instead
    // of rendering in place. Desktop rendering is unchanged either way.
    renderTop?: (topBar: React.ReactNode) => React.ReactNode;
}

export const NavigationDeck: React.FC<NavigationDeckProps> = ({
    camera,
    stars,
    activeStarCount,
    selectedStar,
    onSelectStar,
    onAlignCamera,
    onResetCamera,
    coordUiRefs,
    showRadar = true,
    showBoresight = true,
    showSpatialLabels = true,
    visible = true,
    renderBottom,
    renderTop,
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
            const starLimit = activeStarCount != null ? Math.min(stars.length, activeStarCount) : stars.length;

            // 1. Calculate Nearest Star & Camera Distance
            let minDist = Infinity;
            let nearest: HeroStarSystem | null = null;

            for (let i = 0; i < starLimit; i++) {
                const s = stars[i];
                if (!s.visible || s.t < 0) continue;
                const d = camPos.distanceTo(s.position) / WORLD_UNITS_PER_AU;
                if (d < minDist) {
                    minDist = d;
                    nearest = s;
                }
            }

            if (nearest) {
                const name = nearest.physicsId ? `Star ${nearest.physicsId.substring(0, 6)}` : 'Host Star';
                const distanceFormatted = formatAdaptiveDistance(minDist).formatted;
                setNearestStarInfo(prev =>
                    prev.name === name && prev.distance === distanceFormatted
                        ? prev
                        : { name, distance: distanceFormatted }
                );
                setCameraDistanceUnits(prev => (Math.abs(prev - minDist) < 1e-4 ? prev : minDist));
            }

            // 2. Calculate Target Waypoint & Off-Screen Vector
            if (selectedStar) {
                const wp = calculateTargetWaypoint(
                    camera,
                    selectedStar.position,
                    selectedStar.physicsId ? `Star ${selectedStar.physicsId.substring(0, 6)}` : 'Host Star',
                    'Host Star'
                );
                setWaypoint(prev =>
                    prev &&
                    prev.targetName === wp.targetName &&
                    prev.targetType === wp.targetType &&
                    prev.distanceFormatted === wp.distanceFormatted &&
                    prev.isOnScreen === wp.isOnScreen &&
                    prev.angleDeg === wp.angleDeg &&
                    prev.bearingDeg === wp.bearingDeg &&
                    prev.elevationAngleDeg === wp.elevationAngleDeg &&
                    Math.abs(prev.screenX - wp.screenX) < 1e-4 &&
                    Math.abs(prev.screenY - wp.screenY) < 1e-4
                        ? prev
                        : wp
                );
            } else {
                setWaypoint(prev => (prev === null ? prev : null));
            }

            // 3. Calculate Radar Contacts (only if radar is active and rendered via slot)
            if (showRadar && (renderBottom != null) && starLimit > 0) {
                const c = calculateRadarContacts(camera, stars, selectedStar, radarRange, starLimit);
                setContacts(prev => {
                    if (prev.length === 0 && c.length === 0) return prev;
                    if (
                        prev.length === c.length &&
                        prev.every((p, idx) => {
                            const n = c[idx];
                            return (
                                p.id === n.id &&
                                p.distanceFormatted === n.distanceFormatted &&
                                p.isSelected === n.isSelected &&
                                p.spectralClass === n.spectralClass &&
                                Math.abs(p.relX - n.relX) < 1e-4 &&
                                Math.abs(p.relY - n.relY) < 1e-4 &&
                                Math.abs(p.elevationRel - n.elevationRel) < 1e-4
                            );
                        })
                    ) {
                        return prev;
                    }
                    return c;
                });
            }

            // 4. Calculate Attitude & Optical Scale Telemetry
            const att = calculateAttitudeTelemetry(camera, selectedStar);
            setTelemetry(prev =>
                prev.headingDeg === att.headingDeg &&
                prev.pitchDeg === att.pitchDeg &&
                prev.altitudeFormatted === att.altitudeFormatted &&
                prev.distanceToTargetFormatted === att.distanceToTargetFormatted &&
                prev.targetName === att.targetName &&
                prev.fovDeg === att.fovDeg &&
                prev.scaleRulerFormatted === att.scaleRulerFormatted &&
                prev.scaleRulerWidthPx === att.scaleRulerWidthPx
                    ? prev
                    : att
            );

            // 5. Calculate Boresight Center Rangefinder Target
            if (showBoresight && starLimit > 0) {
                raycasterRef.current.setFromCamera(centerVecRef.current, camera);
                let closestStar: HeroStarSystem | null = null;
                let closestAngle = 0.08;

                camera.getWorldDirection(_deckCamForward);

                for (let i = 0; i < starLimit; i++) {
                    const s = stars[i];
                    if (!s.visible || s.t < 0) continue;
                    _deckToStar.subVectors(s.position, camera.position).normalize();
                    const dot = _deckCamForward.dot(_deckToStar);
                    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
                    if (angle < closestAngle) {
                        closestAngle = angle;
                        closestStar = s;
                    }
                }

                if (closestStar) {
                    const dist = camera.position.distanceTo(closestStar.position) / WORLD_UNITS_PER_AU;
                    const name = closestStar.physicsId ? `Star ${closestStar.physicsId.substring(0, 6)}` : 'Star';
                    const id = closestStar.physicsId || 'star';
                    const spectralClass = computeSpectralClass(closestStar.currentTemp || 5778);
                    const distanceFormatted = formatAdaptiveDistance(dist).formatted;
                    const mass_solar = closestStar.currentMass ?? closestStar.mass;
                    const temp_K = Math.round(closestStar.currentTemp);
                    setBoresightTarget(prev =>
                        prev &&
                        prev.id === id &&
                        prev.name === name &&
                        prev.spectralClass === spectralClass &&
                        prev.distanceFormatted === distanceFormatted &&
                        prev.mass_solar === mass_solar &&
                        prev.temp_K === temp_K
                            ? prev
                            : {
                                id,
                                name,
                                type: 'Star System',
                                spectralClass,
                                distanceFormatted,
                                mass_solar,
                                temp_K
                            }
                    );
                } else {
                    setBoresightTarget(prev => (prev === null ? prev : null));
                }
            }
        };

        frameId = requestAnimationFrame(updateLoop);
        return () => cancelAnimationFrame(frameId);
    }, [camera, stars, activeStarCount, selectedStar, radarRange, showBoresight, showRadar, renderBottom, visible]);

    const handleSelectContact = (id: string) => {
        const starLimit = activeStarCount != null ? Math.min(stars.length, activeStarCount) : stars.length;
        for (let i = 0; i < starLimit; i++) {
            const s = stars[i];
            if (!s.visible || s.t < 0) continue;
            if (s.physicsId === id) {
                onSelectStar(s);
                break;
            }
        }
    };

    // TOP INSTRUMENTATION BAR: Breadcrumbs + Scale Ladder + You Are Here.
    // Rendered in place by default; when renderTop is provided the node is
    // passed out so the caller can stack it with the header HUD in a single
    // phone-width column. Same node either way, so desktop is untouched.
    const topBar = visible ? (
        <div className="absolute top-20 left-8 right-8 flex justify-between items-start z-20 pointer-events-none gap-4 max-[480px]:static max-[480px]:order-2 max-[480px]:flex-col max-[480px]:items-stretch max-[480px]:gap-2 max-[480px]:px-4">
            <div className="flex flex-col gap-2">
                <SpatialBreadcrumbs 
                    starName={selectedStar?.physicsId ? `Star ${selectedStar.physicsId.substring(0, 6)}` : undefined}
                    onResetUniverse={onResetCamera ?? onAlignCamera}
                    onFocusStar={onAlignCamera}
                />
                <CosmicScaleLadder 
                    currentDistanceUnits={cameraDistanceUnits}
                    formattedScale={telemetry.scaleRulerFormatted}
                />
            </div>

            <div className="flex flex-col items-end gap-2 max-[480px]:items-stretch">
                <YouAreHereBadge 
                    nearestStarName={nearestStarInfo.name}
                    distanceToNearest={nearestStarInfo.distance}
                    uiRefs={coordUiRefs?.badge}
                />
            </div>
        </div>
    ) : null;

    return (
        <>
            {/* 3-Tier Distance LOD In-World Spatial Labels */}
            {visible && showSpatialLabels && (
                <SpatialLabelsLayer 
                    camera={camera}
                    stars={stars}
                    activeStarCount={activeStarCount}
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

            {/* Default placement when the caller does not compose the top cluster */}
            {!renderTop && topBar}

            {/* Optional bottom slot delegation if renderBottom is provided */}
            {renderBottom?.({
                left: visible ? (
                    <FlightDeckTelemetry 
                        camera={camera}
                        selectedStar={selectedStar}
                        telemetry={telemetry}
                        uiRefs={coordUiRefs?.attitude}
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

            {/* Optional top-cluster composition slot. Rendered after the bottom
                slot so desktop paint order is unchanged (the bar never overlaps
                the bottom deck on desktop); on phones the caller stacks it with
                the header HUD in one scrollable column. */}
            {renderTop?.(topBar)}
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
    // Phone (<=480px): the compass + attitude stack collapses behind a
    // toggle so the bottom deck stays short and never reaches the top
    // cluster. Desktop renders the full stack unconditionally.
    const [telemetryOpen, setTelemetryOpen] = useState(false);

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
            <button
                onClick={() => setTelemetryOpen(v => !v)}
                className="min-[481px]:hidden pointer-events-auto flex min-h-[44px] w-full max-w-[190px] items-center justify-center gap-1.5 rounded-full border border-[rgba(126,184,255,0.2)] bg-[rgba(8,8,20,0.65)] px-4 font-mono text-[9px] uppercase tracking-widest text-[#7EB8FF]"
                aria-expanded={telemetryOpen}
                aria-label={telemetryOpen ? 'Hide flight telemetry' : 'Show flight telemetry'}
                title="Flight telemetry"
            >
                {telemetryOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                <span>Telemetry</span>
            </button>
            <div className={`flex flex-col items-center md:items-start gap-2.5 min-[481px]:contents ${telemetryOpen ? '' : 'max-[480px]:hidden'}`}>
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
                const d = camPos.distanceTo(selectedStar.position) / WORLD_UNITS_PER_AU;
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
        const found = stars.find(s => s.visible && s.t >= 0 && s.physicsId === id);
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
