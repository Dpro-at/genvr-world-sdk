/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { BufferGeometry } from 'three';
export declare function rayGeometry({ lod, eagle }?: {
    lod?: number;
    eagle?: boolean;
}): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
export declare function turtleGeometry({ lod }?: {
    lod?: number;
}): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
