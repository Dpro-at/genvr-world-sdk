'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Float32BufferAttribute,
  PlaneGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Material,
} from 'three';
import { DEFAULT_CHARACTER_RECIPE, type LabCourse, type LabObstacle } from '@genvr/contracts';
import { CORE_ANIMATIONS } from '@genvr/core-library';
import { carBoxes, courseBoxes, laneCentreZ, LAB_CAR_SIZE, walkerGreen, type LabFrame } from '@genvr/runtime';
import type { CharacterStage } from '@genvr/runtime/character';
import type { LabController } from '../../../lib/motion-lab';

/**
 * The lab's 3D view (boards M1, M3): the Standard robot stands at the centre of the character stage and plays the move
 * of each moment; the grey floor with its 1 m grid, the measured obstacles, the street with its light and box cars and
 * the debug marks are one group that moves under the robot, so the camera always follows it.
 */
const CLIPS = new Map(CORE_ANIMATIONS.map((a) => [a.manifest.name, a.clip]));
const OBSTACLE = 0xc5c9d1, SELECTED = 0xf5b942;

export function LabStage({ lab }: { lab: LabController }) {
  useSyncExternalStore(lab.subscribe, lab.getVersion, lab.getVersion);
  const container = useRef<HTMLDivElement>(null);
  const stage = useRef<CharacterStage | null>(null);
  const world = useRef<LabWorld | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let made: CharacterStage | null = null;
    void (async () => {
      try {
        const { createCharacterStage } = await import('@genvr/runtime/character');
        if (cancelled || !container.current) return;
        made = await createCharacterStage({ container: container.current, recipe: { ...DEFAULT_CHARACTER_RECIPE, body: 'robot' }, viewCube: true });
        if (cancelled) { made.dispose(); return; }
        made.setGrid(false);
        made.resetView();
        // Behind the robot, a little to its right and above: the course ahead is in view (board M1).
        made.setOrbit(35, 24, 11);
        stage.current = made;
        world.current = new LabWorld();
        made.setEnvironment(world.current.root);
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; made?.dispose(); stage.current = null; world.current = null; };
  }, []);

  // The playhead moves on every animation frame while a run plays.
  useEffect(() => {
    let id = 0, last = performance.now();
    const loop = (now: number) => { lab.tick(Math.min(0.1, (now - last) / 1000)); last = now; id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [lab]);

  const { course } = lab.data;
  const view = lab.view;
  const frame = lab.frameAt(view.t);
  const ghost = view.ghost?.frames[Math.min(view.ghost.frames.length - 1, Math.round(view.t * 60))] ?? null;
  const clip = frame?.clip ?? 'Idle';

  useEffect(() => { if (ready) world.current?.setCourse(course, view.selected, view.overlays.includes('measures')); }, [ready, course, view.selected, view.overlays]);
  useEffect(() => { if (ready) stage.current?.setViewMode(view.overlays.includes('skeleton') ? 'skeleton-mesh' : 'normal'); }, [ready, view.overlays]);
  useEffect(() => { const id = CLIPS.get(clip) ?? CLIPS.get('Idle'); if (ready && id) stage.current?.play(id); }, [ready, clip]);
  useEffect(() => { if (ready) world.current?.show(course, frame, ghost, view.t, view.overlays); });

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden" style={{ background: '#30343c' }}>
      <div ref={container} className="absolute inset-0" aria-label="Motion lab view: the lab robot on the course" role="img" />
      {failed ? <p role="alert" className="absolute inset-x-0 top-1/2 text-center text-sm text-white">The lab view could not start (WebGL is needed).</p> : null}
    </div>
  );
}

/** Everything around the robot, in course coordinates (metres; the course runs along +z). */
class LabWorld {
  readonly root = new Group();
  #course = new Group();
  #cars = new Group();
  #marks = new Group();
  #light: Mesh[] = [];
  #red = new Mesh(new SphereGeometry(0.11, 12, 10), new MeshBasicMaterial({ color: 0xe5484d }));
  #green = new Mesh(new SphereGeometry(0.11, 12, 10), new MeshBasicMaterial({ color: 0x3dd68c }));
  #feet: Mesh[];
  #balance: Mesh;
  #arrow: Group;
  #ghost: Group;
  #key = '';

  constructor() {
    this.root.add(this.#course, this.#cars, this.#marks);
    const dot = (color: number) => { const m = new Mesh(new CylinderGeometry(0.07, 0.07, 0.01, 20), new MeshBasicMaterial({ color })); this.#marks.add(m); return m; };
    this.#feet = [dot(0x3dd68c), dot(0x3dd68c)];
    this.#balance = new Mesh(new BoxGeometry(0.12, 0.012, 0.12), new MeshBasicMaterial({ color: 0xf5b942 }));
    this.#balance.rotation.y = Math.PI / 4;
    this.#marks.add(this.#balance);
    this.#arrow = new Group();
    const shaft = new Mesh(new BoxGeometry(0.04, 0.01, 1), new MeshBasicMaterial({ color: 0x38bdf8 }));
    shaft.position.z = 0.5;
    const head = new Mesh(new ConeGeometry(0.08, 0.2, 12), new MeshBasicMaterial({ color: 0x38bdf8 }));
    head.rotation.x = Math.PI / 2; head.position.z = 1.05;
    this.#arrow.add(shaft, head);
    this.#marks.add(this.#arrow);
    // The best version's ghost: a see-through figure on the best run's path.
    this.#ghost = new Group();
    const see = new MeshStandardMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.35, depthWrite: false });
    const body = new Mesh(new CylinderGeometry(0.17, 0.15, 0.95, 16), see); body.position.y = 1.0;
    const skull = new Mesh(new SphereGeometry(0.15, 16, 12), see); skull.position.y = 1.65;
    const legs = new Mesh(new BoxGeometry(0.3, 0.55, 0.16), see); legs.position.y = 0.28;
    this.#ghost.add(body, skull, legs);
    this.#marks.add(this.#ghost);
  }

  setCourse(course: LabCourse, selected: string | null, measures: boolean) {
    const key = JSON.stringify([course, selected, measures]);
    if (key === this.#key) return;
    this.#key = key;
    // Meshes share a few cached shapes, materials and labels, and nothing is freed: WebGPU keeps drawing a freed
    // buffer for a while after a rebuild (seen as "used in submit while destroyed").
    this.#course.clear(); this.#cars.clear();
    this.#light = [];
    const end = Math.max(course.finish_z + 6, 40);
    // Grey floor with a 1 m grid (5 m lines darker).
    const floor = block(40, 0.004, end + 10, 0, -0.004, (end - 10) / 2, 0x4a4e57);
    floor.castShadow = false;
    this.#course.add(floor, grid(end, 1, 0x5a5f6a), grid(end, 5, 0x767c88));
    for (const o of course.obstacles) if (o.kind === 'gap' && !o.hidden) this.#course.add(block(o.lane, 0.02, o.width, o.x, 0.003, o.z + o.width / 2, 0x15171c));
    // Obstacles.
    for (const b of courseBoxes(course)) {
      const color = b.id === selected ? SELECTED : OBSTACLE;
      const mesh = b.slope
        ? new Mesh(rampGeometry(b.min, b.max), material(color, 'double'))
        : block(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2], (b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2, color);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.#course.add(mesh);
    }
    if (measures) for (const o of course.obstacles) if (!o.hidden) {
      const label = text(measure(o), o.id === selected ? '#0b0d12' : '#f2f3f5', o.id === selected ? '#f5b942' : '#0b0d12e6');
      label.position.set(o.x + 2.2, labelHeight(o) + 0.35, o.z + 0.2);
      this.#course.add(label);
    }
    if (measures) for (const z of [0, 5, 10, 15, 20, 25, 30]) { const l = text(`${z} m`, '#9aa3b2'); l.position.set(-3, 0.05, z); l.scale.multiplyScalar(0.7); this.#course.add(l); }
    // Start and finish lines.
    this.#course.add(block(4, 0.01, 0.08, 0, 0.006, 0, 0xf2f3f5, 'basic'), block(4, 0.01, 0.08, 0, 0.006, course.finish_z, 0x3dd68c, 'basic'));
    // Street with its crossing and walkers' light.
    const st = course.street;
    if (st) {
      const width = st.lanes * st.lane_width;
      this.#course.add(block(80, 0.01, width, 0, 0.004, st.z + width / 2, 0x2e3138));
      for (let lane = 1; lane < st.lanes; lane++) for (let x = -40; x < 40; x += 3) this.#course.add(block(1.6, 0.012, 0.12, x + 0.8, 0.008, st.z + lane * st.lane_width, 0xd9dce1, 'basic'));
      if (st.crossing) for (let z = st.z + 0.3; z < st.z + width - 0.2; z += 0.9) this.#course.add(block(3.2, 0.012, 0.45, 0, 0.009, z + 0.22, 0xedeff2, 'basic'));
      this.#course.add(block(0.15, 3, 0.15, -2.2, 1.5, st.z - 0.5, 0x3a3f48));
      for (const [y, lamp] of [[2.95, this.#red], [2.6, this.#green]] as const) {
        lamp.position.set(-2.2, y, st.z - 0.62);
        this.#course.add(lamp); this.#light.push(lamp);
      }
      if (measures) { const l = text(`crossing · light ${st.light.cycle_s} s`); l.position.set(-2.2, 3.4, st.z - 0.5); this.#course.add(l); }
      for (const car of course.cars) {
        const g = new Group();
        g.add(block(LAB_CAR_SIZE.length, 1.1, LAB_CAR_SIZE.width, 0, 0.75, 0, car.runs_red ? 0xe5484d : 0xf59e0b),
          block(2.2, 0.6, LAB_CAR_SIZE.width - 0.2, 0.2, 1.6, 0, car.runs_red ? 0xc2363b : 0xd88a09));
        g.userData.lane = laneCentreZ(st, car.lane);
        g.name = car.id;
        this.#cars.add(g);
      }
    }
  }

  show(course: LabCourse, frame: LabFrame | null, ghost: LabFrame | null, t: number, overlays: readonly string[]) {
    const f = frame ?? { x: 0, y: 0, z: -1, tilt: 0, feet: [{ x: -0.12, y: 0, z: -1, planted: true }, { x: 0.12, y: 0, z: -0.8, planted: true }], com: [0, -1], speed: 0, clip: 'Idle', t: 0 } as LabFrame;
    // The robot stays at the origin facing the stage's −z: the world is turned half round (the course runs along
    // the robot's facing) and moves under it.
    this.root.rotation.y = Math.PI;
    this.root.position.set(f.x, -f.y, f.z);
    const feetOn = overlays.includes('feet');
    f.feet.forEach((foot, i) => {
      const m = this.#feet[i]!;
      m.visible = feetOn;
      m.position.set(foot.x, foot.y + 0.01, foot.z);
      (m.material as MeshBasicMaterial).color.setHex(foot.planted && slides(frame, i) ? 0xe5484d : 0x3dd68c);
    });
    this.#balance.visible = overlays.includes('balance');
    this.#balance.position.set(f.com[0], f.y + 0.012, f.com[1]);
    this.#arrow.visible = overlays.includes('speed') && f.speed > 0.05;
    this.#arrow.position.set(f.x, f.y + 0.03, f.z + 0.2);
    this.#arrow.scale.set(1, 1, Math.max(0.2, Math.min(3, f.speed / 1.6)));
    this.#ghost.visible = overlays.includes('ghost') && ghost !== null;
    if (ghost) this.#ghost.position.set(ghost.x + 0.9, ghost.y, ghost.z);
    const st = course.street;
    if (st) {
      const green = walkerGreen(st, t);
      (this.#light[0]?.material as MeshBasicMaterial | undefined)?.color.setHex(green ? 0x3a3f48 : 0xe5484d);
      (this.#light[1]?.material as MeshBasicMaterial | undefined)?.color.setHex(green ? 0x3dd68c : 0x3a3f48);
      for (const box of carBoxes(course, t)) {
        const g = this.#cars.getObjectByName(box.id);
        if (g) g.position.set((box.min[0] + box.max[0]) / 2, 0, g.userData.lane as number);
      }
    }
  }
}

/** A planted foot that moved since the last frame is sliding (red dot). */
const lastFeet: Array<{ x: number; z: number } | null> = [null, null];
function slides(frame: LabFrame | null, i: number): boolean {
  if (!frame) return false;
  const foot = frame.feet[i]!, before = lastFeet[i];
  lastFeet[i] = { x: foot.x, z: foot.z };
  return Boolean(before) && Math.hypot(foot.x - before!.x, foot.z - before!.z) > 0.002;
}

// Shared, never freed (see setCourse).
let unitBox: BoxGeometry | null = null;
const materials = new Map<string, Material>();
function material(color: number, kind: 'standard' | 'basic' | 'double' = 'standard'): Material {
  const key = `${kind}:${color}`;
  let m = materials.get(key);
  if (!m) {
    m = kind === 'basic' ? new MeshBasicMaterial({ color }) : new MeshStandardMaterial({ color, roughness: 0.9, ...(kind === 'double' ? { side: DoubleSide } : {}) });
    materials.set(key, m);
  }
  return m;
}
function block(w: number, h: number, d: number, x: number, y: number, z: number, color: number, kind: 'standard' | 'basic' = 'standard'): Mesh {
  unitBox ??= new BoxGeometry(1, 1, 1);
  const mesh = new Mesh(unitBox, material(color, kind));
  mesh.scale.set(Math.max(0.005, w), Math.max(0.005, h), Math.max(0.005, d));
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  return mesh;
}
const ramps = new Map<string, BufferGeometry>();
function rampGeometry(min: [number, number, number], max: [number, number, number]): BufferGeometry {
  const key = [...min, ...max].join(',');
  let g = ramps.get(key);
  if (!g) {
    g = new BufferGeometry();
    const [x0, , z0] = min, [x1, y1, z1] = max;
    const v = [x0, 0, z0, x1, 0, z0, x1, y1, z1, x0, 0, z0, x1, y1, z1, x0, y1, z1, x0, 0, z0, x0, y1, z1, x0, 0, z1, x1, 0, z0, x1, 0, z1, x1, y1, z1, x0, 0, z1, x0, y1, z1, x1, y1, z1, x0, 0, z1, x1, y1, z1, x1, 0, z1];
    g.setAttribute('position', new Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    ramps.set(key, g);
  }
  return g;
}
const grids = new Map<string, LineSegments>();
function grid(end: number, step: number, color: number): LineSegments {
  const key = `${end}:${step}`;
  let lines = grids.get(key);
  if (!lines) {
    const v: number[] = [];
    for (let x = -20; x <= 20; x += step) v.push(x, 0.001, -5, x, 0.001, end);
    for (let z = Math.ceil(-5 / step) * step; z <= end; z += step) v.push(-20, 0.001, z, 20, 0.001, z);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(v, 3));
    lines = new LineSegments(g, new LineBasicMaterial({ color, transparent: true, opacity: step > 1 ? 0.9 : 0.55 }));
    grids.set(key, lines);
  }
  return lines;
}
const labels = new Map<string, { material: SpriteMaterial; width: number }>();
function text(value: string, color = '#f2f3f5', background = '#0b0d12e6'): Sprite {
  const key = `${value}|${color}|${background}`;
  let label = labels.get(key);
  if (!label) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const font = '600 28px "IBM Plex Mono", ui-monospace, monospace';
    ctx.font = font;
    const width = Math.ceil(ctx.measureText(value).width) + 24;
    canvas.width = width; canvas.height = 44;
    ctx.font = font;
    ctx.fillStyle = background; ctx.fillRect(0, 0, width, 44);
    ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(value, 12, 23);
    label = { material: new SpriteMaterial({ map: new CanvasTexture(canvas), depthTest: false, transparent: true }), width };
    labels.set(key, label);
  }
  const sprite = new Sprite(label.material);
  sprite.scale.set(label.width / 140, 44 / 140, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export function measure(o: LabObstacle): string {
  const cm = (m: number) => `${Math.round(m * 100)} cm`;
  switch (o.kind) {
    case 'step': return `step ${cm(o.height)}`;
    case 'ramp': return `ramp ${Math.round((Math.atan2(o.rise, o.length) * 180) / Math.PI)}° · ${o.rise.toFixed(1)} m`;
    case 'gap': return `gap ${o.width.toFixed(1)} m${o.height > 0 ? ` · ${o.height.toFixed(1)} m high` : ''}`;
    case 'low_wall': return `low wall ${o.height.toFixed(1)} m`;
    case 'window': return `window ${o.opening_width.toFixed(1)} × ${o.opening_height.toFixed(1)} m · sill ${o.sill.toFixed(1)}`;
  }
}
function labelHeight(o: LabObstacle): number {
  switch (o.kind) {
    case 'step': return o.height;
    case 'ramp': return o.rise;
    case 'gap': return o.height;
    case 'low_wall': return o.height;
    case 'window': return o.wall_height;
  }
}
