import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Raycaster,
  RingGeometry,
  Triangle,
  Vector2,
  Vector3,
  type PerspectiveCamera,
  type Scene,
} from 'three/webgpu';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MUSCLE_PART_COLOURS, MUSCLE_PARTS } from '@genvr/contracts';
import { findBody } from '@genvr/core-library';
import { loadHumanData } from './human/body.js';
import { HUMAN_PRESETS, fitJoints, generateHuman, mixHuman } from './human/generate.js';
import { limitPose, poseBody, poseProblems, poseRest, relaxShoulders, skinNeighbours, type PaintPoseValues, type PoseSkeleton } from './human/paint-pose.js';
import { createPaintRaster, paintedPart, type MusclePaint, type PaintStroke } from './human/paint.js';

/**
 * The muscle paint tool (owner, 2026-10-05): the default boy with the baked muscle map underneath and the painted
 * strokes on top. Left drag paints with the brush, right drag orbits, the wheel zooms. The arms can be lowered,
 * raised and bent (owner: paint under the arm and round the elbow); the pose is only for the view - every stroke is
 * stored on the A-pose body (`human/paint.ts`), the same format an agent writes, so the bake does not change.
 */
export interface PaintBrush {
  /** The muscle part (contracts MUSCLE_PARTS), or null to erase. */
  part: string | null;
  /** Brush radius in cm. */
  radius: number;
  strength: number;
  mirror: boolean;
}

export interface MusclePaintMode {
  setBrush(brush: PaintBrush): void;
  /** Turns the view to a muscle (his left side's, for a muscle on both sides) and frames it (owner: "click it, go there"). */
  focusPart(part: string): void;
  /** Turns the view to the skin led by these bones (his left side's) and frames it, e.g. ['LeftHand'] for the fingers. */
  focusBones(bones: readonly string[]): void;
  /** The view pose (`human/paint-pose.ts` controls, clamped to the joint law); strokes stay on the A-pose body. */
  setPose(values: PaintPoseValues): void;
  /** The A-pose's own values of the controls that do not start at 0 (arm up, arm to the front, elbow bend). */
  poseRest: Readonly<Record<string, number>>;
  /** The asked slider values, stopped at the last pose the joint law allows, and what the result breaks. */
  limitPose(values: PaintPoseValues, asked: Readonly<Record<string, number>>): { values: PaintPoseValues; problems: string[] };
  /** What breaks the joint law in a pose (empty: fine). */
  poseProblems(values: PaintPoseValues): string[];
  paint(): MusclePaint;
  undo(): void;
  clear(): void;
  onChange(listener: (paint: MusclePaint) => void): () => void;
  dispose(): void;
}

const GREY = new Color(0x5c6068);
const hex = (colour: string) => new Color(colour);

