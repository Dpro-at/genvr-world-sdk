import { Group, type Scene } from 'three/webgpu';
/**
 * Debug view of the world checks (P2-11, owner note): red boxes around items that break a rule
 * or another check, shown while the builder asks for them in the studio's Checks tab.
 */
export declare class RuleMarkers {
    readonly group: Group<import("three/webgpu").Object3DEventMap>;
    constructor(scene: Scene);
    /** Replaces the markers with one box per entry (world-space bounds). */
    show(boxes: ReadonlyArray<{
        min: readonly number[];
        max: readonly number[];
    }>): void;
    clear(): void;
    dispose(): void;
}
