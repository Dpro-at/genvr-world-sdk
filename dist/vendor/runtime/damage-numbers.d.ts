import { Group } from 'three/webgpu';
/** How long a damage number shows, how far it rises, and when it starts to fade (P9-12). */
export declare const DAMAGE_NUMBER: {
    readonly seconds: 0.8;
    readonly rise: 0.6;
    readonly fadeFrom: 0.5;
    readonly height: 0.3;
};
/**
 * Damage numbers over hit players (P9-12): "-25" rises from the head and fades in under a second.
 * Each text's picture is made once; sprites are reused, so a hit makes nothing new after the first
 * few.
 */
export declare class DamageNumbers {
    #private;
    readonly group: Group<import("three/webgpu").Object3DEventMap>;
    constructor();
    get count(): number;
    /** Shows `-damage` with its bottom at `at` (above the victim's head). */
    show(at: {
        x: number;
        y: number;
        z: number;
    }, damage: number): void;
    update(dt: number): void;
    dispose(): void;
}
