/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { BufferGeometry, Mesh, Vector3, type Material, type Object3D } from 'three';
import { type WildlifeMaterialFactory, type WildlifeMaterialOptions } from './kit.js';
export interface GullsOptions {
    scene: {
        add(o: Object3D): unknown;
    };
    count?: number;
    center?: Vector3;
    spread?: number;
    seed?: number;
    material?: WildlifeMaterialFactory;
}
export declare class Gulls {
    materialOptions: WildlifeMaterialOptions;
    material: Material;
    mesh: Mesh;
    constructor({ scene, count, center, spread, seed, material }: GullsOptions);
}
export declare function gullGeometry(): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
