import { BufferGeometry } from 'three/webgpu';
/**
 * Geometry builder of the sea-life generators (SEALIFE-01): indexed, smooth-shaded meshes with the attributes the
 * sea-life materials read (`sealife/material.ts`). Every vertex carries its own colours and pattern settings, so one
 * shared material draws every variant of a kind.
 */
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];
/** One surface point. */
export interface SeaPoint {
    p: Vec3;
    /** Base colour (linear 0-1 sRGB components; converted once by the builder). */
    color: Vec3;
    /** Colour of the back side (inside of a shell or a tube). */
    inner?: Vec3;
    /** Colour of spots/tubercles and how strongly they show (0-1). */
    spot?: Vec4;
    /** Spot frequency (1/m), line amount (0-1), roughness (0-1), bump strength (0-1). */
    pattern?: Vec4;
    /** Line coordinate: growth lines or bands fall on whole numbers. */
    line?: number;
    /** Animation data; its meaning is the material's (see `sealife/motion.ts`). */
    motion?: Vec4;
}
/** A hex colour such as '#e0662a' as 0-1 sRGB components. */
export declare function hex(color: string): Vec3;
export declare const mixColor: (a: Vec3, b: Vec3, t: number) => Vec3;
export declare const scaleColor: (a: Vec3, s: number) => Vec3;
export declare class SeaMesh {
    readonly position: number[];
    readonly color: number[];
    readonly inner: number[];
    readonly spot: number[];
    readonly pattern: number[];
    readonly uv: number[];
    readonly motion: number[];
    readonly index: number[];
    get vertexCount(): number;
    get triangleCount(): number;
    add(point: SeaPoint): number;
    tri(a: number, b: number, c: number): void;
    /** Two triangles a-b-c, a-c-d (counter-clockwise seen from the front). */
    quad(a: number, b: number, c: number, d: number): void;
    /** Quads between two rows of equal length; `wrap` closes the strip (last column joins the first). */
    stitch(rowA: readonly number[], rowB: readonly number[], wrap?: boolean, flip?: boolean): void;
    /** Triangles from one centre vertex to a row. */
    fan(center: number, row: readonly number[], wrap?: boolean, flip?: boolean): void;
    build(): BufferGeometry;
}
