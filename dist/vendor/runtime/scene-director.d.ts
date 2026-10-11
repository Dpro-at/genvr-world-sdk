export type SceneMotion = 'dance' | 'bob' | 'spin' | 'sway';
export interface ScenePose {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch?: number;
    roll?: number;
}
/** A filming-only pose overlay. It never invokes native sit toggles or owns gameplay state. */
export declare class SceneAnimationLayer {
    #private;
    get active(): boolean;
    start(clip: string, duration: number | null): void;
    stop(): void;
    update(dt: number): void;
    resolve(gameplay: string, rider: string | null): string;
}
/** Generic object choreography; this does not claim skeletal retargeting for incompatible rigs. */
export declare function scenePose(base: ScenePose, motion: SceneMotion, time: number): ScenePose;
/**
 * Where an object stands `time` seconds into a walk along its spots (FILM-10b): it goes from `start` through each
 * spot in order at `speed` metres a second, turned the way it goes, kept `lift` metres above the ground under it,
 * and stays on the last spot afterwards.
 */
export declare function travelPose(start: ScenePose, spots: ReadonlyArray<{
    x: number;
    z: number;
}>, speed: number, time: number, groundAt: (x: number, z: number) => number, lift: number): ScenePose;
