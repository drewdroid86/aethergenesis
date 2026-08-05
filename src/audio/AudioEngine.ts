/**
 * AudioEngine.ts — Native Web Audio API Cosmic Synthesizer
 * Provides zero-dependency procedural spatial soundscapes, ambient drones,
 * pulsar audio pulses, supernova bursts, and timeline UI feedback.
 */

export class CosmicAudioEngine {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private droneGain: GainNode | null = null;
    private osc1: OscillatorNode | null = null;
    private osc2: OscillatorNode | null = null;
    private filter: BiquadFilterNode | null = null;
    private lfo: OscillatorNode | null = null;
    private isMuted: boolean = false;
    private volume: number = 0.3;
    private initialized: boolean = false;

    constructor() {
        // AudioContext is initialized on first user gesture per WebAudio autoplay policy
    }

    public init(): void {
        if (this.initialized) return;
        try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioCtx) return;
            this.ctx = new AudioCtx();
            
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
            this.masterGain.connect(this.ctx.destination);

            // Ambient Cosmic Drone Setup
            this.droneGain = this.ctx.createGain();
            this.droneGain.gain.setValueAtTime(0.15, this.ctx.currentTime);

            this.filter = this.ctx.createBiquadFilter();
            this.filter.type = 'lowpass';
            this.filter.frequency.setValueAtTime(140, this.ctx.currentTime);

            this.osc1 = this.ctx.createOscillator();
            this.osc1.type = 'sine';
            this.osc1.frequency.setValueAtTime(55, this.ctx.currentTime); // A1 note

            this.osc2 = this.ctx.createOscillator();
            this.osc2.type = 'triangle';
            this.osc2.frequency.setValueAtTime(110.5, this.ctx.currentTime); // Slight detune A2

            // LFO for filter modulation
            this.lfo = this.ctx.createOscillator();
            this.lfo.frequency.setValueAtTime(0.1, this.ctx.currentTime); // 0.1 Hz breathing
            const lfoGain = this.ctx.createGain();
            lfoGain.gain.setValueAtTime(40, this.ctx.currentTime);
            
            this.lfo.connect(lfoGain);
            lfoGain.connect(this.filter.frequency);

            this.osc1.connect(this.filter);
            this.osc2.connect(this.filter);
            this.filter.connect(this.droneGain);
            this.droneGain.connect(this.masterGain);

            this.osc1.start();
            this.osc2.start();
            this.lfo.start();

            this.initialized = true;
        } catch {
            // Suppressed audio init failure (e.g. headless environment)
        }
    }

    public resume(): void {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
    }

    public setVolume(val: number): void {
        this.volume = Math.max(0, Math.min(1, val));
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
        }
    }

    public toggleMute(): boolean {
        this.isMuted = !this.isMuted;
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
        }
        return this.isMuted;
    }

    public playSupernovaSound(): void {
        if (!this.ctx || this.isMuted) return;
        this.resume();
        try {
            const now = this.ctx.currentTime;
            
            // Sub-bass noise blast
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(120, now);
            osc.frequency.exponentialRampToValueAtTime(30, now + 1.5);

            gain.gain.setValueAtTime(0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

            osc.connect(gain);
            gain.connect(this.masterGain!);
            osc.start(now);
            osc.stop(now + 1.8);
        } catch {
            // Suppressed audio playback error
        }
    }

    public playUiClick(): void {
        if (!this.ctx || this.isMuted) return;
        this.resume();
        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);

            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

            osc.connect(gain);
            gain.connect(this.masterGain!);
            osc.start(now);
            osc.stop(now + 0.05);
        } catch {
            // Suppressed audio playback error
        }
    }

    public dispose(): void {
        if (this.ctx) {
            this.ctx.close().catch(() => {});
            this.ctx = null;
        }
        this.initialized = false;
    }
}

export const audioEngine = new CosmicAudioEngine();
