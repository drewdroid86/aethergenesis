/**
 * Clear-screen ("HUD hide/show") visibility persistence.
 *
 * The single `hudVisible` boolean owns ONLY whether the HUD layers are
 * shown; every panel keeps its own collapse/open state internally, so
 * hiding never resets per-panel state. Persistence is a plain localStorage
 * string so a bad/stale value can never crash startup — unreadable values
 * fall back to visible.
 */

export const HUD_VISIBILITY_KEY = 'aethergenesis.hudVisible';

/** Minimal storage surface so tests can inject a stub (no DOM needed). */
export interface HudVisibilityStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

function defaultStorage(): HudVisibilityStorage | null {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage;
        }
    } catch {
        // Storage blocked (SSR, private mode): caller falls back to memory.
    }
    return null;
}

/** Read the persisted HUD visibility. Defaults to `true` (HUD shown). */
export function readHudVisible(
    storage: HudVisibilityStorage | null = defaultStorage()
): boolean {
    try {
        const raw = storage?.getItem(HUD_VISIBILITY_KEY);
        if (raw == null) return true;
        if (raw === 'true') return true;
        if (raw === 'false') return false;
        return true;
    } catch {
        return true;
    }
}

/** Persist the HUD visibility. Silently no-ops when storage is blocked. */
export function persistHudVisible(
    value: boolean,
    storage: HudVisibilityStorage | null = defaultStorage()
): void {
    try {
        storage?.setItem(HUD_VISIBILITY_KEY, value ? 'true' : 'false');
    } catch {
        // Private-mode / blocked storage: HUD state simply stays in memory.
    }
}
