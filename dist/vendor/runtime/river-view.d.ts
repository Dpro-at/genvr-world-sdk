import type { WorldDocument } from '../contracts/index.js';
import { type RiverProfile, type RiverSample } from '../world/index.js';
import { BufferGeometry, Group, type Texture } from 'three/webgpu';
/** How much of the flow a swimmer or a floating item takes on. Below 1 because a body in water is
 * dragged along, not welded to it: on calm water this leaves a swimmer able to work upstream. */
export declare const FLOW_DRAG = 0.3;
/**
 * The ribbon: a strip of quads along the centerline, its vertices at the water surface. Each one
 * carries how deep the water is beneath it, how much foam belongs there, and how far along the
 * river it sits, so the shader can scroll the flow lines downstream.
 */
export declare function riverGeometry(samples: readonly RiverSample[]): BufferGeometry;
/** Where the spray of every waterfall in a river lands, and how wide each fall is. */
export declare function sprayPoints(samples: readonly RiverSample[]): Array<{
    x: number;
    y: number;
    z: number;
    width: number;
}>;
/** Draws a place's rivers and keeps their profiles for the current in the water. */
export declare class RiverView {
    #private;
    private readonly heightAt;
    readonly group: Group<import("three/webgpu").Object3DEventMap>;
    constructor(heightAt: (x: number, z: number) => number, color: number, caustics: Texture);
    /** The profiles behind the drawn rivers, for `riverFlowAt`. */
    get profiles(): readonly RiverProfile[];
    setLook(color: number): void;
    setClarity(meters: number, doc: WorldDocument): void;
    /** How many specks each waterfall throws up (the graphics setting, P2-39). */
    setSpray(count: number, doc: WorldDocument): void;
    /** Rivers refract unless the device cannot afford it (the same switch the lakes use). */
    setRefraction(on: boolean, doc: WorldDocument): void;
    /** The real caustics picture, once it has loaded. */
    setCaustics(texture: Texture, doc: WorldDocument): void;
    sync(doc: WorldDocument): void;
    /** The ground changed: the profiles follow the new terrain, so everything is drawn again. */
    groundChanged(doc: WorldDocument): void;
    dispose(): void;
}
