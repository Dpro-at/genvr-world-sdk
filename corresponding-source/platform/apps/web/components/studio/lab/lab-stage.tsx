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
import { DEFAULT_CHARACTER_RECIPE, type LabCourse, type LabObstacle, type LabProp, type LabStation } from '@genvr/contracts';
import { CORE_ANIMATIONS } from '@genvr/core-library';
import { carBoxes, courseBoxes, fittedHeight, graspObjects, labClipPose, labMadeMotionPace, labPoseAt, laneCentreZ, stationParts, stationToWorld, LAB_CAR_SIZE, STATION_REFERENCE_HIP, walkerGreen, type LabFrame, type LabRunResult, type StationPart, type StationRunResult } from '@genvr/runtime';
import type { CharacterStage } from '@genvr/runtime/character';
import { labClipTime, type LabController } from '../../../lib/motion-lab';
import { LabPoseOverlay } from './lab-pose';

/**
 * The lab's 3D view (boards M1, M3): the Standard robot stands at the centre of the character stage and plays the move
 * of each moment; the grey floor with its 1 m grid, the measured obstacles, the street with its light and box cars and
 * the debug marks are one group that moves under the robot, so the camera always follows it.
 */
const CLIPS = new Map(CORE_ANIMATIONS.map((a) => [a.manifest.name, a.clip]));
const OBSTACLE = 0xc5c9d1, SELECTED = 0xf5b942;
/** Board M18: station parts by what they are made of. */
const SURFACE: Record<NonNullable<StationPart['surface']>, number> = { sand: 0xd8c08a, water: 0x3b82f6, wet: 0x6b7280, mat: 0x2f5fb3, wood: 0xa97c50, metal: 0x9ca3af, belt: 0x27272a };
const PROP = 0xf2f3f5;
/** Behind the character, a little to its right and above (azimuth from +z, elevation, distance). */
const LAB_ORBIT = [215, 24, 11] as const;
/** In front of the character and to his right, close enough to pick joints. */
const POSE_ORBIT = [-35, 12, 5.5] as const;

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
        // Behind the robot, a little to its right and above: the course ahead is in view (board M1). The robot faces
        // +z with its right side at −x, so behind-right is 180° + 35° from +z.
        made.setOrbit(...LAB_ORBIT);
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
  // Board M11: in Pose the character stands at the start holding the open made motion's pose on the pose frame.
  const posing = view.mode === 'pose' && Boolean(lab.openMotion);
  const frame = posing ? null : lab.frameAt(view.t);
  const ghost = view.ghost?.frames[Math.min(view.ghost.frames.length - 1, Math.round(view.t * 60))] ?? null;
  // During a run the move's clip follows the run itself (feet keep pace with the floor at any speed, slow motion,
  // pause and seeking); at the end of the run the robot stands in Idle instead of walking on the spot.
  const frames = view.run?.result.frames;
  const finished = Boolean(frames?.length) && !view.playing && view.t >= lab.duration() - 1e-6;
  const driven = Boolean(frames?.length) && !finished;
  const clip = finished ? 'Idle' : frame?.clip ?? 'Idle';
  // A run of a made motion shows its keys: the clip time from the run (paced by the motion's own feet) on its frames.
  const madeInRun = !posing && driven && frame ? lab.madeMotion(frame.clip) : undefined;
  const runMove = madeInRun ? { [madeInRun.name]: { ...labMadeMotionPace(madeInRun), clip: madeInRun.name } } : {};
  const heldPose = posing ? lab.poseAt(view.pose.frame)
    : madeInRun && frames ? labPoseAt(madeInRun, (labClipTime(frames, view.t * 60, lab.legScale, runMove) * 60) % madeInRun.frames) : null;

  useEffect(() => { if (ready) world.current?.setCourse(course, view.selected, view.overlays.includes('measures')); }, [ready, course, view.selected, view.overlays]);

  // Board M17: the stage shows who runs (the Avatar tab's character or the one picked in the Lab).
  const who = lab.character.id;
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    void lab.characterBody(who).then((body) => { if (live && stage.current) {
      // A new body resets the stage's camera to the front: put the Lab's view back behind the character.
      stage.current.setRecipe({ ...DEFAULT_CHARACTER_RECIPE, body }); stage.current.setOrbit(...LAB_ORBIT); setShown(who);
    } }).catch(() => { if (live) setShown(null); });
    return () => { live = false; };
  }, [ready, who, lab]);
  useEffect(() => { const id = CLIPS.get(clip) ?? CLIPS.get('Idle'); if (ready && id) stage.current?.play(id); }, [ready, clip, shown]);
  // Pose (board M11) looks at the character from close, in front and to his right; the run view goes back behind him.
  useEffect(() => {
    if (!ready || !stage.current) return;
    if (posing) { stage.current.frameAvatar('full'); stage.current.setOrbit(...POSE_ORBIT); } else { stage.current.resetView(); stage.current.setOrbit(...LAB_ORBIT); }
  }, [ready, posing, shown]);
  // Again after a character swap: the new body starts in the stage's own view mode.
  useEffect(() => { if (ready) stage.current?.setViewMode(view.overlays.includes('skeleton') ? 'skeleton-mesh' : 'normal'); }, [ready, view.overlays, shown]);
  useEffect(() => {
    if (!ready || !stage.current) return;
    stage.current.setPaused(driven || posing);
    if (driven && frames && !madeInRun) stage.current.setClipTime(labClipTime(frames, view.t * 60, lab.legScale));
    if (heldPose) { const { bones, root } = labClipPose(heldPose); stage.current.setHeldPose({ bones, root: root.map((m) => m * lab.legScale) }); }
    else stage.current.setHeldPose(null);
  });
  useEffect(() => { if (ready) world.current?.show(course, frame, ghost, view.t, view.overlays, view.run?.result ?? null, lab.legScale); });

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden" style={{ background: '#30343c' }}>
      <div ref={container} className="absolute inset-0" aria-label={`Motion lab view: ${lab.character.name} on the course`} role="img" />
      {posing && ready && stage.current ? <LabPoseOverlay lab={lab} stage={stage.current} /> : null}
      {failed ? <p role="alert" className="absolute inset-x-0 top-1/2 text-center text-sm text-white">The lab view could not start (WebGL is needed).</p> : null}
    </div>
  );
}

