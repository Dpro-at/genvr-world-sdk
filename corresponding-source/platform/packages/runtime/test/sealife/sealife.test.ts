import { WorldDocument, type ItemInstance } from '@genvr/contracts';
import { getCoreItem, itemGeneratedLook } from '@genvr/core-library';
import { beforeAll, describe, expect, it } from 'vitest';
import { DoubleSide, FrontSide, type BufferGeometry, type InstancedMesh, type Material } from 'three/webgpu';
import { buildGenerated, generatedParams, hasGenerator } from '../../src/generators.js';
import { ItemsView, resolveItem, yawQuaternion } from '../../src/items.js';
import { initPhysics, PhysicsWorld } from '../../src/physics.js';
import {
  CLAM_DEFAULTS,
  CLAM_GENERATOR,
  CLAM_MANTLES,
  SHELL_DEFAULTS,
  SHELL_GENERATOR,
  SHELL_KINDS,
  SHELL_TONES,
  STARFISH_DEFAULTS,
  STARFISH_GENERATOR,
  STARFISH_PALETTES,
  buildClam,
  buildShell,
  buildStarfish,
  clamParams,
  createSeaMaterial,
  registerSeaLife,
  shellParams,
  starfishParams,
} from '../../src/sealife/index.js';
import { CLAM_CLOSE_FRACTION, CLAM_GAPE } from '../../src/sealife/clam.js';
import { SHADOW_INSET } from '../../src/sealife/material.js';
import { clamClose, hingePosition, liftOffset, type Motion } from '../../src/sealife/motion.js';
import { STARFISH_CURL_LIFT } from '../../src/sealife/starfish.js';

/** Sea-life generators (SEALIFE-01): geometry, budgets, flicker, controls and motion. */

const IDS = {
  starfish: 'genvr.core.tidewater.starfish',
  clam: 'genvr.core.tidewater.giant-clam',
  shell: 'genvr.core.tidewater.sea-shell',
} as const;

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: V3): number => Math.sqrt(dot(a, a));

interface Tri {
  a: V3;
  b: V3;
  c: V3;
  n: V3;
  area: number;
  centre: V3;
}

function triangles(geometry: BufferGeometry): Tri[] {
  const p = geometry.getAttribute('position');
  const index = geometry.index!;
  const at = (i: number): V3 => [p.getX(i), p.getY(i), p.getZ(i)];
  const out: Tri[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = at(index.getX(i));
    const b = at(index.getX(i + 1));
    const c = at(index.getX(i + 2));
    const n = cross(sub(b, a), sub(c, a));
    const double = length(n);
    out.push({
      a,
      b,
      c,
      n: double > 0 ? [n[0] / double, n[1] / double, n[2] / double] : [0, 0, 0],
      area: double / 2,
      centre: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
    });
  }
  return out;
}

