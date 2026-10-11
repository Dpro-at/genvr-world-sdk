import type { WorldAudio } from '../audio.js';
import { SURF_BANK, SurfScheduler, type SurfEvent, type SurfGround, type SurfShore } from './surf-sound.js';
/** Where the sea sounds are served (the web app's public folder). */
export declare const SEA_AUDIO_BASE = "/audio/sea/";
export interface SurfLogEntry {
    kind: SurfEvent['kind'];
    wave: number;
    /** shore-clock time the event belongs to, and the audio-clock time it was started for */
    time: number;
    audioAt: number | null;
    distance: number;
    gain: number;
    played: boolean;
    /** true for the fake surf (no shore field yet) */
    fake: boolean;
}
type Point = {
    x: number;
    y: number;
    z: number;
};
export declare class SurfAudio {
    #private;
    private readonly audio;
    private readonly base;
    readonly scheduler: SurfScheduler;
    readonly log: SurfLogEntry[];
    constructor(audio: WorldAudio, base?: string, rng?: () => number);
    /** The file for a bank, in the format this browser plays. */
    url(bank: keyof typeof SURF_BANK): string;
    /** Every frame: the listener (the camera), the room time (ms) and the shore to listen to (null: none yet). */
    update(dt: number, listener: Point, roomMs: number, shore: SurfShore | null, ground: SurfGround | null): void;
}
export {};