/** Everything around the robot, in course coordinates (metres; the course runs along +z). */
class LabWorld {
  readonly root = new Group();
  #course = new Group();
  #cars = new Group();
  /** Board M18: objects on stations, moved along a station run's object tracks. */
  #props = new Group();
  /** Objects a station run brings itself (the conveyor's), made once per run. */
  #spawned = new Group();
  #spawnedFor: StationRunResult | null = null;
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
    this.root.add(this.#course, this.#cars, this.#marks, this.#props, this.#spawned);
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
    this.#course.clear(); this.#cars.clear(); this.#props.clear();
    this.#light = [];
    const end = Math.max(course.finish_z + 6, 40);
    // Grey floor with a 1 m grid (5 m lines darker).
    // Stations stand beside the course (the base yard is at x 4 … 46 m): the floor reaches them.
    const right = Math.max(20, ...course.stations.map((st) => Math.ceil(st.x + 16)));
    const floor = block(right + 23, 0.004, end + 10, (right - 23) / 2, -0.004, (end - 10) / 2, 0x4a4e57);
    floor.castShadow = false;
    this.#course.add(floor, grid(end, 1, 0x5a5f6a, right), grid(end, 5, 0x767c88, right));
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
    // Training stations (board M18): their parts, turned with the station, and the objects on them.
    for (const station of course.stations) if (!station.hidden) {
      for (const part of stationParts(station)) {
        const at = stationToWorld(station, part.center);
        const color = station.id === selected ? SELECTED : part.surface ? SURFACE[part.surface] : OBSTACLE;
        const mesh = block(part.size[0], part.size[1], part.size[2], at[0], at[1], at[2], color);
        mesh.rotation.y = (station.turn * Math.PI) / 180;
        // Water lies under the yard floor: its surface is drawn at floor level so the pool shows.
        if (part.surface === 'water') { mesh.material = waterMaterial(); mesh.scale.y = 0.02; mesh.position.y = 0.012; }
        mesh.castShadow = part.surface !== 'water';
        this.#course.add(mesh);
      }
      if (measures) { const l = text(stationName(station), station.id === selected ? '#0b0d12' : '#f2f3f5', station.id === selected ? '#f5b942' : '#0b0d12e6'); const at = stationToWorld(station, [0, 2.2, 0.5]); l.position.set(at[0], at[1], at[2]); this.#course.add(l); }
    }
    for (const prop of course.props) {
      const station = course.stations.find((s) => s.id === prop.on);
      if (!station || station.hidden) continue;
      const mesh = propMesh(prop);
      mesh.rotation.y = (station.turn * Math.PI) / 180;
      mesh.name = prop.id;
      this.#props.add(mesh);
    }
    this.#restProps(course, STATION_REFERENCE_HIP);
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

  /** Objects where they rest on their stations (tables and the bench fitted to the character's hip height). */
  #restProps(course: LabCourse, hip: number) {
    for (const station of course.stations) {
      const rest = station.kind === 'grasp_table' ? graspObjects(station, course.props, hip).map((o) => [o.prop.id, o.at] as const)
        : course.props.filter((p) => p.on === station.id).map((p) => [p.id, stationToWorld(station, [p.at[0], ('height' in station ? fittedHeight(station as LabStation & { height: number }, hip) : 0.5) + p.size_m[1] / 2, 0.3 + p.at[1]])] as const);
      for (const [id, at] of rest) this.#props.getObjectByName(id)?.position.set(...at);
    }
  }

  show(course: LabCourse, frame: LabFrame | null, ghost: LabFrame | null, t: number, overlays: readonly string[], result: LabRunResult | null = null, legScale = 1) {
    const f = frame ?? { x: 0, y: 0, z: -1, tilt: 0, feet: [{ x: -0.12, y: 0, z: -1, planted: true }, { x: 0.12, y: 0, z: -0.8, planted: true }], com: [0, -1], speed: 0, clip: 'Idle', t: 0 } as LabFrame;
    // The robot stays at the origin facing the stage's +z (the character stage's front, towards its camera); the
    // course runs along +z too, so it lies ahead of the robot, and the world moves under it. On a station (board M18)
    // the world also turns, so the character faces the way it runs or the table it works at.
    const station = result && 'heading' in result ? result as StationRunResult : null, h = ((station?.heading ?? 0) * Math.PI) / 180;
    this.root.rotation.y = -h;
    this.root.position.set(-(f.x * Math.cos(h) - f.z * Math.sin(h)), -f.y, -(f.x * Math.sin(h) + f.z * Math.cos(h)));
    if (station !== this.#spawnedFor) {
      this.#spawned.clear(); this.#spawnedFor = station;
      for (const prop of station?.spawned ?? []) { const mesh = propMesh(prop); mesh.name = prop.id; this.#spawned.add(mesh); }
    }
    if (station?.objects.length) {
      const i = Math.max(0, Math.min(station.frames.length - 1, Math.round(t * 60)));
      for (const track of station.objects) { const at = track.at[Math.min(i, track.at.length - 1)]; if (at) (this.#props.getObjectByName(track.id) ?? this.#spawned.getObjectByName(track.id))?.position.set(...at); }
    } else this.#restProps(course, STATION_REFERENCE_HIP * legScale);
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
/** The floor's grid: x −20 … 20 m, and on to `right` m when the course has stations beside it (board M18). */
function grid(end: number, step: number, color: number, right = 20): LineSegments {
  const key = `${end}:${step}:${right}`;
  let lines = grids.get(key);
  if (!lines) {
    const v: number[] = [];
    for (let x = -20; x <= right; x += step) v.push(x, 0.001, -5, x, 0.001, end);
    for (let z = Math.ceil(-5 / step) * step; z <= end; z += step) v.push(-20, 0.001, z, right, 0.001, z);
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

let sphere: SphereGeometry | null = null, cylinder: CylinderGeometry | null = null, water: Material | null = null;
const unitSphere = () => (sphere ??= new SphereGeometry(0.5, 18, 12));
const unitCylinder = () => (cylinder ??= new CylinderGeometry(0.5, 0.5, 1, 18));
const waterMaterial = () => (water ??= new MeshStandardMaterial({ color: SURFACE.water, transparent: true, opacity: 0.55, roughness: 0.2, depthWrite: false }));
/** An object's shape and colour by what it is made of. */
function propMesh(prop: LabProp): Mesh {
  const color = prop.material === 'wood' ? 0xa97c50 : prop.material === 'card' ? 0xc8a46e : prop.material === 'metal' ? 0x9ca3af : PROP;
  const mesh = new Mesh(prop.shape === 'sphere' ? unitSphere() : prop.shape === 'cylinder' ? unitCylinder() : (unitBox ??= new BoxGeometry(1, 1, 1)), material(color));
  mesh.scale.set(...prop.size_m);
  mesh.castShadow = true;
  return mesh;
}
const STATION_NAMES: Record<LabStation['kind'], string> = { jump_pit: 'Jump pit', high_bar: 'High bar', hurdles: 'Hurdles', pool: 'Pool', climb_wall: 'Climbing wall', ladder: 'Ladder',
  grasp_table: 'Grasp table', conveyor: 'Conveyor', tool_bench: 'Tool bench', weapon_rack: 'Weapons rack', target_post: 'Target post' };
/** A station's name and main sizes, as its label and in the course list. */
export function stationName(s: LabStation): string {
  const m = (v: number) => `${v} m`;
  switch (s.kind) {
    case 'jump_pit': return `${STATION_NAMES[s.kind]} · runway ${m(s.runway_length)} · board ${m(s.board_gap)}`;
    case 'high_bar': return `${STATION_NAMES[s.kind]} · ${m(s.height)}`;
    case 'hurdles': return `${STATION_NAMES[s.kind]} · ${s.count} × ${m(s.height)}`;
    case 'pool': return `${STATION_NAMES[s.kind]} · ${s.length} × ${m(s.width)}`;
    case 'climb_wall': return `${STATION_NAMES[s.kind]} · ${m(s.height)}`;
    case 'ladder': return `${STATION_NAMES[s.kind]} · ${m(s.height)}`;
    case 'grasp_table': return `${STATION_NAMES[s.kind]} · ${m(s.height)}`;
    case 'conveyor': return `${STATION_NAMES[s.kind]} · ${s.speed_mps} m/s`;
    case 'tool_bench': return `${STATION_NAMES[s.kind]} · ${s.tools.length} tools`;
    case 'weapon_rack': return `${STATION_NAMES[s.kind]} · ${s.weapons.length} props`;
    case 'target_post': return `${STATION_NAMES[s.kind]} · ${s.pads} pads`;
  }
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