/** 2D triangles overlap (separating axis), after shrinking both a little so shared edges do not count. */
function overlap2d(t1: [number, number][], t2: [number, number][]): boolean {
  const shrink = (t: [number, number][]) => {
    const cx = (t[0]![0] + t[1]![0] + t[2]![0]) / 3;
    const cy = (t[0]![1] + t[1]![1] + t[2]![1]) / 3;
    return t.map(([x, y]) => [cx + (x - cx) * 0.97, cy + (y - cy) * 0.97] as [number, number]);
  };
  const a = shrink(t1);
  const b = shrink(t2);
  for (const shape of [a, b]) {
    for (let i = 0; i < 3; i++) {
      const p = shape[i]!;
      const q = shape[(i + 1) % 3]!;
      const axis: [number, number] = [q[1] - p[1], p[0] - q[0]];
      const project = (t: [number, number][]) => t.map(([x, y]) => x * axis[0] + y * axis[1]);
      const pa = project(a);
      const pb = project(b);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  return true;
}

/**
 * Pairs of triangles that lie in (nearly) the same plane and overlap: the cause of z-fighting (flicker). Planes
 * closer than `tolerance` metres count as the same; a 1 mm gap at 20 m is already resolved by the depth buffer.
 */
function coplanarOverlaps(geometry: BufferGeometry, tolerance = 0.0005): number {
  const tris = triangles(geometry).filter((t) => t.area > 1e-12);
  const cell = 0.02;
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  tris.forEach((t, i) => {
    const k = key(...t.centre);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(i);
  });
  let found = 0;
  tris.forEach((t, i) => {
    const [cx, cy, cz] = t.centre.map((v) => Math.floor(v / cell));
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          for (const j of grid.get(`${cx! + dx},${cy! + dy},${cz! + dz}`) ?? []) {
            if (j <= i) continue;
            const u = tris[j]!;
            if (Math.abs(dot(t.n, u.n)) < 0.9995) continue;
            if (Math.abs(dot(t.n, sub(u.centre, t.a))) > tolerance) continue;
            if (Math.abs(dot(u.n, sub(t.centre, u.a))) > tolerance) continue;
            // Project both onto t's plane.
            const axisU = sub(t.b, t.a);
            const lu = length(axisU);
            const e1: V3 = [axisU[0] / lu, axisU[1] / lu, axisU[2] / lu];
            const e2 = cross(t.n, e1);
            const flat = (tri: Tri) => [tri.a, tri.b, tri.c].map((p) => [dot(p, e1), dot(p, e2)] as [number, number]);
            if (overlap2d(flat(t), flat(u))) found++;
          }
        }
  });
  return found;
}

const triangleCount = (geometry: BufferGeometry) => geometry.index!.count / 3;

const motionOf = (geometry: BufferGeometry, i: number): Motion => {
  const m = geometry.getAttribute('aMotion');
  return [m.getX(i), m.getY(i), m.getZ(i), m.getW(i)];
};

/** Every variant the tests sweep: one per palette / mantle / kind and tone, at several seeds and sizes. */
const STARS = STARFISH_PALETTES.flatMap((palette, i) =>
  [5, 6].map((arms) => ({ ...STARFISH_DEFAULTS, palette, arms, seed: 11 * i + arms, size: 0.15 + 0.05 * i })),
);
const CLAMS = CLAM_MANTLES.map((mantle, i) => ({ ...CLAM_DEFAULTS, mantle, seed: 7 * i + 1, size: 0.3 + 0.2 * i, open: i / 3 }));
const SHELLS = SHELL_KINDS.flatMap((kind, i) =>
  SHELL_TONES.map((tone, j) => ({ ...SHELL_DEFAULTS, kind, tone, seed: 13 * i + j, size: 0.04 + 0.08 * j })),
);
/**
 * `closed`: the body hides its underside from every camera above the ground (starfish, cowrie; the conch and snail
 * rest on their outer whorl with the aperture tipped down). Open sheets (clam valves, scallop) count both sides.
 */
const ALL: { name: string; build: (level: number) => BufferGeometry; budget: number; closed: boolean }[] = [
  ...STARS.map((p) => ({ name: `starfish ${p.palette} ${p.arms}`, build: (l: number) => buildStarfish(p, l), budget: 2000, closed: true })),
  ...CLAMS.map((p) => ({ name: `clam ${p.mantle}`, build: (l: number) => buildClam(p, l), budget: 2500, closed: false })),
  ...SHELLS.map((p) => ({ name: `shell ${p.kind} ${p.tone}`, build: (l: number) => buildShell(p, l), budget: 2500, closed: p.kind !== 'scallop' })),
];

beforeAll(async () => {
  registerSeaLife();
  await initPhysics();
});

describe('sea-life geometry (SEALIFE-01)', () => {
  it('is deterministic by seed: equal parameters give bit-equal buffers, another seed another shape', () => {
    const bits = (g: BufferGeometry) => [
      new Uint32Array((g.getAttribute('position').array as Float32Array).buffer),
      new Uint32Array((g.getAttribute('aMotion') as unknown as { data: { array: Float32Array } }).data.array.buffer),
      new Uint32Array(new Float32Array(g.getAttribute('normal').array).buffer),
    ];
    for (const build of [
      (seed: number) => buildStarfish({ ...STARFISH_DEFAULTS, seed }, 0),
      (seed: number) => buildClam({ ...CLAM_DEFAULTS, seed }, 0),
      ...SHELL_KINDS.map((kind) => (seed: number) => buildShell({ ...SHELL_DEFAULTS, kind, seed }, 0)),
    ]) {
      expect(bits(build(42))).toEqual(bits(build(42)));
      expect(build(42).getAttribute('position').array).not.toEqual(build(43).getAttribute('position').array);
    }
  });

  it('keeps every level within its triangle budget, each level lighter than the one before', () => {
    for (const item of ALL) {
      const counts = [0, 1, 2].map((level) => triangleCount(item.build(level)));
      expect(counts[0], item.name).toBeLessThanOrEqual(item.budget);
      expect(counts[1], item.name).toBeLessThanOrEqual(counts[0]! * 0.4);
      expect(counts[2], item.name).toBeLessThanOrEqual(300);
      expect(counts[2], item.name).toBeLessThan(counts[1]!);
    }
  });

  it('matches the triangle budget and bounds the Core items declare at their defaults', () => {
    const cases = [
      { id: IDS.starfish, geometry: buildStarfish(STARFISH_DEFAULTS, 0) },
      { id: IDS.clam, geometry: buildClam(CLAM_DEFAULTS, 0) },
      { id: IDS.shell, geometry: buildShell(SHELL_DEFAULTS, 0) },
    ];
    for (const { id, geometry } of cases) {
      const item = getCoreItem(id)!;
      expect(item.manifest.budget.triangles, id).toBe(triangleCount(geometry));
      const declared = itemGeneratedLook(item, 'realistic')!.generated.bounds;
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const actual = [box.min.toArray(), box.max.toArray()];
      for (let k = 0; k < 3; k++) {
        // Declared bounds contain the rest pose and are at most 1 cm larger (the motion envelope).
        expect(declared.min[k]!, `${id} min ${k}`).toBeLessThanOrEqual(actual[0]![k]! + 0.0005);
        expect(declared.max[k]!, `${id} max ${k}`).toBeGreaterThanOrEqual(actual[1]![k]! - 0.0005);
        expect(actual[0]![k]! - declared.min[k]!, `${id} min ${k}`).toBeLessThan(0.01);
        expect(declared.max[k]! - actual[1]![k]!, `${id} max ${k}`).toBeLessThan(0.01);
      }
      expect(box.min.y).toBeCloseTo(0, 6);
    }
  });

  it('has finite positions, valid indices and no degenerate triangles', { timeout: 60000 }, () => {
    for (const item of ALL)
      for (let level = 0; level < 3; level++) {
        const geometry = item.build(level);
        const p = geometry.getAttribute('position');
        for (let i = 0; i < p.count * 3; i++) expect(Number.isFinite(p.array[i]), item.name).toBe(true);
        const index = geometry.index!;
        for (let i = 0; i < index.count; i++) expect(index.getX(i)).toBeLessThan(p.count);
        geometry.computeBoundingBox();
        const size = geometry.boundingBox!.getSize(geometry.boundingBox!.min.clone()).length();
        const smallest = Math.min(...triangles(geometry).map((t) => t.area));
        expect(smallest, `${item.name} level ${level}`).toBeGreaterThan(size * size * 1e-9);
      }
  });

  it('never flickers: no two triangles of an item share a plane where they overlap', () => {
    for (const item of ALL)
      for (let level = 0; level < 3; level++) expect(coplanarOverlaps(item.build(level)), `${item.name} level ${level}`).toBe(0);
  });

  it('spiral shells never flicker over many seeds and sizes (whorls cross or part, never touch tangentially)', () => {
    for (const kind of ['conch', 'snail'] as const)
      for (let j = 0; j < 40; j++) {
        const params = { ...SHELL_DEFAULTS, kind, seed: 100 + j * 37, size: 0.04 + (j % 4) * 0.08 };
        for (let level = 0; level < 3; level++)
          expect(coplanarOverlaps(buildShell(params, level)), `${kind} seed ${params.seed} level ${level}`).toBe(0);
      }
  }, 120000);

  it('the flicker check finds a doubled face (it can fail)', () => {
    const geometry = buildShell({ ...SHELL_DEFAULTS, kind: 'cowrie' }, 2);
    const index = Array.from(geometry.index!.array);
    geometry.setIndex([...index, index[0]!, index[2]!, index[1]!]);
    expect(coplanarOverlaps(geometry)).toBeGreaterThan(0);
  });

  it('never lies flat on the ground plane it stands on (no ground flicker)', () => {
    for (const item of ALL)
      for (let level = 0; level < 3; level++) {
        const geometry = item.build(level);
        geometry.computeBoundingBox();
        const extent = geometry.boundingBox!.getSize(geometry.boundingBox!.min.clone());
        const near = Math.min(0.002, 0.04 * Math.max(extent.x, extent.z));
        const flat = triangles(geometry).filter((t) => {
          const low = Math.max(t.a[1], t.b[1], t.c[1]) < near;
          // Closed bodies only show faces looking up; open double-sided sheets show both sides.
          return low && (item.closed ? t.n[1] > 0.97 : Math.abs(t.n[1]) > 0.97);
        });
        expect(flat.length, `${item.name} level ${level}`).toBe(0);
      }
  });

  it('faces outwards: closed bodies have positive volume, the scallop and clam valves face out', () => {
    const volume = (g: BufferGeometry) => triangles(g).reduce((sum, t) => sum + dot(t.a, cross(t.b, t.c)) / 6, 0);
    for (const level of [0, 1, 2]) {
      expect(volume(buildStarfish(STARFISH_DEFAULTS, level))).toBeGreaterThan(0);
      expect(volume(buildShell({ ...SHELL_DEFAULTS, kind: 'cowrie' }, level))).toBeGreaterThan(0);
      const scallop = triangles(buildShell({ ...SHELL_DEFAULTS, kind: 'scallop' }, level));
      expect(scallop.reduce((sum, t) => sum + t.n[1] * t.area, 0)).toBeGreaterThan(0);
      const valves = triangles(buildClam(CLAM_DEFAULTS, level)).filter((t) => Math.abs(t.centre[2]) > 0.08 && t.centre[1] < 0.15);
      expect(valves.reduce((sum, t) => sum + Math.sign(t.centre[2]) * t.n[2] * t.area, 0)).toBeGreaterThan(0);
    }
  });
});

describe('sea-life controls (SEALIFE-01)', () => {
  it('lists the same palettes, mantles, kinds and tones as the Core items', () => {
    const limits = (id: string) => itemGeneratedLook(getCoreItem(id)!, 'realistic')!.generated.limits;
    expect(limits(IDS.starfish).palette!.values).toEqual([...STARFISH_PALETTES]);
    expect(limits(IDS.clam).mantle!.values).toEqual([...CLAM_MANTLES]);
    expect(limits(IDS.shell).kind!.values).toEqual([...SHELL_KINDS]);
    expect(limits(IDS.shell).tone!.values).toEqual([...SHELL_TONES]);
  });

  it('keeps the runtime clamps equal to the Core limits and falls back on bad data', () => {
    const look = (id: string) => itemGeneratedLook(getCoreItem(id)!, 'realistic')!;
    expect(starfishParams({ size: 99, arms: 9, curl: -1, palette: 'green', seed: 3.7 })).toEqual({
      ...STARFISH_DEFAULTS,
      size: look(IDS.starfish).generated.limits.size!.max,
      arms: 6,
      curl: 0,
      seed: 3,
    });
    expect(clamParams({ size: 0, open: 5, speed: Number.NaN, mantle: 7 })).toEqual({
      ...CLAM_DEFAULTS,
      size: look(IDS.clam).generated.limits.size!.min,
      open: 1,
    });
    expect(shellParams({ kind: 'oyster', size: 1 })).toEqual({ ...SHELL_DEFAULTS, size: look(IDS.shell).generated.limits.size!.max });
    for (const [id, params] of [
      [IDS.starfish, starfishParams({})],
      [IDS.clam, clamParams({})],
      [IDS.shell, shellParams({})],
    ] as const)
      expect(params).toEqual(look(id).generated.params);
  });

  it('is registered by the runtime and drawn through ItemsView with three levels per batch', () => {
    for (const generator of [STARFISH_GENERATOR, CLAM_GENERATOR, SHELL_GENERATOR]) expect(hasGenerator(generator)).toBe(true);
    for (const id of Object.values(IDS)) {
      const model = resolveItem(id, undefined, 'realistic', undefined, {});
      expect(model.meshes, id).toHaveLength(1);
      expect(model.lods, id).toHaveLength(2);
      expect(model.collider).toBe(id === IDS.clam ? 'box' : 'none');
    }
    const look = itemGeneratedLook(getCoreItem(IDS.clam)!, 'realistic')!;
    const built = buildGenerated(CLAM_GENERATOR, generatedParams(look, { size: 0.8 }))!;
    expect(built.bounds.max[0] - built.bounds.min[0]).toBeCloseTo(0.8, 1);
    const doc = (instances: ItemInstance[]) =>
      WorldDocument.parse({
        schemaVersion: 1,
        experienceId: 'x',
        version: 0,
        style: { base: 'realistic' },
        sizeTier: 'small',
        access: { mode: 'private' },
        environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
        terrain: {},
        spawn: { position: [0, 1, 0] },
        instances,
      });
    const place = (instanceId: string, itemId: string, x: number, params: Record<string, unknown>): ItemInstance => ({
      instanceId,
      itemId,
      transform: { position: [x, 0, 0], rotation: yawQuaternion(x), scale: [1, 1, 1] },
      params,
    });
    const view = new ItemsView(new PhysicsWorld(), (itemId, params) => resolveItem(itemId, undefined, 'realistic', undefined, params));
    view.sync(
      doc([
        place('s1', IDS.starfish, 0, { seed: 1 }),
        place('s2', IDS.starfish, 1, { seed: 1 }),
        place('c1', IDS.clam, 2, { mantle: 'teal' }),
        place('h1', IDS.shell, 3, { kind: 'cowrie' }),
        place('h2', IDS.shell, 4, { kind: 'scallop' }),
      ]),
    );
    const batches = view.group.children as InstancedMesh[];
    // Four parameter sets, three levels each.
    expect(batches).toHaveLength(12);
    const materials = new Set(batches.map((mesh) => (mesh.material as Material).name));
    expect([...materials].sort()).toEqual(['sealife.hinge.gloss', 'sealife.lift', 'sealife.none.gloss']);
  });

  it('uses one shared material per kind: front-sided bodies, double-sided sheets with shadow casters inset', () => {
    const star = createSeaMaterial({ motion: 'lift', doubleSided: false, gloss: false });
    const shell = createSeaMaterial({ motion: 'none', doubleSided: true, gloss: true });
    expect(star.side).toBe(FrontSide);
    expect(star.castShadowPositionNode).toBeFalsy();
    expect(shell.side).toBe(DoubleSide);
    expect(shell.castShadowPositionNode).toBeTruthy();
    expect(SHADOW_INSET).toBeLessThan(0.02);
    expect(star.colorNode).toBeTruthy();
    expect(shell.normalNode).toBeTruthy();
  });
});

describe('sea-life motion (SEALIFE-01)', () => {
  const times = Array.from({ length: 400 }, (_, i) => i * 0.25);

  it('starfish arm curl only lifts, at most the curl amount, and stops at curl 0', () => {
    for (const curl of [0, 0.5, 1]) {
      const params = { ...STARFISH_DEFAULTS, curl };
      const geometry = buildStarfish(params, 0);
      const limit = curl * STARFISH_CURL_LIFT * (params.size / 2);
      for (let i = 0; i < geometry.getAttribute('position').count; i += 7) {
        const motion = motionOf(geometry, i);
        for (const time of times) {
          const lift = liftOffset(motion, time);
          expect(lift).toBeGreaterThanOrEqual(0);
          expect(lift).toBeLessThanOrEqual(limit + 1e-9);
        }
      }
    }
  });

  it('clam closes at most part of its gape, never past the other valve, and is still at speed 0', () => {
    for (const params of CLAMS) {
      const geometry = buildClam(params, 0);
      const gape = CLAM_GAPE[0] + (CLAM_GAPE[1] - CLAM_GAPE[0]) * params.open;
      let most = 0;
      for (let i = 0; i < geometry.getAttribute('position').count; i++) most = Math.max(most, Math.abs(motionOf(geometry, i)[0]));
      expect(most).toBeCloseTo((CLAM_CLOSE_FRACTION * gape) / 2, 6);
      expect(most).toBeLessThan(gape / 2);
    }
    const still = buildClam({ ...CLAM_DEFAULTS, speed: 0 }, 0);
    for (let i = 0; i < still.getAttribute('position').count; i++) expect(motionOf(still, i)[2]).toBe(0);
    expect(clamClose([0, 0, 0, 0], 3)).toBe(1);
  });

  it('stays inside the declared bounds over a whole cycle (within the rest sink below ground)', () => {
    for (const [id, geometry, kind] of [
      [IDS.starfish, buildStarfish(STARFISH_DEFAULTS, 0), 'lift'],
      [IDS.clam, buildClam(CLAM_DEFAULTS, 0), 'hinge'],
    ] as const) {
      const item = getCoreItem(id)!;
      const { min, max } = itemGeneratedLook(item, 'realistic')!.generated.bounds;
      const sink = item.manifest.placement?.rest?.sink ?? 0;
      const p = geometry.getAttribute('position');
      for (let i = 0; i < p.count; i += 5) {
        const motion = motionOf(geometry, i);
        for (const time of times) {
          const rest: V3 = [p.getX(i), p.getY(i), p.getZ(i)];
          const q = kind === 'lift' ? [rest[0], rest[1] + liftOffset(motion, time), rest[2]] : hingePosition(rest, motion, time);
          for (let k = 0; k < 3; k++) {
            expect(q[k]!, id).toBeLessThanOrEqual(max[k]! + 1e-4);
            expect(q[k]!, id).toBeGreaterThanOrEqual(min[k]! - (k === 1 ? sink : 1e-4));
          }
        }
      }
    }
  }, 60000);
});