export async function startMusclePaint({
  scene,
  camera,
  controls,
  canvas,
  paint: first,
}: {
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  canvas: HTMLCanvasElement;
  paint: MusclePaint;
}): Promise<MusclePaintMode> {
  const data = await loadHumanData(findBody('human').model!);
  const body = generateHuman(data, 'anime', 'boy')!;
  const count = body.positions.length / 3;
  // Only skin and shorts (no eyes or lashes): their triangles.
  const triangles = body.triangles.filter((_, i, all) => {
    const t = i - (i % 3);
    return [all[t]!, all[t + 1]!, all[t + 2]!].every((v) => body.region[v]! < 2);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(body.positions, 3));
  geometry.setIndex(new BufferAttribute(Uint32Array.from(triangles), 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  // The A-pose normals: strokes and the muscle map always live on the A-pose body, whatever the view pose.
  const restNormals = Float32Array.from(geometry.getAttribute('normal').array as Float32Array);
  const colours = new Float32Array(count * 3);
  geometry.setAttribute('color', new BufferAttribute(colours, 3));
  const mesh = new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  mesh.name = 'muscle-paint';
  const wire = new Mesh(
    (() => {
      const lines = new BufferGeometry();
      lines.setAttribute('position', geometry.getAttribute('position'));
      lines.setIndex(new BufferAttribute(body.quadEdges, 1));
      return lines;
    })(),
    new MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.07 }),
  );
  const cursor = new Mesh(
    new RingGeometry(0.9, 1, 48),
    new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide, transparent: true, opacity: 0.9, depthTest: false }),
  );
  cursor.renderOrder = 20;
  cursor.visible = false;
  scene.add(mesh, wire, cursor);

  // The baked part of each vertex (map.regions z = 1 + part index), dimmed under the paint.
  const baked = new Uint8Array(count);
  {
    const regions = data.targets.get('map.regions');
    for (let i = 0; i < (regions?.indices.length ?? 0); i += 1) {
      const v = regions!.indices[i]!;
      if (v < count) baked[v] = Math.round(regions!.deltas[i * 3 + 2]!);
    }
  }
  const partColour = new Map(MUSCLE_PARTS.map((part) => [part as string, hex(MUSCLE_PART_COLOURS[part])]));
  const cm = (v: number) =>
    [body.positions[v * 3]! * 100, body.positions[v * 3 + 1]! * 100, body.positions[v * 3 + 2]! * 100] as const;
  const nrm = (v: number) => [restNormals[v * 3]!, restNormals[v * 3 + 1]!, restNormals[v * 3 + 2]!] as const;

  // The view pose (joint law clamped, `human/paint-pose.ts`): linear blend skinning about the mesh's own joints.
  const rest = Float32Array.from(body.positions);
  const posed = geometry.getAttribute('position') as BufferAttribute;
  const mixed = mixHuman(data, HUMAN_PRESETS['anime:boy']!);
  const floor = mixed[1]! - body.positions[1]!;
  const fitted = new Map(fitJoints(data, mixed).map((j) => [j.name, [j.at[0], j.at[1] - floor, j.at[2]] as [number, number, number]]));
  const names = body.joints.map((j) => j.name);
  const skeleton: PoseSkeleton = {
    names,
    parents: body.joints.map((j) => (j.parent ? names.indexOf(j.parent) : -1)),
    pivots: names.map((name) => fitted.get(name)!),
  };
  // Pose correctives: the shoulder and armpit skin solved again after the bones (`relaxShoulders`).
  const neighbours = skinNeighbours(body.triangles, body.region, count);
  const turns = new Float32Array(count * 4);
  const setPose = (values: PaintPoseValues) => {
    poseBody(rest, body.skinIndex, body.skinWeight, skeleton, values, posed.array as Float32Array, undefined, turns);
    relaxShoulders(rest, posed.array as Float32Array, turns, neighbours, skeleton, values);
    posed.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
  };

  let paint: MusclePaint = { ...first, strokes: [...first.strokes] };
  let brush: PaintBrush = { part: 'biceps', radius: 2, strength: 1, mirror: true };
  const listeners = new Set<(paint: MusclePaint) => void>();
  /** The part each vertex shows (1 + MUSCLE_PARTS index; 0 none), painted or baked: what `focusPart` looks for. */
  const shownPart = new Uint8Array(count);
  // Built once; a brush adds only its own dabs (repainting every stroke per mouse move froze the 111k body).
  const raster = createPaintRaster(count, cm, nrm);
  const c = new Color();
  const colourVertex = (v: number) => {
    const shown = paintedPart(raster.painted.get(v));
    shownPart[v] = shown ? (shown.part ? MUSCLE_PARTS.indexOf(shown.part as (typeof MUSCLE_PARTS)[number]) + 1 : 0) : baked[v]!;
    if (shown) {
      if (shown.part) c.copy(GREY).lerp(partColour.get(shown.part) ?? GREY, Math.min(1, 0.6 + shown.weight));
      else c.copy(GREY);
    } else {
      const part = MUSCLE_PARTS[baked[v]! - 1];
      c.copy(GREY);
      if (part) c.lerp(partColour.get(part)!, 0.22);
    }
    colours.set([c.r, c.g, c.b], v * 3);
  };
  /** Every stroke painted again (start, undo, clear). */
  const recolour = () => {
    raster.reset();
    for (const one of paint.strokes) raster.stroke(one);
    for (let v = 0; v < count; v += 1) colourVertex(v);
    (geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
  };
  recolour();

  // A drag that starts on the body paints; a drag on the background turns the view (as everywhere else).
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const hit = (event: { clientX: number; clientY: number }) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(mesh, false)[0];
  };
  let stroke: PaintStroke | null = null;
  /** Where the pointer was at the stroke's last event (screen pixels). */
  let lastAt: { clientX: number; clientY: number } | null = null;
  const showCursor = (point: Vector3, face: Vector3) => {
    cursor.visible = true;
    cursor.position.copy(point).addScaledVector(face, 0.002);
    cursor.lookAt(point.clone().add(face));
    cursor.scale.setScalar(brush.radius / 100);
  };
  const addPoint = (event: PointerEvent) => {
    // A fast drag sends few move events: fill the path between them every few pixels, so a stroke is a line of dabs
    // on the skin and not a few separate spots (seen when an agent dragged the mouse: 3 points per stroke).
    const from = stroke ? lastAt : null;
    const steps = from ? Math.min(200, Math.floor(Math.hypot(event.clientX - from.clientX, event.clientY - from.clientY) / 3)) : 0;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / (steps + 1);
      paintAt({ clientX: from!.clientX + (event.clientX - from!.clientX) * t, clientY: from!.clientY + (event.clientY - from!.clientY) * t });
    }
    paintAt(event);
    if (stroke) lastAt = { clientX: event.clientX, clientY: event.clientY };
  };
  const paintAt = (event: { clientX: number; clientY: number }) => {
    const found = hit(event);
    if (!found?.face) {
      cursor.visible = false;
      return;
    }
    const n = found.face.normal.clone().normalize();
    showCursor(found.point, n);
    if (!stroke) return;
    // Back to the A-pose body: the same spot of the hit triangle there, with its A-pose normal.
    const { a, b, c } = found.face;
    const at = (v: number, from: ArrayLike<number>) => new Vector3(from[v * 3]!, from[v * 3 + 1]!, from[v * 3 + 2]!);
    const live = posed.array as Float32Array;
    const weights = new Triangle(at(a, live), at(b, live), at(c, live)).getBarycoord(found.point, new Vector3());
    if (!weights) return;
    const blend = (from: ArrayLike<number>) =>
      at(a, from).multiplyScalar(weights.x).add(at(b, from).multiplyScalar(weights.y)).add(at(c, from).multiplyScalar(weights.z));
    const point = blend(rest);
    const face = blend(restNormals).normalize();
    const p = [point.x * 100, point.y * 100, point.z * 100, face.x, face.y, face.z] as PaintStroke['points'][number];
    const last = stroke.points[stroke.points.length - 1];
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) < brush.radius * 0.3) return;
    stroke.points.push(p);
    // Only this dab (and its mirror) on top of what is painted: the latest stroke wins, as in the bake.
    const touched = new Set<number>();
    raster.point(stroke, p, touched);
    for (const v of touched) colourVertex(v);
    (geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || !hit(event)) return;
    // Ours, not the orbit controls' (they listen on the same canvas).
    event.stopImmediatePropagation();
    controls.enabled = false;
    canvas.setPointerCapture(event.pointerId);
    stroke = { part: brush.part, radius: brush.radius, strength: brush.strength, mirror: brush.mirror, points: [] };
    paint.strokes.push(stroke);
    lastAt = null;
    addPoint(event);
  };
  const up = () => {
    controls.enabled = true;
    if (!stroke) return;
    if (!stroke.points.length) paint.strokes.pop();
    stroke = null;
    lastAt = null;
    for (const listener of listeners) listener(paint);
  };
  // The wheel zooms to where the cursor points (owner: zoom onto the arm, not the body's middle).
  const zoomedToCursor = controls.zoomToCursor;
  controls.zoomToCursor = true;
  canvas.addEventListener('pointerdown', down, { capture: true });
  canvas.addEventListener('pointermove', addPoint);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointerleave', () => (cursor.visible = false));

  /** Turns the view to these vertices (where they face from) and frames them. */
  const frame = (ids: number[]) => {
    if (!ids.length) return;
    const live = posed.array as Float32Array;
    const normals = geometry.getAttribute('normal');
    const centre = new Vector3();
    const facing = new Vector3();
    for (const v of ids) {
      centre.x += live[v * 3]! / ids.length;
      centre.y += live[v * 3 + 1]! / ids.length;
      centre.z += live[v * 3 + 2]! / ids.length;
      facing.x += normals.getX(v);
      facing.y += normals.getY(v);
      facing.z += normals.getZ(v);
    }
    let radius = 0;
    for (const v of ids) radius = Math.max(radius, centre.distanceTo(new Vector3(live[v * 3]!, live[v * 3 + 1]!, live[v * 3 + 2]!)));
    // A closed shape (a whole hand) faces every way: look from his front and that side instead, a little from above.
    if (facing.length() < ids.length * 0.25) facing.set(centre.x * 2, 0.3, 1);
    facing.normalize();
    // From where the muscle faces, far enough to frame it with some body round it.
    const distance = Math.max(0.35, (radius * 2.6) / Math.tan((camera.fov * Math.PI) / 360));
    const fromTarget = controls.target.clone();
    const fromCamera = camera.position.clone();
    const toCamera = centre.clone().addScaledVector(facing, distance);
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / 450);
      const e = t * t * (3 - 2 * t);
      controls.target.lerpVectors(fromTarget, centre, e);
      camera.position.lerpVectors(fromCamera, toCamera, e);
      controls.update();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  return {
    setBrush(next) {
      brush = next;
    },
    setPose,
    focusPart(part) {
      const id = MUSCLE_PARTS.indexOf(part as (typeof MUSCLE_PARTS)[number]) + 1;
      if (!id) return;
      const live = posed.array as Float32Array;
      // His left side's copy when there is one (a mirrored muscle's middle would be inside the body).
      let ids = [...shownPart.keys()].filter((v) => shownPart[v] === id && live[v * 3]! > 0.005);
      if (ids.length < 8) ids = [...shownPart.keys()].filter((v) => shownPart[v] === id);
      frame(ids);
    },
    focusBones(bones) {
      // A name ending in * takes every bone starting with it (LeftHand* = the hand and all its fingers).
      const wanted = new Set(
        body.joints.flatMap((joint, j) =>
          bones.some((name) => (name.endsWith('*') ? joint.name.startsWith(name.slice(0, -1)) : joint.name === name)) ? [j] : [],
        ),
      );
      const leads = (v: number) => {
        let best = 0;
        for (let k = 1; k < 4; k += 1) if (body.skinWeight[v * 4 + k]! > body.skinWeight[v * 4 + best]!) best = k;
        return body.skinIndex[v * 4 + best]!;
      };
      const ids: number[] = [];
      for (let v = 0; v < count; v += 1) if (body.region[v]! < 2 && wanted.has(leads(v))) ids.push(v);
      frame(ids);
    },
    poseRest: poseRest(skeleton),
    limitPose: (values, asked) => limitPose(skeleton, values, asked),
    poseProblems: (values) => poseProblems(skeleton, values),
    paint: () => paint,
    undo() {
      paint.strokes.pop();
      recolour();
      for (const listener of listeners) listener(paint);
    },
    clear() {
      paint = { ...paint, strokes: [] };
      recolour();
      for (const listener of listeners) listener(paint);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      canvas.removeEventListener('pointerdown', down, { capture: true });
      canvas.removeEventListener('pointermove', addPoint);
      canvas.removeEventListener('pointerup', up);
      controls.enabled = true;
      controls.zoomToCursor = zoomedToCursor;
      scene.remove(mesh, wire, cursor);
      geometry.dispose();
      wire.geometry.dispose();
      cursor.geometry.dispose();
      for (const one of [mesh, wire, cursor]) (one.material as MeshBasicMaterial).dispose();
    },
  };
}
