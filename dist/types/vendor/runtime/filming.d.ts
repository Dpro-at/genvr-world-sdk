import { FilmCamera, type FilmCommand, type FilmView, type FilmWaypoint } from '../contracts/index.js';
import { PerspectiveCamera, Vector3 } from 'three/webgpu';
export declare const FILM_PRESETS: {
    readonly static: {
        readonly responsiveness: 30;
        readonly shake: 0;
    };
    readonly handheld: {
        readonly responsiveness: 6;
        readonly shake: 0.025;
    };
    readonly running: {
        readonly responsiveness: 3;
        readonly shake: 0.09;
    };
    readonly drone: {
        readonly responsiveness: 2;
        readonly shake: 0;
    };
    readonly follow: {
        readonly responsiveness: 5;
        readonly shake: 0;
    };
    readonly side: {
        readonly responsiveness: 5;
        readonly shake: 0;
    };
    readonly orbit: {
        readonly responsiveness: 4;
        readonly shake: 0;
    };
};
/** Where the camera is, what it looks at and its lens `time` seconds into a flight. */
export declare function sampleFilmPath(path: readonly FilmWaypoint[], time: number): {
    position: Vector3;
    target: Vector3;
    fov: number | undefined;
};
/** A reusable filming rig; the runtime calls update after its gameplay camera. */
export declare class FilmRig {
    #private;
    settings: FilmCamera | null;
    view: FilmView | null;
    set(raw: unknown): FilmCamera;
    reset(): void;
    consumeCut(): boolean;
    update(camera: PerspectiveCamera, dt: number, player: {
        x: number;
        y: number;
        z: number;
    }): void;
}
/** Browser capture encodes the runtime's own canvas, without HTML UI. Silent video for v1. */
export declare function captureFilm(canvas: HTMLCanvasElement, command: Extract<FilmCommand, {
    kind: 'photo' | 'video';
}>, signal: AbortSignal, subscribe: (draw: () => void) => () => void, onStart?: () => void, 
/** Seconds recorded so far (video only), about four times a second. */
onProgress?: (seconds: number) => void, 
/** Sound recorded with the picture (FILM-08: the world's mix); silent video when absent. */
sound?: MediaStream | null, 
/** Finish normally and retain the take; cancellation still discards it. */
finish?: AbortSignal): Promise<Blob>;
/** A normal End scene is different from cancelling/discarding a capture. */
export declare function recordingWindow(ms: number, cancel: AbortSignal, finish?: AbortSignal): Promise<void>;
