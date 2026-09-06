import React, { ReactNode } from 'react';

export interface BottomHudProps {
    left?: ReactNode;
    center?: ReactNode;
    right?: ReactNode;
    className?: string;
}

/**
 * BottomHud provides a responsive flex container for bottom HUD telemetry and controls.
 * - Mobile (< md): Stacks left, center, and right nodes vertically into 3 distinct rows with zero overlap.
 * - Desktop (md+): Lays out nodes horizontally 3-across (left-aligned, centered, right-aligned)
 *   matching the HUD cockpit instrumentation layout.
 */
export const BottomHud: React.FC<BottomHudProps> = ({
    left,
    center,
    right,
    className = '',
}) => {
    return (
        <div
            className={`absolute bottom-0 w-full pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-[max(2rem,env(safe-area-inset-bottom))] px-4 md:px-8 flex flex-col md:flex-row md:items-end md:justify-between gap-2.5 md:gap-3 z-20 pointer-events-none ${className}`.trim()}
        >
            {left != null && left !== false ? (
                <div className="w-full md:w-auto flex justify-center md:justify-start md:flex-1 items-end">
                    {left}
                </div>
            ) : (
                <div className="hidden md:flex md:flex-1" aria-hidden="true" />
            )}

            {center != null && center !== false ? (
                <div className="w-full md:w-auto flex justify-center md:flex-initial items-end">
                    {center}
                </div>
            ) : null}

            {right != null && right !== false ? (
                <div className="w-full md:w-auto flex justify-center md:justify-end md:flex-1 items-end">
                    {right}
                </div>
            ) : (
                <div className="hidden md:flex md:flex-1" aria-hidden="true" />
            )}
        </div>
    );
};

export default BottomHud;
