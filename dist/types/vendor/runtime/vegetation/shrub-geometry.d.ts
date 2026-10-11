/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import * as THREE from 'three';
import { GeoBuilder } from './geometry-builder.js';
import { type Lobe } from './forest-tree-geometry.js';
export declare const SHRUB_H = 1.6;
export declare const SHRUB_LOBES: readonly Lobe[];
export declare const SHRUB_VARIANTS = 2;
export declare function buildShrubNear(seed?: number, b?: GeoBuilder): {
    geometry: THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
    triangles: number;
};
export declare const LOBE_TABLE: Float32Array<ArrayBuffer>;
export declare function lobeVariantGeometry(geometry: THREE.BufferGeometry, table: ArrayLike<number>, offset: number): THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
export declare function buildCanopyNear(): {
    geometry: THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>;
    triangles: number;
    treeTriangles: number;
    shrubTriangles: number;
};
