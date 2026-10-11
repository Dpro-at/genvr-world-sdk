import type { ShoreField } from './shore-field.js';
/** Stations and timing (SoundScape.js L122, L873-925). */
export declare const SURF: {
    readonly stations: 9;
    /** m between stations */
    readonly gap: 11;
    /** m of transect out to sea per station */
    readonly transect: 110;
    /** the stations are rebuilt when the listener moved this far (m) */
    readonly rebuild: 12;
    /** events are scheduled this far ahead (s) */
    readonly lookAhead: 0.2;
    /** stations further than this from the listener are silent (m) */
    readonly hearing: 160;
    readonly crashHearing: 150;
    readonly washHearing: 70;
    readonly backHearing: 60;
    /** waves smaller than this (offshore amplitude, m) do not crash audibly */
    readonly minCrash: 0.06;
};
/** Target loudness (LUFS, momentary) in the reference situation (SoundScape.js MIX L54-57). */
export declare const SURF_MIX: {
    /** a wave breaking 10 m away (average wave; +-6 dB with its height) */
    readonly crash: -15;
    /** the bore running up the sand, 5 m away */
    readonly wash: -20;
    /** the swash draining back down, 5 m away */
    readonly backwash: -23;
    /** distant roar at 50 m from the shore */
    readonly surfFar: -31;
};
/** Simultaneous voices per kind; the oldest fades out beyond (SoundScape.js LIMITS). */
export declare const SURF_LIMITS: {
    readonly crash: 7;
    readonly wash: 5;
    readonly backwash: 5;
};
/** The surf sprites: slices [start s, duration s] and each slice's loudness (soundBank.js). */
export declare const SURF_BANK: {
    readonly surf_crash: {
        readonly slices: readonly [readonly [0.08, 3.254], readonly [3.414, 2.504], readonly [5.998, 2.554], readonly [8.632, 1.304], readonly [10.016, 2.804], readonly [12.9, 2.204], readonly [15.184, 2.7493]];
        readonly lufs: readonly [-13, -13.4, -14.1, -17, -13, -14, -12.7];
    };
    readonly surf_wash: {
        readonly slices: readonly [readonly [0.08, 1.404], readonly [1.564, 2.054], readonly [3.698, 1.504], readonly [5.282, 1.354], readonly [6.716, 1.904], readonly [8.7, 1.154]];
        readonly lufs: readonly [-12.4, -11.3, -16.5, -13.7, -14.5, -22.3];
    };
    readonly surf_backwash: {
        readonly slices: readonly [readonly [0.08, 1.804], readonly [1.964, 1.904], readonly [3.948, 3.804], readonly [7.832, 2.254], readonly [10.166, 2.394], readonly [12.64, 2.404]];
        readonly lufs: readonly [-13.1, -17.7, -22.1, -16.6, -14.4, -15.9];
    };
    readonly surf_far: {
        readonly loop: true;
        readonly lufs: -23;
    };
};
export type SurfKind = 'crash' | 'wash' | 'backwash';
export type SurfBank = 'surf_crash' | 'surf_wash' | 'surf_backwash';
/** Gain of a surf sound at `distance` m (Web Audio's inverse model); 0 beyond hearing. */
export declare function surfDistanceGain(distance: number, kind: SurfKind): number;
/** Linear gain of a slice played at a target loudness, times the distance gain. */
export declare function surfEventGain(targetLufs: number, bank: SurfBank, slice: number, distanceGain: number): number;
/** Air takes the highs away with distance: the low-pass on each event (Hz). */
export declare function surfAirLowpass(distance: number): number;
/** The distant-surf bed's gain at `distance` m from the waterline (the waves themselves are events). */
export declare function surfFarGain(distance: number): number;
/** Ogg Opus where the browser can play it, AAC (m4a) elsewhere (older Safari). */
export declare function surfFormat(canPlay: (type: string) => string): 'ogg' | 'm4a';
/** What the surf sound needs to know about the shore. */
export interface SurfShore {
    field: ShoreField;
    heightAt: (x: number, z: number) => number;
    level: number;
    /** Unit xz direction the swell travels in (the shader's along-shore axis is its normal). */
    swellDir: [number, number];
    period: number;
    /** Offshore amplitude (m). */
    amplitude: number;
}
/** The ground alone (no field yet): enough for the fake surf. */
export interface SurfGround {
    heightAt: (x: number, z: number) => number;
    level: number;
}
/** Along-shore position as the shader has it: on the swell's normal. */
export declare function surfAlong(x: number, z: number, swellDir: readonly [number, number]): number;
/** The shore field at (x, z): T, dir x exposure, Ts; bilinear between cell centres like `shoreFieldSample`. */
export declare function fieldAt(field: ShoreField, x: number, z: number, out: number[]): number[];
export interface SurfStation {
    x: number;
    z: number;
    /** local wave direction (unit, landward) */
    dx: number;
    dz: number;
    /** arrival time at the shoreline */
    Ts: number;
    exposure: number;
    /** per metre out to sea: depth, arrival time, along-shore position */
    depth: Float32Array;
    T: Float32Array;
    along: Float32Array;
    last: Record<SurfKind, number>;
    /** events before this shore time are not this station's (it was just built) */
    since: number;
}
/** A row of stations along the waterline near the listener, each with its transect out to sea. */
export declare function buildSurfStations(shore: SurfShore, lx: number, lz: number): SurfStation[];
/** One sound to play. Times are on the shore clock; `delay` is from the `now` of the tick (>= 0). */
export interface SurfEvent {
    kind: SurfKind;
    /** the wave's index m (-1 for the fake surf) */
    wave: number;
    time: number;
    delay: number;
    x: number;
    y: number;
    z: number;
    /** the wave's travel direction there (landward unit xz) */
    dx: number;
    dz: number;
    station: number;
    stationX: number;
    stationZ: number;
    /** the wave's offshore amplitude (m) */
    amplitude: number;
    /** target loudness at the reference distance (LUFS) */
    loudness: number;
    rate: number;
    bank: SurfBank;
    slice: number;
    /** from the listener (m) and the gain for it (distance and level together) */
    distance: number;
    gain: number;
}
type Listener = {
    x: number;
    y: number;
    z: number;
};
/** The wave-by-wave surf scheduler (SoundScape.js _surf; _fakeSurf until the shore field is there). */
export declare class SurfScheduler {
    #private;
    private readonly rng;
    constructor(rng?: () => number);
    /** The shore field to listen to (null: none yet), and the ground for the fake surf meanwhile (null: no sea). */
    setShore(shore: SurfShore | null, ground?: SurfGround | null): void;
    get stations(): readonly SurfStation[];
    /** Distance (m, xz) from the last listener to the nearest waterline point known, Infinity when none. */
    shoreDistance: number;
    /** The nearest waterline point known (for the far bed), or null. */
    shorePoint: {
        x: number;
        z: number;
    } | null;
    /** The events due between `now` and `now + lookAhead` (shore clock, s) for a listener at `at`. */
    tick(now: number, at: Listener): SurfEvent[];
}
/**
 * The nearest waterline within 150 m (16 directions, 2 m steps): its point, the unit direction out to sea there,
 * and the distance. Null when there is no water (or no land) in reach.
 */
export declare function nearestWaterline(ground: SurfGround, x: number, z: number): {
    x: number;
    z: number;
    sx: number;
    sz: number;
    d: number;
} | null;
export {};
