import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Compass } from 'lucide-react';

interface GalacticCompassGimbalProps {
    camera: THREE.PerspectiveCamera | null;
    headingDeg: number;
    pitchDeg: number;
}

export const GalacticCompassGimbal: React.FC<GalacticCompassGimbalProps> = ({
    camera,
    headingDeg,
    pitchDeg,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Draw a high-precision 3D orientation gimbal on a small 2D canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !camera) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        const cx = width / 2;
        const cy = height / 2;
        const radius = width * 0.38;

        ctx.clearRect(0, 0, width, height);

        // Get Camera Rotation Matrix to project 3D basis axes (X: Red/East, Y: Green/Up, Z: Blue/Core)
        const rotMatrix = new THREE.Matrix4();
        rotMatrix.extractRotation(camera.matrixWorldInverse);

        const projectAxis = (x: number, y: number, z: number) => {
            const v = new THREE.Vector3(x, y, z).applyMatrix4(rotMatrix);
            return {
                x: cx + v.x * radius,
                y: cy - v.y * radius,
                z: v.z
            };
        };

        const origin = { x: cx, y: cy };
        const axisX = projectAxis(1, 0, 0);
        const axisY = projectAxis(0, 1, 0);
        const axisZ = projectAxis(0, 0, 1);

        // Draw Outer Horizon Ring
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(126, 184, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw Axes with depth sorting (Z-buffer)
        const axes = [
            { name: 'X', end: axisX, color: '#f87171', label: 'E' }, // Galactic East
            { name: 'Y', end: axisY, color: '#4ade80', label: 'UP' }, // Ecliptic Normal
            { name: 'Z', end: axisZ, color: '#60a5fa', label: 'CORE' }, // Galactic Core
        ];

        // Draw Axis Lines
        axes.forEach(axis => {
            ctx.beginPath();
            ctx.moveTo(origin.x, origin.y);
            ctx.lineTo(axis.end.x, axis.end.y);
            ctx.strokeStyle = axis.color;
            ctx.lineWidth = axis.end.z > 0 ? 2 : 1;
            ctx.setLineDash(axis.end.z > 0 ? [] : [2, 2]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Axis Tip Dot
            ctx.beginPath();
            ctx.arc(axis.end.x, axis.end.y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = axis.color;
            ctx.fill();

            // Axis Text Label
            ctx.font = '8px monospace';
            ctx.fillStyle = axis.end.z > 0 ? '#ffffff' : 'rgba(255,255,255,0.4)';
            ctx.fillText(axis.label, axis.end.x + 3, axis.end.y + 3);
        });

        // Center Origin Dot
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#C084FC';
        ctx.fill();
    }, [camera, headingDeg, pitchDeg]);

    return (
        <div 
            className="flex items-center gap-3 bg-[rgba(8,8,20,0.7)] backdrop-blur-xl border border-[rgba(126,184,255,0.2)] px-3 py-2 rounded-2xl shadow-[0_0_20px_rgba(8,8,20,0.8)] pointer-events-auto select-none group/gimbal"
            role="region"
            aria-label="3D Orientation Gimbal and Heading"
        >
            <canvas 
                ref={canvasRef} 
                width={56} 
                height={56} 
                className="w-14 h-14"
                title="3D Galactic Coordinate Gimbal (X: East, Y: Ecliptic Up, Z: Galactic Core)"
            />

            <div className="flex flex-col font-mono text-[9px]">
                <div className="flex items-center gap-1 text-[#C084FC] font-bold uppercase tracking-wider">
                    <Compass size={11} className="text-[#C084FC]" />
                    <span>GALACTIC NORTH</span>
                </div>
                <div className="text-white text-[11px] font-bold mt-0.5">
                    HDG {headingDeg.toString().padStart(3, '0')}°
                </div>
                <div className="text-[#7EB8FF]/70 text-[8px]">
                    Pitch {pitchDeg >= 0 ? `+${pitchDeg}` : pitchDeg}°
                </div>
            </div>
        </div>
    );
};
