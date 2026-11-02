/** Set a star's effective age and the cosmic-time anchor that produces it. */
export function setStellarAge(
    star: { lifespanReal: number; currentRealAge: number; t: number; birthAge: number },
    ageMyr: number,
    cosmicAgeGyr: number,
    gravity: number,
): void {
    if (!(star.lifespanReal > 0) || !Number.isFinite(ageMyr)) return;
    star.currentRealAge = Math.max(0, ageMyr);
    star.t = star.currentRealAge / star.lifespanReal;
    star.birthAge = cosmicAgeGyr - star.currentRealAge / (1000 * Math.max(0.01, gravity));
}
