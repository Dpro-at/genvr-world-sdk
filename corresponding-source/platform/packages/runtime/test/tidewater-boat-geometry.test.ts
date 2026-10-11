import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { describe, expect, it } from 'vitest';
import * as boat from '../src/tidewater-boat/index.js';
import { GeoKit } from '../src/tidewater-boat/geo-kit.js';
import { buildHull } from '../src/tidewater-boat/hull-builder.js';
import { buildWheelhouse, type BoatParts } from '../src/tidewater-boat/wheelhouse.js';
import { buildDeckGear } from '../src/tidewater-boat/deck-gear.js';

// Executes the ORIGINAL pinned Tidewater boat source (read only) against the installed three.js, one
// module at a time with its imports injected, and compares the port bit-exact.
type Mod = Record<string, unknown>;
const root = new URL('../../../../tooling/other-programs/tidewater/src/world/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const importNames = (src: string) => [...src.matchAll(/^import\s*\{([^}]*)\}\s*from/gm)]
  .flatMap(m => m[1]!.split(',').map(s => s.trim()).filter(Boolean));
function load(path: string, pool: Mod, names: string[]): Mod {
  const src = read(path);
  const deps = importNames(src);
  for (const d of deps) if (!(d in pool)) throw new Error(`${path}: no ${d}`);
  const body = src.replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  return new Function(...deps, `${body}\n;return {${names.join(',')}};`)(...deps.map(d => pool[d])) as Mod;
}

const BUCKETS = ['hull', 'gelcoat', 'wood', 'fittings', 'trap', 'glow', 'glass'];
// stand-ins for the source's WGSL engine material factory (records what the source asks for)
const fakeMaterial = (kind: string) => (o: Mod) => {
  const uniforms: Record<string, { value: unknown }> = {};
  for (const [k, v] of Object.entries((o.uniforms ?? {}) as Record<string, [string, unknown]>)) uniforms[k] = { value: v[1] };
  return { kind, options: o, uniforms, disposed: 0, dispose() { this.disposed++; } };
};
const G = { windDir: { value: new THREE.Vector2(0.35, 0.94).normalize() }, windSpeed: { value: 7 } };

function loadOriginal(engine: Mod) {
  const pool: Mod = { ...engine };
  Object.assign(pool, load('boat/HullLines.js', pool, ['HullLines', 'RHO_SEAWATER', 'sstep', 'lerp', 'clamp01']));
  Object.assign(pool, load('boat/GeoKit.js', pool, ['mat4', 'alignY', 'linearColor', 'prepare', 'GeoKit', 'mergePrepared',
    'box', 'roundedBox', 'cylinder', 'rod', 'sphere', 'torus', 'lathe', 'tube', 'gridSurface', 'fanCap', 'orientTowards',
    'planarUV', 'slab', 'loft', 'paintVertices', 'auxVertices', 'triangleCount']));
  Object.assign(pool, load('boat/HullBuilder.js', pool, ['PALETTE', 'buildHull', 'buildHullVolume', 'keelBottomAt', 'KEEL',
    'keelVolume', 'foredeckY', 'houseHalfWidth']));
  Object.assign(pool, load('boat/DeckGear.js', pool, ['buoyGeometry', 'buildDeckGear', 'TRAP', 'TRAPS', 'HAULER', 'FENDERS', 'FLAG']));
  Object.assign(pool, load('boat/Wheelhouse.js', pool, ['HOUSE', 'wsZ', 'wallX', 'roofTopY', 'buildWheelhouse', 'panelFrame',
    'wheelGeometry', 'throttleGeometry', 'radarArrayGeometry']));
  Object.assign(pool, load('boat/Running.js', pool, ['PROP', 'RUDDER', 'propellerGeometry', 'rudderGeometry']));
  Object.assign(pool, { ShaderModule: class { constructor(o: Mod) { Object.assign(this, o); } }, commonModule: { name: 'common' },
    standard: fakeMaterial('standard'), physical: fakeMaterial('physical'), DoubleSide: THREE.DoubleSide, G });
  Object.assign(pool, load('boat/BoatMaterials.js', pool, ['BoatMaterials']));
  Object.assign(pool, load('BoatModel.js', pool, ['BoatModel', 'transverseInertia', 'STATIC_BUCKETS', 'RADAR_RPM', 'PROP_DISPLAY_RPS']));
  return pool as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const THREE_POOL: Mod = { ...THREE, RoundedBoxGeometry, mergeGeometries };
const src = loadOriginal(THREE_POOL);

const bits = (array: ArrayLike<number>) => new Uint32Array(Float32Array.from(array).buffer);
type Geo = THREE.BufferGeometry;
function expectSameGeometry(actual: Geo, expected: Geo, label = '') {
  const names = Object.keys(expected.attributes);
  expect(Object.keys(actual.attributes), label).toEqual(names);
  for (const name of names) {
    const a = actual.getAttribute(name) as THREE.BufferAttribute, b = expected.getAttribute(name) as THREE.BufferAttribute;
    expect([a.itemSize, a.count, a.array.constructor.name, a.normalized], `${label} ${name}`)
      .toEqual([b.itemSize, b.count, b.array.constructor.name, b.normalized]);
    expect(bits(a.array), `${label} ${name} bits`).toEqual(bits(b.array));
  }
  expect(actual.index?.array.constructor.name, label).toBe(expected.index?.array.constructor.name);
  if (expected.index) expect(Array.from(actual.index!.array), `${label} index`).toEqual(Array.from(expected.index.array));
  expect(actual.groups, label).toEqual(expected.groups);
  expect(actual.boundingBox, label).toEqual(expected.boundingBox);
  expect(actual.boundingSphere, label).toEqual(expected.boundingSphere);
}
const vec = (v: { x: number; y: number; z: number }) => [v.x, v.y, v.z];
// deep structure compare with plain numbers bit-exact (Vector3s compared through x, y, z)
const plain = (v: unknown): unknown => {
  if (v instanceof THREE.Vector3 || v instanceof THREE.Vector2) return v.toArray();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
};

describe('Tidewater boat: hull lines', () => {
  const ours = new boat.HullLines(), theirs = new src.HullLines();

  it('keeps the design constants, stem and hydrostatics', () => {
    for (const key of ['zAft', 'zBow', 'length', 'deckY', 'shell', 'houseBack', 'houseFront', 'wlStart', 'wlEnd',
      'waterplaneArea', 'canoeVolume', 'centerOfFlotationZ', '_tableZ0', '_tableDz'] as const) {
      expect(Object.is(ours[key], theirs[key]), key).toBe(true);
    }
    expect(ours.stem).toEqual(theirs.stem);
    expect(vec(ours.centerOfBuoyancy)).toEqual(vec(theirs.centerOfBuoyancy));
    expect(ours._beamTable).toEqual(theirs._beamTable);
    expect(bits(ours._field.bottom)).toEqual(bits(theirs._field.bottom));
    expect([ours._field.nx, ours._field.nz, ours._field.cell, ours._field.x0, ours._field.z0])
      .toEqual([theirs._field.nx, theirs._field.nz, theirs._field.cell, theirs._field.x0, theirs._field.z0]);
    expect(boat.RHO_SEAWATER).toBe(src.RHO_SEAWATER);
  });

  it('matches the design curves, sections and station layout', () => {
    for (const t of [0, 0.013, 0.2, 0.42, 0.45, 0.55, 0.7, 0.9, 0.995, 1]) {
      for (const fn of ['sheerZ', 'sheerY', 'sheerX', 'keelY', 'chineX', 'chineY', 'bilgeTangent', 'bottomConvexity', 'flare',
        'bowBlend'] as const) expect(Object.is(ours[fn](t), theirs[fn](t)), `${fn}(${t})`).toBe(true);
      expect(ours.controlPoints(t)).toEqual(theirs.controlPoints(t));
      for (const d of [1, 2, 3]) {
        expect(ours.sectionPoints(t, d)).toEqual(theirs.sectionPoints(t, d));
        expect(ours.station(t, d).map(vec)).toEqual(theirs.station(t, d).map(vec));
      }
    }
    for (const d of [1, 2, 3]) {
      expect(ours.setback(d)).toEqual(theirs.setback(d));
      expect(ours.sectionCount(d)).toBe(theirs.sectionCount(d));
    }
    for (const n of [28, 60]) expect(ours.stationParams(n)).toEqual(theirs.stationParams(n));
    for (const y of [-0.6, -0.3, 0, 0.35, 0.9, 1.2, 1.7]) expect(ours.stemZ(y)).toBe(theirs.stemZ(y));
  });

  it('matches the hull queries and buoyancy samples', () => {
    for (const z of [-4, -3.9, -3.2, -1, 0, 0.5, 2.2, 3.6, 4.1, 4.4]) {
      expect(ours.tAtSheerZ(z)).toBe(theirs.tAtSheerZ(z));
      expect(ours.halfBeamAt(z)).toBe(theirs.halfBeamAt(z));
      expect(ours.draftAt(z)).toBe(theirs.draftAt(z));
      for (const x of [0, 0.3, -0.9, 1.4]) expect(ours.bottomAt(x, z)).toBe(theirs.bottomAt(x, z));
      for (const y of [-0.2, 0.4, 0.81, 1.3]) {
        expect(ours.tAt(z, y)).toBe(theirs.tAt(z, y));
        expect(ours.zOnStation(ours.tAtSheerZ(z), y)).toBe(theirs.zOnStation(theirs.tAtSheerZ(z), y));
        expect(ours.hullXAt(z, y)).toBe(theirs.hullXAt(z, y));
        expect(ours.halfBreadth(ours.tAtSheerZ(z), y)).toBe(theirs.halfBreadth(theirs.tAtSheerZ(z), y));
      }
    }
    for (const n of [4, 8]) expect(plain(ours.buildHullSamples(n))).toEqual(plain(theirs.buildHullSamples(n)));
  });
});

describe('Tidewater boat: geometry', () => {
  it('matches every bucket after each builder stage (hull, wheelhouse, deck gear)', () => {
    const L = new boat.HullLines(), SL = new src.HullLines();
    const kit = new GeoKit(), skit = new src.GeoKit();
    const parts: BoatParts = {}, sparts: Record<string, unknown> = {};
    const stages: [string, () => void, () => void][] = [
      ['hull', () => buildHull(kit, L), () => src.buildHull(skit, SL)],
      ['wheelhouse', () => buildWheelhouse(kit, L, parts), () => src.buildWheelhouse(skit, SL, sparts)],
      ['deck gear', () => buildDeckGear(kit, L, parts), () => src.buildDeckGear(skit, SL, sparts)],
    ];
    for (const [stage, a, b] of stages) {
      a(); b();
      expect([...kit.buckets.keys()], stage).toEqual([...skit.buckets.keys()]);
      for (const name of BUCKETS) {
        const ours = kit.buckets.get(name), theirs = skit.buckets.get(name) as Geo[] | undefined;
        expect(ours?.length, `${stage} ${name} parts`).toBe(theirs?.length);
        // every prepared part, in order
        ours?.forEach((g, i) => expectSameGeometry(g, theirs![i]!, `${stage} ${name}[${i}]`));
      }
    }
    expect(plain(parts)).toEqual(plain(sparts));
    for (const name of BUCKETS) expectSameGeometry(kit.merged(name)!, skit.merged(name), `merged ${name}`);
  });

  it('matches the animated parts, the hull volume and the keel', () => {
    const pairs: [string, () => Geo, () => Geo][] = [
      ['wheel', boat.wheelGeometry, src.wheelGeometry], ['throttle', boat.throttleGeometry, src.throttleGeometry],
      ['radar', boat.radarArrayGeometry, src.radarArrayGeometry], ['propeller', boat.propellerGeometry, src.propellerGeometry],
      ['rudder', boat.rudderGeometry, src.rudderGeometry],
      ['volume', () => boat.buildHullVolume(new boat.HullLines()), () => src.buildHullVolume(new src.HullLines())],
    ];
    for (const [name, a, b] of pairs) expectSameGeometry(a(), b(), name);
    const L = new boat.HullLines(), SL = new src.HullLines();
    expect(boat.keelVolume(L)).toBe(src.keelVolume(SL));
    for (const z of [-4, -3.05, -2, 0, 1.5, 3.1, 3.74, 4]) expect(boat.keelBottomAt(z)).toBe(src.keelBottomAt(z));
    expect([boat.KEEL, boat.PROP, boat.RUDDER, boat.HOUSE, boat.TRAP, boat.TRAPS, boat.HAULER, boat.FENDERS, boat.FLAG, boat.PALETTE]
      .map(plain)).toEqual([src.KEEL, src.PROP, src.RUDDER, src.HOUSE, src.TRAP, src.TRAPS, src.HAULER, src.FENDERS, src.FLAG,
      src.PALETTE].map(plain));
    for (const x of [0, 0.42, 1.1, 1.35]) expect(boat.roofTopY(x)).toBe(src.roofTopY(x));
    for (const [z, y] of [[0, 1.2], [1.0, 2.31], [-0.35, 0.9]] as const) {
      expect(boat.wsZ(L, y)).toBe(src.wsZ(SL, y));
      expect(boat.wallX(L, z, y)).toBe(src.wallX(SL, z, y));
      expect(boat.houseHalfWidth(L, z)).toBe(src.houseHalfWidth(SL, z));
      expect(boat.foredeckY(L, L.tAtSheerZ(z + 2), y - 1)).toBe(src.foredeckY(SL, SL.tAtSheerZ(z + 2), y - 1));
    }
    const pf = boat.panelFrame(), spf = src.panelFrame();
    expect([vec(pf.along), vec(pf.normal), pf.length, pf.angle, vec(pf.at(0.3, 0.4))])
      .toEqual([vec(spf.along), vec(spf.normal), spf.length, spf.angle, vec(spf.at(0.3, 0.4))]);
    for (const [colors, stick] of [[undefined, 0.35], [[0x112233, 0x445566, 0x778899], 0.3]] as const) {
      const a = boat.buoyGeometry(colors as number[] | undefined, stick), b = src.buoyGeometry(colors, stick) as [Geo, Mod][];
      expect(a.map(p => p[1])).toEqual(b.map(p => p[1]));
      a.forEach((p, i) => expectSameGeometry(p[0], b[i]![0], `buoy ${i}`));
    }
  });

  // The plan quotes the source comment "37k triangles"; the pinned source actually builds 46,825
  // (42,801 in the 7 static buckets + 4,024 in the 5 animated parts), so the comment is stale.
  it('stays deterministic and inside the plan numbers (7 buckets, 46,825 triangles, 4-blade prop r 0.21, radar 24 rpm)', () => {
    const a = new boat.BoatModel(), b = new boat.BoatModel();
    for (const name of BUCKETS) expectSameGeometry(a.meshes[name]!.geometry, b.meshes[name]!.geometry, name);
    expect(boat.STATIC_BUCKETS).toEqual(BUCKETS);
    expect(a.triangleCount).toBe(46825);
    expect(BUCKETS.reduce((n, k) => n + a.meshes[k]!.geometry.index!.count / 3, 0)).toBe(42801);
    expect([boat.PROP.blades, boat.PROP.radius, boat.RADAR_RPM]).toEqual([4, 0.21, 24]);
    // all positions finite and the boat inside its 8.2 m x 3 m x 4 m frame
    const box = new THREE.Box3();
    for (const m of Object.values(a.meshes)) {
      expect(Array.from(m.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      m.updateWorldMatrix(true, false);
      box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
    }
    // x: davit arm 1.93 m outboard to starboard; y: keel shoe to the 2.4 m VHF whip; z: ensign 0.5 m aft of the
    // staff to the anchor roller
    const bounds = [...box.min.toArray(), ...box.max.toArray()];
    [-1.9285, -0.77, -4.26, 1.5537, 4.86, 4.4792].forEach((v, i) => expect(bounds[i]).toBeCloseTo(v, 4));
    a.dispose(); b.dispose();
  });
});

describe('Tidewater boat: model, hydrostatics and animation', () => {
  const ours = new boat.BoatModel(), theirs = new src.BoatModel();

  it('matches the meshes, their order, flags and transforms', () => {
    expect(Object.keys(ours.meshes)).toEqual(Object.keys(theirs.meshes));
    for (const [name, mesh] of Object.entries(ours.meshes)) {
      const other = theirs.meshes[name] as THREE.Mesh;
      expect([mesh.name, mesh.castShadow, mesh.receiveShadow, mesh.renderOrder, mesh.parent?.name])
        .toEqual([other.name, other.castShadow, other.receiveShadow, other.renderOrder, other.parent?.name]);
      expect(mesh.position.toArray()).toEqual(other.position.toArray());
      expect(mesh.quaternion.toArray()).toEqual(other.quaternion.toArray());
      expectSameGeometry(mesh.geometry, other.geometry, name);
    }
    expect(ours.group.name).toBe(theirs.group.name);
    expect(ours.group.children.map(c => c.name)).toEqual(theirs.group.children.map((c: THREE.Object3D) => c.name));
    expect([ours.wheelPivot.position.toArray(), ours.wheelPivot.quaternion.toArray()])
      .toEqual([theirs.wheelPivot.position.toArray(), theirs.wheelPivot.quaternion.toArray()]);
    expect(ours.triangleCount).toBe(theirs.triangleCount);
    expectSameGeometry(ours.createHullVolumeGeometry(), theirs.createHullVolumeGeometry(), 'volume');
  });

  it('matches the dimensions, hydrostatics, anchors, buoyancy samples and colliders', () => {
    expect(plain(ours.dimensions)).toEqual(plain(theirs.dimensions));
    expect(plain(ours.hydro)).toEqual(plain(theirs.hydro));
    expect(boat.transverseInertia(ours.lines)).toBe(src.transverseInertia(theirs.lines));
    for (const key of ['helmEye', 'boardPoint', 'exitPoints', 'propeller', 'rudder', 'bowSprayPoints', 'hullSamples', 'colliders'] as const) {
      expect(plain(ours[key]), key).toEqual(plain(theirs[key]));
    }
    for (const z of [-3, 0, 2.5]) {
      expect(ours.halfBeamAt(z)).toBe(theirs.halfBeamAt(z));
      expect(ours.draftAt(z)).toBe(theirs.draftAt(z));
    }
    // 3.2 t on the design waterline (plan task 18): mass from the canoe volume, centre of mass over buoyancy
    expect([ours.hydro.suggestedMass, ours.hydro.massWithKeel]).toEqual([3204, 3345]);
    expect(ours.hydro.canoeVolume).toBeCloseTo(3.1256, 4);
    const samples = ours.hullSamples.reduce((v, s) => v + s.area * s.depth, 0);
    expect(samples).toBeCloseTo(ours.hydro.canoeVolume, 9);
    expect(ours.hydro.centerOfMass.z).toBe(ours.hydro.centerOfBuoyancy.z);
  });

  it('matches steering, throttle, propeller, radar and the apparent-wind ensign over time', () => {
    const wind = { dir: G.windDir.value, speed: G.windSpeed.value };
    const steps: [number, number, number, number, [number, number, number]][] = [
      [0.4, 0.5, 1800, 0.016, [0, 0, 0]], [-1.3, -0.2, -600, 0.033, [0.1, 0, 0.2]], [0, 1.4, 2400, 0.05, [0.5, 0, 0.6]],
      [0.9, 0.3, 300, 0, [50, 0, 0]], [0.2, 0.1, 900, 0.1, [80, 0, 0]], [-0.6, 0.8, 1200, 0.016, [80.2, 0.05, 0.1]],
    ];
    for (const [steer, throttle, rpm, dt, [x, y, z]] of steps) {
      ours.setSteering(steer); theirs.setSteering(steer);
      ours.setThrottle(throttle); theirs.setThrottle(throttle);
      ours.setPropellerRPM(rpm); theirs.setPropellerRPM(rpm);
      ours.group.position.set(x, y, z); theirs.group.position.set(x, y, z);
      ours.group.rotation.y += 0.1; theirs.group.rotation.y += 0.1;
      ours.update(dt, wind); theirs.update(dt);
      for (const part of ['wheelMesh', 'rudderMesh', 'throttleMesh', 'propMesh', 'radarMesh'] as const) {
        expect(ours[part].rotation.toArray(), part).toEqual((theirs[part] as THREE.Mesh).rotation.toArray());
      }
      expect(ours.materials.flagDir.value.toArray()).toEqual(theirs.materials.flagDir.value.toArray());
      expect(ours.materials.flagWind.value).toBe(theirs.materials.flagWind.value);
    }
    ours.setNavLights(false); theirs.setNavLights(false);
    expect(ours.materials.navOn.value).toBe(theirs.materials.navOn.value);
    expect(ours.materials.flagPivot.value.toArray()).toEqual(theirs.materials.flagPivot.value.toArray());
  });

  it('matches the material table and its WGSL (shading itself is GPU-only and not run here)', () => {
    const specs = ours.materials.specs; // shares the uniform handles the model animated above
    expect(plain(boat.boatMaterialSpecs(ours.lines).hull)).toEqual(plain(specs.hull));
    for (const name of BUCKETS) {
      const m = theirs.materials[name] as { kind: string; options: Mod; uniforms: Record<string, { value: unknown }> };
      const spec = specs[name as boat.BoatBucket];
      const { modules, ...options } = m.options;
      const { modules: ourModules, ...ourOptions } = spec.options;
      expect((modules as { name: string; code: string }[]).map(x => [x.name, x.code]))
        .toEqual(ourModules.map(x => [x.name, x.code]));
      expect(spec.kind, name).toBe(m.kind);
      expect(plain(ourOptions), name).toEqual(plain(options));
      expect(plain(spec.uniforms), name).toEqual(plain(m.uniforms));
      for (const key of ['name', 'surface', 'vertex', 'output'] as const) expect(spec[key], `${name}.${key}`).toBe((m as unknown as Mod)[key]);
    }
    expect(boat.BOAT_WGSL_MODULE).toBe((theirs.materials.hull.options.modules as { code: string }[])[0]!.code);
    expect(boat.wgslColor(0x7a1d15)).toMatch(/^vec3f\( 0\.\d+, 0\.\d+, 0\.\d+ \)$/);
    expect(boat.wgslFloat(6)).toBe('6.0');
  });
});

// The source also ships its own three-compatible CPU engine (src/engine). Its primitives match three.js
// bit for bit, but its earcut (ShapeUtils.triangulateShape) and some vertex normals do not: this pins
// the measured gap between "Tidewater as shipped" and "Tidewater on three.js" (what the port matches).
describe('Tidewater boat: source engine parity', () => {
  it('the pinned source on its own CPU engine has the same vertices; only slab triangles and some normals differ', async () => {
    const engine = await import(new URL('../engine/index.js', root).href) as Mod;
    const original = loadOriginal(engine);
    const L = new original.HullLines(), kit = new original.GeoKit(), parts = {};
    original.buildHull(kit, L); original.buildWheelhouse(kit, L, parts); original.buildDeckGear(kit, L, parts);
    const ours = new boat.BoatModel();
    const normalsDiffer: string[] = [], trianglesDiffer: string[] = [];
    for (const name of BUCKETS) {
      const g = kit.merged(name) as Geo, mine = ours.meshes[name]!.geometry;
      expect(Object.keys(g.attributes), name).toEqual(Object.keys(mine.attributes));
      for (const key of ['position', 'uv', 'color', 'aux']) {
        expect(bits(mine.getAttribute(key).array), `${name} ${key}`).toEqual(bits(g.attributes[key]!.array));
      }
      if (bits(mine.getAttribute('normal').array).some((v, i) => v !== bits(g.attributes.normal!.array)[i])) normalsDiffer.push(name);
      const a = Array.from(mine.index!.array), b = Array.from(g.index!.array);
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) trianglesDiffer.push(`${name} ${a.length / 3}/${b.length / 3}`);
    }
    expect(normalsDiffer).toEqual(['gelcoat', 'fittings']);
    // slab() faces (wall, windshield, console, sole, frames): other earcut triangles, 20 more on the gelcoat
    expect(trianglesDiffer).toEqual(['gelcoat 4446/4466', 'wood 3458/3458', 'fittings 25742/25742']);
    // animated parts: identical except the throttle (engine matrix/scale rounding, < 1e-6 m)
    for (const name of ['wheel', 'radar', 'propeller', 'rudder']) {
      const g = original[`${name === 'radar' ? 'radarArray' : name}Geometry`]() as Geo, mine = ours.meshes[name]!.geometry;
      for (const key of Object.keys(g.attributes)) {
        expect(bits(mine.getAttribute(key).array), `${name} ${key}`).toEqual(bits(g.attributes[key]!.array));
      }
      expect(Array.from(mine.index!.array), name).toEqual(Array.from(g.index!.array));
    }
    const throttle = original.throttleGeometry() as Geo, mine = ours.meshes.throttle!.geometry;
    const p = mine.getAttribute('position').array, q = throttle.attributes.position!.array;
    expect(Math.max(...Array.from(p, (v, i) => Math.abs(v - q[i]!)))).toBeLessThan(1e-6);
  });
});
