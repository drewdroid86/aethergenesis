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

interface NavigationDeckProps {
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
        if (!camera) return;

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

            // 3. Calculate Radar Contacts
            if (stars.length > 0) {
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
    }, [camera, stars, selectedStar, radarRange, showBoresight]);

    const handleSelectContact = (id: string) => {
        const found = stars.find(s => s.physicsId === id);
        if (found) {
            onSelectStar(found);
        }
    };

    return (
        <>
            {/* 3-Tier Distance LOD In-World Spatial Labels */}
            {showSpatialLabels && (
                <SpatialLabelsLayer 
                    camera={camera}
                    stars={stars}
                    selectedStar={selectedStar}
                    onSelectStar={onSelectStar}
                />
            )}

            {/* 360° Target Lock Reticle & Off-Screen Waypoint Pointer */}
            <TargetWaypointHUD 
                waypoint={waypoint} 
                onAlignCamera={onAlignCamera} 
            />

            {/* Center-Screen Flight Boresight Rangefinder */}
            {showBoresight && (
                <BoresightScanner 
                    target={boresightTarget} 
                    selectedStarId={selectedStar?.physicsId}
                    onLockTarget={handleSelectContact} 
                />
            )}

            {/* TOP INSTRUMENTATION BAR: Breadcrumbs + Scale Ladder + You Are Here */}
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

            {/* BOTTOM-LEFT FLIGHT DECK: Attitude Indicator & 3D Gimbal */}
            <div className="absolute bottom-8 left-8 z-20 pointer-events-none flex flex-col gap-2.5">
                <GalacticCompassGimbal 
                    camera={camera}
                    headingDeg={telemetry.headingDeg}
                    pitchDeg={telemetry.pitchDeg}
                />
                <AttitudeIndicator 
                    telemetry={telemetry} 
                    uiRefs={uiRefs} 
                />
            </div>

            {/* BOTTOM-RIGHT: Target Lock Action Card + Tactical Radar */}
            <div className="absolute bottom-28 right-8 z-20 pointer-events-none flex flex-col items-end gap-3">
                {selectedStar && (
                    <TargetLockHUD 
                        star={selectedStar}
                        distanceUnits={cameraDistanceUnits}
                        bearingDeg={waypoint?.bearingDeg || 0}
                        onFocus={onAlignCamera}
                        onWarpTo={onAlignCamera}
                        onClearTarget={() => onSelectStar(null)}
                    />
                )}

                {showRadar && (
                    <TacticalRadar 
                        contacts={contacts}
                        selectedTargetName={telemetry.targetName}
                        onSelectContact={handleSelectContact}
                        rangeAU={radarRange}
                        onRangeChange={setRadarRange}
                    />
                )}
            </div>
        </>
    );
};
