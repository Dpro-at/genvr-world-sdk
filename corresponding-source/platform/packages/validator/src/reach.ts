import { SIZE_TIERS, type ItemInstance, type WorldDocument } from '@genvr/contracts';
import { insidePolygon, rotate, type Placed } from './geometry.js';
import type { WorldEnvironment, WorldFinding } from './world-checks.js';

/** Grid step of the walk check (meters); a door (1.2 m) always has a line of cells through it. */
const CELL = 0.5;
/** Largest grid; bigger built areas use a coarser step. */
const MAX_CELLS = 250_000;
/** Walkable ground kept around the built area (meters). */
const MARGIN = 6;
/** Highest step onto a floor or an item a player reaches by jumping (runtime: 7 m/s, gravity 22). */
const CLIMB = 1;
/** Step the character walks up without jumping (runtime autostep). */
const STEP = 0.4;
/** Steepest ground players walk up (the runtime character's 45°), as rise per run. */
const WALK_SLOPE = 1;
/** Room a player needs above the feet (meters). */
const HEAD = 1.7;
/** Kept from walls and items when passing: less than the body, so a door with its frame fits. */
const RADIUS = 0.15;
/** Two heights in one cell closer than this are the same place to stand. */
const SAME_LEVEL = 0.3;
/** Smallest closed-in area reported (square meters). */
const MIN_AREA = 4;
/** Bucket size for looking up obstacles (meters). */
const BUCKET = 4;
/** How far from a ladder's box players still hold on to it (the runtime's reach). */
const LADDER_REACH = 0.5;

/** Something solid a player cannot walk through: an item box or a wall block, turned about Y. */
interface Obstacle {
  cx: number;
  cz: number;
  /** Direction of the first half extent on the ground plane. */
  ux: number;
  uz: number;
  hu: number;
  hv: number;
  bottom: number;
  top: number;
}

const bucketKey = (bx: number, bz: number) => bx * 100_003 + bz;
const round = (value: number) => Math.round(value * 10) / 10;

function local(o: Obstacle, x: number, z: number): [number, number] {
  const dx = x - o.cx;
  const dz = z - o.cz;
  return [dx * o.ux + dz * o.uz, -dx * o.uz + dz * o.ux];
}

function contains(o: Obstacle, x: number, z: number, grow = 0): boolean {
  const [u, v] = local(o, x, z);
  return Math.abs(u) <= o.hu + grow && Math.abs(v) <= o.hv + grow;
}

