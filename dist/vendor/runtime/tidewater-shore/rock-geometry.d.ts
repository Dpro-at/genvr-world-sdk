/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { BufferGeometry } from 'three';
export interface RockStyle {
    name: string;
    scale: readonly [number, number, number];
    planes: number;
    cut: readonly [number, number];
    soft: number;
    rough: number;
}
export declare const ROCK_STYLES: readonly RockStyle[];
export declare function buildRockGeometry(styleIndex: number, seed: number, subdiv: number): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
