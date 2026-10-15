/**
 * ActionLog.ts — typed event bus + ordered action log for the simulation.
 *
 * Phase A of the spawn-system build. Every gameplay-relevant occurrence
 * (spawns, collisions, merges, detonations, black-hole drops, supernovas,
 * phase transitions) is recorded here as a JSON-serializable event. This log
 * is the future save-file and marketplace payload, so payloads must stay
 * plain data — no class instances, no functions, no circular refs.
 *
 * Determinism: eventId is a per-log monotonic counter (1, 2, 3, …). No
 * Math.random, no UUIDs, no wall-clock in ids. A caller that replays the same
 * call sequence gets the same ids. clearLog() resets the counter so a fresh
 * run replays identically.
 */

/** Simulation event types. A string union so new types are cheap to add. */
export type SimulationEventType =
    | 'SPAWN'
    | 'COLLISION'
    | 'MERGE'
    | 'DETONATE'
    | 'BH_DROP'
    | 'SUPERNOVA'
    | 'PHASE_TRANSITION';

export interface Vec3Like {
    x: number;
    y: number;
    z: number;
}

/** JSON-serializable payload carried by every event. */
export interface SimulationEventPayload {
    cosmicAge: number;
    wallTimestamp: number;
    actorId?: string;
    targetIds?: string[];
    masses?: number[];
    positions?: Vec3Like[];
    note?: string;
}

/**
 * What producers hand to the log (or what arrives over the worker channel).
 * No eventId — the log assigns it, so there is exactly one monotonic counter
 * even when events originate on both the worker and the main thread.
 * `seq` is an optional producer-local sequence number (the n-body worker
 * stamps it) so tests can assert worker→main ordering.
 */
export interface SimulationEventInput extends SimulationEventPayload {
    type: SimulationEventType;
    seq?: number;
}

/** A stored event: the input plus its monotonic id. */
export interface SimulationEvent extends SimulationEventPayload {
    type: SimulationEventType;
    eventId: number;
}

export type ActionLogListener = (event: SimulationEvent) => void;

export class ActionLog {
    private events: SimulationEvent[] = [];
    private listeners = new Set<ActionLogListener>();
    private nextId = 1;

    /** Append an event, assign its monotonic eventId, notify subscribers. */
    logEvent(type: SimulationEventType, payload: SimulationEventPayload): SimulationEvent {
        const event: SimulationEvent = { ...payload, type, eventId: this.nextId++ };
        this.events.push(event);
        // Snapshot the listener set: a listener that unsubscribes mid-dispatch
        // must not skip or double-notify its neighbours.
        for (const listener of [...this.listeners]) {
            listener(event);
        }
        return event;
    }

    /** Subscribe to future events. Returns an unsubscribe function. */
    subscribe(listener: ActionLogListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /** All events in insertion order (a copy — mutating it cannot corrupt the log). */
    getLog(): SimulationEvent[] {
        return [...this.events];
    }

    /** Clear the log and reset the id counter for a deterministic fresh run. */
    clearLog(): void {
        this.events = [];
        this.nextId = 1;
    }

    get size(): number {
        return this.events.length;
    }
}

/** Shared singleton fed by the spawn system, the phase bridge, and SIM_EVENTs. */
export const actionLog = new ActionLog();

/**
 * Shared worker→main ingestion path (used by the useSimulation hook AND by
 * tests — not a test hack, the real path). Stamps the main-thread cosmic age
 * onto a worker-produced event and lands it in the log, preserving the
 * worker's arrival order. Never throws on malformed input: a bad event is
 * dropped with a warning, never allowed to break the tick loop.
 */
export function ingestWorkerEvent(
    log: ActionLog,
    event: SimulationEventInput,
    cosmicAge: number
): SimulationEvent | null {
    if (!event || typeof event.type !== 'string') {
        console.warn('[action-log] SIM_EVENT dropped: malformed event', event);
        return null;
    }
    // Rebuilt field-by-field: producer-local metadata (e.g. worker `seq`)
    // must not leak into stored payloads.
    return log.logEvent(event.type, {
        cosmicAge,
        wallTimestamp: Number.isFinite(event.wallTimestamp) ? event.wallTimestamp : Date.now(),
        actorId: event.actorId,
        targetIds: event.targetIds ? [...event.targetIds] : undefined,
        masses: event.masses ? [...event.masses] : undefined,
        positions: event.positions ? event.positions.map((p) => ({ ...p })) : undefined,
        note: event.note,
    });
}
