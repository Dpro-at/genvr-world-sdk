/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Vector3, type BufferGeometry } from 'three';
export declare const PROP: {
    position: Vector3;
    radius: number;
    blades: number;
    pitch: number;
};
export declare const RUDDER: {
    pivot: Vector3;
    top: number;
    bottom: number;
    lead: number;
    trail: number;
    maxAngle: number;
};
export declare function propellerGeometry(): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
export declare function rudderGeometry(): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