/** Whether the straight path from a to b crosses the obstacle's footprint (grown by `grow`). */
function crosses(o: Obstacle, ax: number, az: number, bx: number, bz: number, grow: number): boolean {
  const [au, av] = local(o, ax, az);
  const [bu, bv] = local(o, bx, bz);
  let t0 = 0;
  let t1 = 1;
  for (const [start, delta, half] of [
    [au, bu - au, o.hu + grow],
    [av, bv - av, o.hv + grow],
  ] as const) {
    if (Math.abs(delta) < 1e-9) {
      if (Math.abs(start) > half) return false;
      continue;
    }
    let enter = (-half - start) / delta;
    let exit = (half - start) / delta;
    if (enter > exit) [enter, exit] = [exit, enter];
    t0 = Math.max(t0, enter);
    t1 = Math.min(t1, exit);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Reachability from the start point (P2-11): a walk over a grid of cells around everything built,
 * standing on the ground, water (players swim), room floors, and the tops of solid items, blocked
 * by item boxes and wall blocks (the same boxes the physics uses). Walking climbs ground up to the
 * character's slope, floors and items up to a jump, ladders up to their top (P2-23), and drops
 * down any height. Reports items that
 * are made to be used from the front (placement rule `clearFront`: benches, houses) and doors that
 * players cannot get to, and closed-in areas on the ground. Pure, like the other checks.
 */
export function checkReach(
  doc: WorldDocument,
  env: WorldEnvironment,
  placed: readonly Placed[],
  nameOf: (instance: ItemInstance) => string,
): WorldFinding[] {
  // Obstacles: what a player bumps into on each solid item (a tree's trunk, not its crown, which
  // players walk under) and wall blocks.
  const obstacles: Obstacle[] = [];
  for (const item of placed) {
    if (!item.solid) continue;
    const { min, max } = item.body;
    obstacles.push({
      cx: (min[0] + max[0]) / 2,
      cz: (min[2] + max[2]) / 2,
      ux: 1,
      uz: 0,
      hu: (max[0] - min[0]) / 2,
      hv: (max[2] - min[2]) / 2,
      bottom: min[1],
      top: max[1],
    });
  }
  for (const block of env.wallBoxes?.() ?? [])
    obstacles.push({
      cx: block.center[0],
      cz: block.center[2],
      ux: Math.cos(block.yaw),
      uz: -Math.sin(block.yaw),
      hu: block.half[0],
      hv: block.half[2],
      bottom: block.center[1] - block.half[1],
      top: block.center[1] + block.half[1],
    });
  const buckets = new Map<number, Obstacle[]>();
  for (const o of obstacles) {
    const reach = Math.hypot(o.hu, o.hv) + RADIUS;
    for (let bx = Math.floor((o.cx - reach) / BUCKET); bx <= Math.floor((o.cx + reach) / BUCKET); bx++)
      for (let bz = Math.floor((o.cz - reach) / BUCKET); bz <= Math.floor((o.cz + reach) / BUCKET); bz++) {
        const key = bucketKey(bx, bz);
        const list = buckets.get(key) ?? [];
        list.push(o);
        buckets.set(key, list);
      }
  }
  const near = (x: number, z: number) =>
    buckets.get(bucketKey(Math.floor(x / BUCKET), Math.floor(z / BUCKET))) ?? [];
  const floors = env.floors?.() ?? [];
  // Ladders: players who get to one climb it to its top.
  const ladders = placed.filter((item) => item.climbable);

  /**
   * Highest place to stand at or below `fromY`, whether it is built (a floor or an item), and
   * whether players swim there (water above it; they float at the surface).
   */
  const support = (x: number, z: number, fromY: number): { y: number; built: boolean; swim: boolean } => {
    let y = env.groundAt(x, z);
    let built = false;
    for (const floor of floors)
      if (floor.level <= fromY && floor.level > y && insidePolygon(x, z, floor.points)) {
        y = floor.level;
        built = true;
      }
    for (const o of near(x, z))
      if (o.top <= fromY && o.top > y && contains(o, x, z)) {
        y = o.top;
        built = true;
      }
    const water = env.waterAt?.(x, z) ?? null;
    return water !== null && water > y ? { y: water, built, swim: true } : { y, built, swim: false };
  };
  /** An obstacle keeps a player standing at `feet` from x, z (not climbable, not overhead). */
  const covered = (x: number, z: number, feet: number, grow = 0) =>
    near(x, z).some((o) => o.top > feet + CLIMB && o.bottom < feet + HEAD && contains(o, x, z, grow));

  // The grid: everything built plus a margin, inside the playable area.
  const [sx, sy, sz] = doc.spawn.position;
  let minX = sx;
  let maxX = sx;
  let minZ = sz;
  let maxZ = sz;
  for (const o of obstacles) {
    const reach = Math.hypot(o.hu, o.hv);
    minX = Math.min(minX, o.cx - reach);
    maxX = Math.max(maxX, o.cx + reach);
    minZ = Math.min(minZ, o.cz - reach);
    maxZ = Math.max(maxZ, o.cz + reach);
  }
  const half = SIZE_TIERS[doc.sizeTier].sideMeters / 2;
  minX = Math.max(-half, minX - MARGIN);
  maxX = Math.min(half, maxX + MARGIN);
  minZ = Math.max(-half, minZ - MARGIN);
  maxZ = Math.min(half, maxZ + MARGIN);
  const cell = Math.max(CELL, Math.sqrt(((maxX - minX) * (maxZ - minZ)) / MAX_CELLS));
  const nx = Math.max(1, Math.ceil((maxX - minX) / cell));
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / cell));
  const cx = (i: number) => minX + (i + 0.5) * cell;
  const cz = (j: number) => minZ + (j + 0.5) * cell;
  const cellOf = (x: number, z: number): [number, number] => [
    Math.min(nx - 1, Math.max(0, Math.floor((x - minX) / cell))),
    Math.min(nz - 1, Math.max(0, Math.floor((z - minZ) / cell))),
  ];

  // Walk from the start point. A spawn inside an item is its own finding; nothing is reachable then.
  const [si, sj] = cellOf(sx, sz);
  const start = support(cx(si), cz(sj), sy + CLIMB).y;
  if (covered(cx(si), cz(sj), start)) return [];
  const reached = new Map<number, number[]>();
  // Each step: cell, feet height, and whether it stands on something flat to jump from.
  const queue: Array<[number, number, number, boolean]> = [[si, sj, start, false]];
  reached.set(sj * nx + si, [start]);
  const steps = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const;
  for (let head = 0; head < queue.length && queue.length < MAX_CELLS * 4; head++) {
    const [i, j, h, firm] = queue[head]!;
    const [px, pz] = [cx(i), cz(j)];
    // A ladder here that players get onto (from the ground or with a jump) takes them to its top.
    for (const ladder of ladders) {
      const [top, bottom] = [ladder.max[1], ladder.min[1]];
      if (bottom > h + CLIMB || top <= h + SAME_LEVEL) continue;
      if (px < ladder.min[0] - LADDER_REACH || px > ladder.max[0] + LADDER_REACH) continue;
      if (pz < ladder.min[2] - LADDER_REACH || pz > ladder.max[2] + LADDER_REACH) continue;
      const key = j * nx + i;
      const levels = reached.get(key)!;
      if (levels.some((level) => Math.abs(level - top) < SAME_LEVEL)) continue;
      levels.push(top);
      queue.push([i, j, top, false]);
    }
    for (const [di, dj] of steps) {
      const [ni, nj] = [i + di, j + dj];
      if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
      const [qx, qz] = [cx(ni), cz(nj)];
      const target = support(qx, qz, h + CLIMB);
      // Into water always (players swim). Up onto a floor or an item, or from one (or out of
      // water), like a jump; up the ground only as steep as the character walks.
      const rise = target.y - h;
      const limit = target.built || firm ? CLIMB : Math.max(STEP, Math.hypot(di, dj) * cell * WALK_SLOPE);
      if (!target.swim && rise > limit) continue;
      const feet = Math.max(h, target.y);
      const blocked = [...near(px, pz), ...near(qx, qz)].some(
        (o) => o.top > h + CLIMB && o.bottom < feet + HEAD && crosses(o, px, pz, qx, qz, RADIUS),
      );
      if (blocked) continue;
      const key = nj * nx + ni;
      const levels = reached.get(key);
      if (levels?.some((level) => Math.abs(level - target.y) < SAME_LEVEL)) continue;
      if (levels) levels.push(target.y);
      else reached.set(key, [target.y]);
      queue.push([ni, nj, target.y, target.built || target.swim]);
    }
  }
  /** Whether players get to x, z (this cell or a neighbor) standing between `low` and `high`. */
  const reachedNear = (x: number, z: number, low: number, high: number) => {
    const [i, j] = cellOf(x, z);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const levels = reached.get((j + dj) * nx + (i + di));
        if (i + di >= 0 && i + di < nx && levels?.some((level) => level >= low && level <= high)) return true;
      }
    return false;
  };

  const findings: WorldFinding[] = [];
  // Items made to be used from the front (benches, houses): players must get to that side.
  for (const item of placed) {
    const clear = env.itemRules?.(item.instance.itemId)?.clearFront;
    if (!clear) continue;
    const forward = rotate([0, 0, 1], item.instance.transform.rotation);
    const length = Math.hypot(forward[0], forward[2]) || 1;
    const [fx, fz] = [forward[0] / length, forward[2] / length];
    const depth =
      (Math.abs(fx) * (item.max[0] - item.min[0]) + Math.abs(fz) * (item.max[2] - item.min[2])) / 2;
    const [ix, iz] = item.feet[0]!;
    const x = ix + fx * (depth + Math.min(clear, 1) * 0.6);
    const z = iz + fz * (depth + Math.min(clear, 1) * 0.6);
    const floor = item.min[1];
    // Something standing in front is the item's own "front" rule; it is not repeated here.
    if (covered(x, z, floor)) continue;
    if (!reachedNear(x, z, floor - 0.7, floor + CLIMB))
      findings.push({
        id: `unreachable:${item.instance.instanceId}`,
        code: 'unreachable',
        level: 'warning',
        message: `Players cannot get to ${nameOf(item.instance)} from the start point.`,
        instanceIds: [item.instance.instanceId],
        fix: null,
      });
  }

  // Doors: players must get to at least one side (the door check covers passing through).
  for (const door of env.doors?.() ?? []) {
    const sides = [1, -1].map((side) => [
      door.x + door.normal[0] * side,
      door.z + door.normal[1] * side,
    ]) as Array<[number, number]>;
    if (sides.some(([x, z]) => reachedNear(x, z, door.sill - 0.7, door.sill + CLIMB))) continue;
    const r = door.width / 2;
    findings.push({
      id: `unreachable-door:${door.wallId}:${door.openingId}`,
      code: 'unreachable',
      level: 'warning',
      message: 'Players cannot get to a door from the start point.',
      instanceIds: [],
      fix: null,
      area: { min: [door.x - r, door.sill, door.z - r], max: [door.x + r, door.sill + 2.2, door.z + r] },
    });
  }

  // Closed-in ground: cells a player could stand on that the walk never got to, grouped.
  const ground = new Float32Array(nx * nz).fill(Number.NaN);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const [x, z] = [cx(i), cz(j)];
      const y = support(x, z, env.groundAt(x, z) + 0.2).y;
      // Right beside a wall or an item is no place to stand (the walk keeps the same distance).
      if (covered(x, z, y, RADIUS)) continue;
      if (reached.get(j * nx + i)?.some((level) => level >= y - SAME_LEVEL && level <= y + CLIMB + 0.05))
        continue;
      ground[j * nx + i] = y;
    }
  const seen = new Uint8Array(nx * nz);
  for (let start = 0; start < nx * nz; start++) {
    if (seen[start] || Number.isNaN(ground[start]!)) continue;
    const area = [start];
    seen[start] = 1;
    let edge = false;
    for (let k = 0; k < area.length; k++) {
      const index = area[k]!;
      const [i, j] = [index % nx, Math.floor(index / nx)];
      if (i === 0 || j === 0 || i === nx - 1 || j === nz - 1) edge = true;
      for (const [di, dj] of steps.slice(0, 4)) {
        const [ni, nj] = [i + di, j + dj];
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const next = nj * nx + ni;
        if (seen[next] || Number.isNaN(ground[next]!)) continue;
        seen[next] = 1;
        area.push(next);
      }
    }
    // Ground at the grid's edge may be reachable from outside it; the walk does not know.
    if (edge || area.length * cell * cell < MIN_AREA) continue;
    let [loX, hiX, loZ, hiZ, loY, hiY] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    for (const index of area) {
      const [x, z, y] = [cx(index % nx), cz(Math.floor(index / nx)), ground[index]!];
      [loX, hiX, loZ, hiZ] = [Math.min(loX, x), Math.max(hiX, x), Math.min(loZ, z), Math.max(hiZ, z)];
      [loY, hiY] = [Math.min(loY, y), Math.max(hiY, y)];
    }
    const [mx, mz] = [Math.round((loX + hiX) / 2), Math.round((loZ + hiZ) / 2)];
    const size = Math.round(area.length * cell * cell);
    const h = cell / 2;
    findings.push({
      id: `unreachable-area:${round(loX)},${round(loZ)}`,
      code: 'unreachable',
      level: 'warning',
      message: `An area of about ${size} m² near (${mx}, ${mz}) cannot be reached from the start point.`,
      instanceIds: [],
      fix: null,
      area: { min: [loX - h, loY, loZ - h], max: [hiX + h, hiY + 2, hiZ + h] },
    });
  }
  return findings;
}
