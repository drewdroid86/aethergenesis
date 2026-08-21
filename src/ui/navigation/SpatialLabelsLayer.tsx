import React, { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { HeroStarSystem } from '../../rendering/systems/HeroStarSystem';
import { formatAdaptiveDistance } from '../../utils/navigationMath';
import { computeSpectralClass } from '../../simulation/StellarPhysics';
import { audioEngine } from '../../audio/AudioEngine';

interface SpatialLabelsLayerProps {
    camera: THREE.PerspectiveCamera | null;
    stars: HeroStarSystem[];
    selectedStar: HeroStarSystem | null;
    onSelectStar: (star: HeroStarSystem) => void;
    maxLabels?: number;
}

interface ProjectedStarLabel {
    id: string;
    star: HeroStarSystem;
    name: string;
    screenX: number; // 0-1
    screenY: number; // 0-1
    distance: number;
    distanceFormatted: string;
    spectralClass: string;
    lod: 'far' | 'medium' | 'near';
    isSelected: boolean;
}

const _projVec = new THREE.Vector3();

export const SpatialLabelsLayer: React.FC<SpatialLabelsLayerProps> = ({
    camera,
    stars,
    selectedStar,
    onSelectStar,
    maxLabels = 8
}) => {
    const [labels, setLabels] = useState<ProjectedStarLabel[]>([]);
    const lastUpdateRef = useRef(0);

    useEffect(() => {
        if (!camera || stars.length === 0) return;

        let frameId: number;

        const updateLabels = (now: number) => {
            frameId = requestAnimationFrame(updateLabels);

            // Throttle to 30fps to avoid React render churn
            if (now - lastUpdateRef.current < 33) return;
            lastUpdateRef.current = now;

            const projected: ProjectedStarLabel[] = [];
            const camPos = camera.position;

            for (let i = 0; i < stars.length; i++) {
                const s = stars[i];
                _projVec.copy(s.position);
                _projVec.project(camera);

                // Check if inside camera view frustum
                const inFront = _projVec.z < 1.0;
                const inView = inFront && _projVec.x >= -0.9 && _projVec.x <= 0.9 && _projVec.y >= -0.9 && _projVec.y <= 0.9;

                if (!inView && s !== selectedStar) continue;

                const screenX = (_projVec.x + 1.0) * 0.5;
                const screenY = (1.0 - _projVec.y) * 0.5;
                const distance = camPos.distanceTo(s.position);

                // LOD determination
                let lod: 'far' | 'medium' | 'near' = 'far';
                if (distance < 15 || s === selectedStar) lod = 'near';
                else if (distance < 150) lod = 'medium';

                const name = s.physicsId ? `Star ${s.physicsId.substring(0, 6)}` : `Host Star ${i + 1}`;
                const spectral = computeSpectralClass(s.currentTemp || 5778);

                projected.push({
                    id: s.physicsId || `star_${i}`,
                    star: s,
                    name,
                    screenX,
                    screenY,
                    distance,
                    distanceFormatted: formatAdaptiveDistance(distance).formatted,
                    spectralClass: spectral,
                    lod,
                    isSelected: s === selectedStar
                });

                if (projected.length >= maxLabels * 3) break;
            }

            // Sort: Selected star always wins, then sort by closest distance
            projected.sort((a, b) => {
                if (a.isSelected) return -1;
                if (b.isSelected) return 1;
                return a.distance - b.distance;
            });

            // Greedy 2D pixel collision pass (~64px radius threshold)
            const acceptedPoints: { x: number; y: number }[] = [];
            const nonColliding: ProjectedStarLabel[] = [];
            const screenW = typeof window !== 'undefined' ? window.innerWidth : 1920;
            const screenH = typeof window !== 'undefined' ? window.innerHeight : 1080;
            const minDistanceSq = 64 * 64; // 4096 px^2

            for (let i = 0; i < projected.length; i++) {
                const item = projected[i];
                const px = item.screenX * screenW;
                const py = item.screenY * screenH;

                if (item.isSelected) {
                    acceptedPoints.push({ x: px, y: py });
                    nonColliding.push(item);
                    continue;
                }

                // Check distance against all already accepted labels
                let collides = false;
                for (let j = 0; j < acceptedPoints.length; j++) {
                    const pt = acceptedPoints[j];
                    const dx = px - pt.x;
                    const dy = py - pt.y;
                    if (dx * dx + dy * dy < minDistanceSq) {
                        collides = true;
                        break;
                    }
                }

                if (!collides) {
                    acceptedPoints.push({ x: px, y: py });
                    nonColliding.push(item);
                }

                if (nonColliding.length >= maxLabels) break;
            }

            setLabels(nonColliding);
        };

        frameId = requestAnimationFrame(updateLabels);
        return () => cancelAnimationFrame(frameId);
    }, [camera, stars, selectedStar, maxLabels]);

    return (
        <div className="fixed inset-0 pointer-events-none z-10 select-none overflow-hidden" aria-hidden="true">
            {labels.map((item) => {
                const posX = `${(item.screenX * 100).toFixed(2)}vw`;
                const posY = `${(item.screenY * 100).toFixed(2)}vh`;

                if (item.lod === 'far' && !item.isSelected) {
                    // Far LOD: Minimal glowing dot
                    return (
                        <div
                            key={item.id}
                            className="absolute -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#7EB8FF]/60 shadow-[0_0_4px_#7EB8FF] transition-opacity duration-300"
                            style={{ left: posX, top: posY }}
                        />
                    );
                }

                if (item.lod === 'medium' && !item.isSelected) {
                    // Medium LOD: Name + Spectral Class Pill
                    return (
                        <button
                            key={item.id}
                            onClick={() => {
                                audioEngine.playUiClick();
                                onSelectStar(item.star);
                            }}
                            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto flex items-center gap-1 bg-[rgba(8,8,20,0.6)] hover:bg-[rgba(8,8,20,0.9)] backdrop-blur-sm border border-[rgba(126,184,255,0.25)] hover:border-[#C084FC] px-1.5 py-0.5 rounded-full font-mono text-[8px] text-[#7EB8FF] transition-all hover:scale-110 cursor-pointer shadow-[0_0_10px_rgba(8,8,20,0.5)]"
                            style={{ left: posX, top: posY }}
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-[#C084FC]" />
                            <span className="text-white font-medium">{item.name}</span>
                            <span className="text-[#C084FC] text-[7px]">[{item.spectralClass}]</span>
                        </button>
                    );
                }

                // Near LOD or Selected: Full Rich HUD Glass Card
                return (
                    <button
                        key={item.id}
                        onClick={() => {
                            audioEngine.playUiClick();
                            onSelectStar(item.star);
                        }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto flex flex-col items-center p-2 rounded-xl backdrop-blur-md font-mono text-[9px] transition-all duration-150 cursor-pointer ${item.isSelected ? 'bg-[rgba(16,16,36,0.9)] border-2 border-[#C084FC] shadow-[0_0_25px_rgba(192,132,252,0.4)] scale-105 z-20' : 'bg-[rgba(8,8,20,0.75)] border border-[rgba(126,184,255,0.3)] hover:border-[#7EB8FF] shadow-[0_0_15px_rgba(8,8,20,0.7)] hover:scale-105 z-10'}`}
                        style={{ left: posX, top: posY }}
                    >
                        <div className="flex items-center gap-1.5 text-white font-bold">
                            <span className="w-2 h-2 rounded-full bg-[#C084FC] animate-pulse" />
                            <span>{item.name}</span>
                            <span className="text-[#7EB8FF] text-[8px]">[{item.spectralClass}]</span>
                        </div>
                        <div className="text-[#7EB8FF]/80 text-[8px] mt-0.5 flex items-center gap-1.5">
                            <span>{item.distanceFormatted}</span>
                            <span>•</span>
                            <span>{item.star.mass.toFixed(1)} M☉</span>
                        </div>
                    </button>
                );
            })}
        </div>
    );
};
