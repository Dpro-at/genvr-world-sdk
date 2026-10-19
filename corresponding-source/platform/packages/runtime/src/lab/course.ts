import { LabCourse, type LabObstacle } from '@genvr/contracts';

/**
 * Motion lab course geometry (MOTION-LAB L1): every obstacle as boxes (x, y, z in metres, y up, the course runs along +z
 * from the start line at z = 0). The same boxes draw the 3D view, make the colliders and let a run read the ground.
 */
export interface LabBox {
  /** The obstacle this box belongs to. */
  id: string;
  part: 'block' | 'ramp' | 'wall' | 'sill' | 'lintel' | 'landing' | 'take_off';
  min: [number, number, number];
  max: [number, number, number];
  /** A ramp's slope rises from `min` z to `max` z (the box is its outline). */
  slope?: boolean;
}

/** Seeded random numbers (mulberry32): the same seed gives the same numbers on every machine. */
export function labRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The first-version course of board M1: step, ramp up to a block, a 1 m gap, a low wall, a window, a street with a car. */
export function defaultLabCourse(): LabCourse {
  return LabCourse.parse({
    seed: 4127,
    obstacles: [
      { id: 'step-1', kind: 'step', z: 3 },
      { id: 'ramp-1', kind: 'ramp', z: 6, length: 3, rise: 0.8, top: 1 },
      { id: 'gap-1', kind: 'gap', z: 10, width: 1, height: 0.8, landing_depth: 1.2 },
      { id: 'low-wall-1', kind: 'low_wall', z: 15 },
      { id: 'window-1', kind: 'window', z: 18 },
    ],
    street: { z: 22, lanes: 2, lane_width: 3, crossing: true, light: { cycle_s: 30, red_s: 20 } },
    cars: [{ id: 'car-1', lane: 1, speed: 8, offset_s: 9, runs_red: false }],
    finish_z: 32,
  });
}

/** Boxes of one obstacle. */
export function obstacleBoxes(o: LabObstacle): LabBox[] {
  if (o.hidden) return [];
  const across = (w: number): [number, number] => [o.x - w / 2, o.x + w / 2];
  switch (o.kind) {
    case 'step': {
      const [x0, x1] = across(o.width);
      return [{ id: o.id, part: 'block', min: [x0, 0, o.z], max: [x1, o.height, o.z + o.depth] }];
    }
    case 'ramp': {
      const [x0, x1] = across(o.width);
      const out: LabBox[] = [{ id: o.id, part: 'ramp', min: [x0, 0, o.z], max: [x1, o.rise, o.z + o.length], slope: true }];
      if (o.top > 0) out.push({ id: o.id, part: 'block', min: [x0, 0, o.z + o.length], max: [x1, o.rise, o.z + o.length + o.top] });
      return out;
    }
    case 'gap': {
      const [x0, x1] = across(o.lane);
      const far = o.z + o.width, top = Math.max(0, o.height + o.landing);
      const out: LabBox[] = [];
      if (top > 0) out.push({ id: o.id, part: 'landing', min: [x0, 0, far], max: [x1, top, far + o.landing_depth] });
      return out;
    }
    case 'low_wall': {
      const [x0, x1] = across(o.width);
      return [{ id: o.id, part: 'wall', min: [x0, 0, o.z], max: [x1, o.height, o.z + o.thickness] }];
    }
    case 'window': {
      const [x0, x1] = across(o.wall_width);
      const [h0, h1] = across(o.opening_width);
      const z0 = o.z, z1 = o.z + o.thickness, top = Math.min(o.wall_height, o.sill + o.opening_height);
      return [
        { id: o.id, part: 'sill', min: [x0, 0, z0], max: [x1, o.sill, z1] },
        { id: o.id, part: 'wall', min: [x0, o.sill, z0], max: [h0, top, z1] },
        { id: o.id, part: 'wall', min: [h1, o.sill, z0], max: [x1, top, z1] },
        { id: o.id, part: 'lintel', min: [x0, top, z0], max: [x1, o.wall_height, z1] },
      ];
    }
  }
}

export function courseBoxes(course: LabCourse): LabBox[] {
  return course.obstacles.flatMap(obstacleBoxes);
}

/** A gap is a hole between its take-off edge (`z`) and its far edge; the take-off block is whatever stands before it. */
export function gapAt(course: LabCourse, x: number, z: number): LabObstacle | undefined {
  return course.obstacles.find((o) => o.kind === 'gap' && !o.hidden && z > o.z && z < o.z + o.width && Math.abs(x - o.x) <= o.lane / 2);
}

/** Ground height under a point (top of the highest box below it, a ramp's slope, 0 for the floor, −1 in a gap). */
export function groundAt(course: LabCourse, x: number, z: number, boxes = courseBoxes(course)): number {
  if (gapAt(course, x, z)) return -1;
  let h = 0;
  for (const b of boxes) {
    if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) continue;
    if (b.part === 'wall' || b.part === 'lintel') continue;
    const top = b.slope ? b.min[1] + ((z - b.min[2]) / (b.max[2] - b.min[2])) * (b.max[1] - b.min[1]) : b.max[1];
    h = Math.max(h, top);
  }
  return h;
}

/** Hardness 1–5 sets how big the obstacles are; the seed picks kinds, sizes and gaps between them (board M2). */
export function courseFromSeed(seed: number, count = 5, hardness = 2, street = true): LabCourse {
  const rnd = labRandom(seed);
  const k = (hardness - 1) / 4;
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
  const r = (lo: number, hi: number) => Math.round((lo + (hi - lo) * (k * 0.7 + rnd() * 0.3)) * 100) / 100;
  const obstacles: unknown[] = [];
  let z = 3;
  for (let i = 0; i < count; i++) {
    const kind = pick(['step', 'ramp', 'gap', 'low_wall', 'window'] as const);
    const id = `${kind.replace('_', '-')}-${i + 1}`;
    if (kind === 'step') { obstacles.push({ id, kind, z, height: r(0.15, 0.5), depth: 0.6 }); z += 3; }
    else if (kind === 'ramp') { const length = r(2, 5); obstacles.push({ id, kind, z, length, rise: r(0.3, 1.2), top: 1 }); z += length + 3; }
    else if (kind === 'gap') { const width = r(0.5, 2); obstacles.push({ id, kind, z, width, height: 0 }); z += width + 3; }
    else if (kind === 'low_wall') { obstacles.push({ id, kind, z, height: r(0.5, 1.2) }); z += 3; }
    else { obstacles.push({ id, kind, z, sill: r(0.5, 1.1), opening_height: r(1.2, 0.7) }); z += 3.5; }
  }
  const streetZ = Math.ceil(z + 1);
  return LabCourse.parse({
    seed,
    obstacles,
    street: street ? { z: streetZ, lanes: 2, lane_width: 3 } : null,
    cars: street ? [{ id: 'car-1', lane: 1, speed: r(5, 14), offset_s: Math.round(4 + rnd() * 10) }] : [],
    finish_z: Math.min(120, (street ? streetZ + 8 : z + 2)),
  });
}
