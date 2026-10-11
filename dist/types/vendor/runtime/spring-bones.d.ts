import { type Skeleton } from 'three/webgpu';
/**
 * Swinging hair, coat panels, and tassels (P2-35 warrior): chains of bones that the clips never
 * key, moved each frame like the VRM spring bones. Every joint keeps the world point of its
 * child (the tail) with its last speed; each step the tail keeps some of that speed (drag), is
 * pulled back toward the rest shape the parent gives it (stiffness) and down (gravity), stays at
 * the bone's length, and is pushed out of the body's spheres (colliders: head, back, thighs), so
 * a thigh lifts the coat instead of passing through it. Then the bone turns to point at its tail.
 * Cheap: a few vector operations per joint, fine on phones.
 */
export interface SpringChainSetup {
    /** Joint names, root first; the last one is the tip (its position only). */
    readonly joints: readonly string[];
    readonly stiffness: number;
    readonly drag: number;
    /** Share of the body's motion the chain does not follow each step (air: hair trails when running). */
    readonly air?: number;
    readonly gravity: number;
    readonly radius: number;
    /** Degrees a joint may turn away from its rest direction (none: no limit). */
    readonly maxAngle?: number;
}
export interface SpringColliderSetup {
    readonly joint: string;
    readonly offset: readonly [number, number, number];
    readonly radius: number;
}
export declare class SpringBones {
    #private;
    constructor(skeleton: Skeleton, chains: readonly SpringChainSetup[], colliders: readonly SpringColliderSetup[], nodeName: (joint: string) => string);
    get chainCount(): number;
    /** Puts every chain back in its rest shape (the next update starts from there). */
    reset(): void;
    /** Call after the clips have posed the skeleton this frame. */
    update(delta: number): void;
}
