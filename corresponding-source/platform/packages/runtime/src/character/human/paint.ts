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

export const MUSCLE_PAINT_FORMAT = 'genvr-muscle-paint/1';

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

export const emptyPaint = (): MusclePaint => ({ format: MUSCLE_PAINT_FORMAT, strokes: [] });

/** The painted state of one vertex: weight per part, and how strongly it was erased. */
export interface VertexPaint {
  weights: Map<string, number>;
  erased: number;
}

const CELL = 4; // cm, spatial grid cell

/**
 * Applies every stroke, in order, to the vertices (cm positions and unit normals): a soft round brush (full in the
 * middle, nothing at the radius) on skin facing the same way as the painted point (so a brush never paints through
 * an arm to the other side). Painting a part fades the other parts under it; erasing fades them all.
 */
export function rasterizePaint(
  paint: MusclePaint,
  count: number,
  position: (v: number) => readonly [number, number, number],
  normal: (v: number) => readonly [number, number, number],
): Map<number, VertexPaint> {
  const raster = createPaintRaster(count, position, normal);
  for (const stroke of paint.strokes) raster.stroke(stroke);
  return raster.painted;
}

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

export function createPaintRaster(
  count: number,
  position: (v: number) => readonly [number, number, number],
  normal: (v: number) => readonly [number, number, number],
): PaintRaster {
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
  for (let v = 0; v < count; v += 1) {
    const [x, y, z] = position(v);
    const k = key(x, y, z);
    const list = grid.get(k);
    if (list) list.push(v);
    else grid.set(k, [v]);
  }
  const painted = new Map<number, VertexPaint>();
  const dab = (part: string | null, strength: number, radius: number, p: readonly number[], touched?: Set<number>) => {
    const reach = Math.ceil(radius / CELL);
    const [cx, cy, cz] = [Math.floor(p[0]! / CELL), Math.floor(p[1]! / CELL), Math.floor(p[2]! / CELL)];
    for (let i = -reach; i <= reach; i += 1)
      for (let j = -reach; j <= reach; j += 1)
        for (let k = -reach; k <= reach; k += 1) {
          for (const v of grid.get(`${cx + i},${cy + j},${cz + k}`) ?? []) {
            const [x, y, z] = position(v);
            const d = Math.hypot(x - p[0]!, y - p[1]!, z - p[2]!) / radius;
            if (d >= 1) continue;
            const n = normal(v);
            if (n[0] * p[3]! + n[1] * p[4]! + n[2] * p[5]! < 0.2) continue;
            const w = strength * (1 - d * d) ** 2;
            touched?.add(v);
            let state = painted.get(v);
            if (!state) painted.set(v, (state = { weights: new Map(), erased: 0 }));
            for (const [other, value] of state.weights) if (other !== part) state.weights.set(other, value * (1 - w));
            if (part) {
              state.weights.set(part, Math.max(state.weights.get(part) ?? 0, w));
              state.erased *= 1 - w;
            } else state.erased = Math.max(state.erased, w);
          }
        }
  };
  const point = (stroke: PaintStroke, p: readonly number[], touched?: Set<number>) => {
    const radius = Math.max(0.2, stroke.radius);
    const strength = Math.min(1, Math.max(0, stroke.strength));
    dab(stroke.part, strength, radius, p, touched);
    if (stroke.mirror) dab(stroke.part, strength, radius, [-p[0]!, p[1]!, p[2]!, -p[3]!, p[4]!, p[5]!], touched);
  };
  return {
    painted,
    point,
    stroke(stroke, touched) {
      for (const p of stroke.points) point(stroke, p, touched);
    },
    reset() {
      painted.clear();
    },
  };
}

/** The part a painted vertex shows (the strongest weight), or null when erased or too faint to count. */
export function paintedPart(state: VertexPaint | undefined): { part: string | null; weight: number } | undefined {
  if (!state) return undefined;
  let best: string | null = null;
  let weight = 0;
  for (const [part, value] of state.weights) if (value > weight) [best, weight] = [part, value];
  if (state.erased > 0.5 && state.erased > weight) return { part: null, weight: state.erased };
  return weight > 0.05 ? { part: best, weight } : undefined;
}
