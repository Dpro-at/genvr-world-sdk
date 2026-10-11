/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { BufferGeometry } from 'three';
type ComponentType = 5120 | 5121 | 5122 | 5123 | 5125 | 5126;
export interface GlbJson {
    extensionsRequired?: string[];
    accessors: {
        type: keyof typeof COMPONENTS;
        componentType: ComponentType;
        count: number;
        bufferView?: number;
        byteOffset?: number;
        normalized?: boolean;
    }[];
    bufferViews: {
        buffer: number;
        byteOffset?: number;
        byteStride?: number;
    }[];
    nodes: {
        name?: string;
        mesh?: number;
        matrix?: number[];
        translation?: [number, number, number];
        rotation?: [number, number, number, number];
        scale?: [number, number, number];
        children?: number[];
    }[];
    meshes: {
        name?: string;
        primitives: {
            mode?: number;
            attributes: {
                POSITION?: number;
                NORMAL?: number;
                TEXCOORD_0?: number;
            };
            indices?: number;
        }[];
    }[];
    scenes?: {
        nodes: number[];
    }[];
    scene?: number;
}
export interface GlbMesh {
    name: string;
    geometry: BufferGeometry;
}
declare const COMPONENTS: {
    SCALAR: number;
    VEC2: number;
    VEC3: number;
    VEC4: number;
    MAT4: number;
};
export declare function parseGLB(buffer: ArrayBuffer): {
    meshes: GlbMesh[];
    json: GlbJson;
};
export {};
