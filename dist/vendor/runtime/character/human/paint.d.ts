/**
 * Muscle paint (owner, 2026-10-05): muscles are painted on the default boy with brush strokes - by a person in the
 * Studio character editor or by an agent writing strokes - and the bake turns the strokes into the muscle map.
 * Strokes live in body space (centimetres on the default boy, feet at y = 0, facing +z, his left +x), so they do not
 * depend on the mesh's vertex order: a finer mesh keeps every painted muscle.
 *
 * File `tooling/human-bake/muscle-paint.json`:
 * `{ "format": "genvr-muscle-paint/1", "strokes": [{ "part": "biceps", "radius": 2.5, "strength": 1,
 *    "mirror": true, "points": [[x, y, z, nx, ny, nz], ...] }] }` - `part` null erases (no muscle there).
 */
export declare const MUSCLE_PAINT_FORMAT = "genvr-muscle-paint/1";
/** One brush stroke: its points (cm and the skin normal there), brush radius (cm) and strength (0..1). */
export interface PaintStroke {
    /** The muscle part painted (muscles.ts PARTS), or null to erase. */
    part: string | null;
    radius: number;
    strength: number;
    /** Also paint the mirror image on his right side (x negated). */
    mirror?: boolean;
    /** Who painted it (an agent painter's name, e.g. `paint-arm`): a painter replaces only its own strokes. */
    by?: string;
    points: [number, number, number, number, number, number][];
}
export interface MusclePaint {
    format: typeof MUSCLE_PAINT_FORMAT;
    strokes: PaintStroke[];
}
export declare const emptyPaint: () => MusclePaint;
/** The painted state of one vertex: weight per part, and how strongly it was erased. */
export interface VertexPaint {
    weights: Map<string, number>;
    erased: number;
}
/**
 * Applies every stroke, in order, to the vertices (cm positions and unit normals): a soft round brush (full in the
 * middle, nothing at the radius) on skin facing the same way as the painted point (so a brush never paints through
 * an arm to the other side). Painting a part fades the other parts under it; erasing fades them all.
 */
export declare function rasterizePaint(paint: MusclePaint, count: number, position: (v: number) => readonly [number, number, number], normal: (v: number) => readonly [number, number, number]): Map<number, VertexPaint>;
/**
 * The same painting, kept live: the vertex grid is built once and new dabs are added on top of the painted state, so
 * a brush in the editor costs only the skin under it (the projected sheets hold ~80k dabs; repainting them all on
 * every mouse move froze the 111k-quad body for seconds). `touched` collects the vertices a call changed.
 */
export interface PaintRaster {
    painted: Map<number, VertexPaint>;
    /** One dab of a stroke, with its mirror image when the stroke mirrors. */
    point(stroke: PaintStroke, p: readonly number[], touched?: Set<number>): void;
    /** A whole stroke, in order. */
    stroke(stroke: PaintStroke, touched?: Set<number>): void;
    /** Forgets every dab (before painting all strokes again, e.g. after an undo). */
    reset(): void;
}
export declare function createPaintRaster(count: number, position: (v: number) => readonly [number, number, number], normal: (v: number) => readonly [number, number, number]): PaintRaster;
/** The part a painted vertex shows (the strongest weight), or null when erased or too faint to count. */
export declare function paintedPart(state: VertexPaint | undefined): {
    part: string | null;
    weight: number;
} | undefined;
