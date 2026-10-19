import { LAB_STEP, LabRunSettings, type LabCourse, type LabEvent, type LabObstacle } from '@genvr/contracts';
import { courseBoxes, gapAt, groundAt, labRandom } from './course.js';
import { carBoxes, walkerGreen } from './traffic.js';

/**
 * One motion-lab run (MOTION-LAB L2): the lab robot goes along the course centre line at a fixed step (1/60 s) with a
 * seed, so the same course, settings and seed always give the same frames. Each part of the course uses a move from the
 * Moves list: the base move on the ground, Jump Forward / Long Jump over a gap, Climb over a low wall or through a window.
 *
 * Gait model v1 (honest note): the feet are placed by a stride model of the chosen move (natural speed and stride),
 * not read from the animated bones; a stride that does not fit the speed makes planted feet slide. Reading the real
 * bones is the L3 motion tool.
 */
export interface LabFoot { x: number; y: number; z: number; planted: boolean }
export interface LabFrame {
  t: number;
  /** Root (between the feet, on the ground) and the body's tilt (0 upright, 90 lying). */
  x: number; y: number; z: number; tilt: number;
  feet: [LabFoot, LabFoot];
  /** Balance point on the ground (centre of mass straight down). */
  com: [number, number];
  speed: number;
  /** The move playing (its name in the Moves list). */
  clip: string;
}
export interface LabRunResult { frames: LabFrame[]; events: LabEvent[]; settings: LabRunSettings; seed: number; end: 'finish' | 'fall' | 'car' | 'blocked' | 'time' }

/** Natural speed (m/s) and stride (m) of the ground moves the lab can use. */
export const LAB_GROUND_MOVES: Record<string, { speed: number; stride: number; clip: string }> = {
  Walk: { speed: 1.4, stride: 0.75, clip: 'Walk' },
  Run: { speed: 3.6, stride: 1.4, clip: 'Run' },
  Sneak: { speed: 0.8, stride: 0.55, clip: 'Sneak' },
  'Crouch Walk': { speed: 0.9, stride: 0.55, clip: 'Crouch Walk' },
};
const MAX_TIME = 120;
const HIP = 0.95;
const FOOT_X = 0.12;

export function simulateLabRun(course: LabCourse, input: Partial<LabRunSettings> = {}, seed = course.seed): LabRunResult {
  const s = LabRunSettings.parse(input);
  const move = LAB_GROUND_MOVES[s.motion] ?? LAB_GROUND_MOVES.Walk!;
  const rnd = labRandom(seed ^ 0x5bd1e995);
  const boxes = courseBoxes(course);
  const ground = (x: number, z: number) => groundAt(course, x, z, boxes);
  const dt = LAB_STEP;
  const events: LabEvent[] = [];
  const seen = new Set<string>();
  const event = (t: number, kind: LabEvent['kind'], label: string, obstacle?: string, once = true) => {
    const key = `${kind}:${obstacle ?? ''}`;
    if (once && seen.has(key)) return;
    seen.add(key);
    events.push({ t: round(t), kind, label, ...(obstacle ? { obstacle } : {}) });
  };
  const ordered = [...course.obstacles].filter((o) => !o.hidden && Math.abs(o.x) <= halfWidth(o)).sort((a, b) => a.z - b.z);
  // Natural stride of the move at the chosen speed; a different stride makes planted feet slide.
  const natStride = move.stride * Math.sqrt(s.speed / move.speed);
  const slipRate = Math.min(1, Math.abs(s.stride - natStride) / natStride) * 0.02 + rnd() * 0.0005;
  const lean = (s.lean_deg * Math.PI) / 180;

  let t = 0, z = -1, y = 0, vz = 0, tilt = 0, clip = move.clip;
  let mode: 'move' | 'jump' | 'climb' | 'wait' | 'fall' | 'done' = 'move';
  let end: LabRunResult['end'] = 'time';
  // Jump / climb paths: from (z0, y0) to (z1, y1) over `dur` s with an arc `peak` above the higher end.
  let path = { t0: 0, dur: 1, z0: 0, z1: 0, y0: 0, y1: 0, peak: 0, id: '', kind: '' as 'jump' | 'climb' };
  let landing = -1;
  let fallT = 0;
  // Feet: distance walked decides which foot is planted; the planted foot stays put (plus slip).
  let walked = 0;
  const feet: [LabFoot, LabFoot] = [{ x: -FOOT_X, y: 0, z: -1, planted: true }, { x: FOOT_X, y: 0, z: -1 + s.stride / 2, planted: false }];
  let lastStep = -1, swingFrom = { z: -1, y: 0 };
  const frames: LabFrame[] = [];

  const smooth = (target: number) => {
    const k = Math.min(1, dt / Math.max(s.blend_s, dt));
    vz += (target - vz) * k;
  };

  while (t <= MAX_TIME && mode !== 'done') {
    if (mode === 'move' || mode === 'wait') {
      // Street: wait at the kerb for green, then cross.
      const st = course.street;
      if (st && z < st.z && z > st.z - 1.2 && s.wait_for_green && !walkerGreen(st, t)) {
        mode = 'wait';
        event(t, 'wait', 'Waits for green at the crossing');
      } else if (mode === 'wait') mode = 'move';
      const slope = rampSlope(ordered, z);
      const target = mode === 'wait' ? 0 : s.speed * (1 - 0.35 * Math.max(0, slope));
      smooth(target);
      const nextZ = z + vz * dt;
      // What comes next on the centre line?
      const next = ordered.find((o) => o.z >= z - 0.05 && o.z <= nextZ + 0.6);
      if (next && (next.kind === 'low_wall' || next.kind === 'window') && nextZ + 0.4 >= next.z) {
        const ok = next.kind === 'low_wall' ? next.height <= 1.3 : next.opening_height >= 0.75 && next.sill <= 1.2;
        if (!ok) { event(t, 'blocked', next.kind === 'window' ? 'The window opening is too small to climb through' : 'The wall is too high to climb', next.id); end = 'blocked'; mode = 'done'; break; }
        const top = next.kind === 'low_wall' ? next.height : next.sill;
        const after = next.z + next.thickness + 0.45;
        path = { t0: t, dur: next.kind === 'window' ? 2.0 : 1.4, z0: z, z1: after, y0: y, y1: ground(0, after), peak: top + 0.1, id: next.id, kind: 'climb' };
        mode = 'climb'; clip = 'Climb';
        event(t, next.kind === 'window' ? 'window' : 'vault', next.kind === 'window' ? 'Climbs through the window' : 'Climbs over the low wall', next.id);
      } else if (next && next.kind === 'gap' && nextZ >= next.z + (s.jump_timing_ms / 1000) * vz - 0.05) {
        const length = 0.85 + 0.62 * Math.max(vz, 0.8);
        const dur = 0.5;
        const takeOff = z;
        if (gapAt(course, 0, takeOff)) { mode = 'fall'; fallT = t; end = 'fall'; event(t, 'fall', 'Stepped into the gap before jumping', next.id); }
        else {
          const lz = takeOff + length;
          path = { t0: t, dur, z0: takeOff, z1: lz, y0: y, y1: ground(0, lz), peak: Math.max(y, ground(0, lz)) + 0.45, id: next.id, kind: 'jump' };
          mode = 'jump'; clip = length > 2 ? 'Long Jump' : 'Jump Forward';
          event(t, 'gap_jump', `Jumps the ${next.width.toFixed(1)} m gap`, next.id);
        }
      } else {
        const h = ground(0, nextZ + 0.15);
        const rise = h - y;
        if (rise > 0.02 && h >= 0) {
          const limit = Math.min(s.step_height + 0.08, 0.45);
          const id = obstacleAt(ordered, nextZ + 0.15)?.id;
          if (rise > 0.45) { event(t, 'blocked', `A ${Math.round(rise * 100)} cm edge: no move for it`, id); end = 'blocked'; mode = 'done'; break; }
          if (rise > limit) {
            event(t, 'step', `Toes catch a ${Math.round(rise * 100)} cm step`, id);
            if (rise - s.step_height > 0.12) { mode = 'fall'; fallT = t; end = 'fall'; event(t, 'fall', 'Tripped on the step', id); }
          } else if (!rampSlope(ordered, nextZ + 0.15)) event(t, 'step', `Steps up ${Math.round(rise * 100)} cm`, id);
          if (rampSlope(ordered, nextZ + 0.15) > 0) event(t, 'ramp', 'Walks up the ramp', id);
        }
        if (mode !== 'fall') {
          z = nextZ;
          const g = ground(0, z);
          if (g < 0) { mode = 'fall'; fallT = t; end = 'fall'; event(t, 'fall', 'Fell into the gap', gapAt(course, 0, z)?.id); }
          else y += (g - y) * Math.min(1, dt / 0.12);
        }
        if (st && z >= st.z - 0.2) event(t, 'crossing', walkerGreen(st, t) ? 'Crosses on green' : 'Crosses on red');
      }
    }
    if (mode === 'jump' || mode === 'climb') {
      const p = Math.min(1, (t - path.t0) / path.dur);
      const eased = path.kind === 'climb' ? p * p * (3 - 2 * p) : p;
      z = path.z0 + (path.z1 - path.z0) * eased;
      const base = path.y0 + (path.y1 - path.y0) * p;
      y = base + (path.peak - Math.max(path.y0, path.y1)) * Math.sin(Math.PI * p);
      if (path.kind === 'climb') y = Math.max(base, path.peak * Math.sin(Math.PI * Math.min(1, p * 1.15)));
      vz = (path.z1 - path.z0) / path.dur;
      if (p >= 1) {
        const g = ground(0, z);
        if (g < 0) { mode = 'fall'; fallT = t; end = 'fall'; event(t, 'fall', 'Landed in the gap', path.id); }
        else {
          if (path.kind === 'jump') {
            if (g - path.y0 > 0.35) { mode = 'fall'; fallT = t; end = 'fall'; event(t, 'fall', 'Hit the edge of the landing block', path.id); }
            else { landing = t; event(t, 'land', 'Lands', path.id); }
          }
          y = g;
          if (mode !== 'fall') { mode = 'move'; clip = move.clip; walked = Math.ceil(walked / s.stride) * s.stride; }
        }
      }
    }
    if (mode === 'fall') {
      const p = Math.min(1, (t - fallT) / 0.8);
      tilt = 90 * p * p;
      const g = ground(0, z);
      if (g < 0) y = Math.max(-1, y - 9.8 * dt * p);
      vz *= 0.9;
      z += vz * dt;
      clip = 'Hard Landing';
      if (p >= 1) mode = 'done';
    }
    // Cars on the street.
    if (course.street && mode !== 'done') {
      for (const car of carBoxes(course, t)) {
        const near = 0.25;
        if (0 + near > car.min[0] && 0 - near < car.max[0] && z + near > car.min[2] && z - near < car.max[2] && y < car.max[1]) {
          event(t, 'car_hit', `Hit by ${car.id}`, undefined); end = 'car'; mode = 'fall'; fallT = t;
        } else if (Math.abs((car.min[0] + car.max[0]) / 2) < 6 && z > car.min[2] - 2 && z < car.max[2] + 2) event(t, 'car_near', `${car.id} passes close`, undefined);
      }
    }
    if (mode === 'move' && z >= course.finish_z) { event(t, 'finish', 'Reaches the finish'); end = end === 'time' ? 'finish' : end; mode = 'done'; }

    // Feet.
    const onGround = mode === 'move' || mode === 'wait';
    if (onGround) {
      walked += Math.max(0, vz) * dt;
      const k = Math.floor(walked / s.stride);
      const planted = k % 2;
      if (k !== lastStep) {
        // New step: the old swing foot lands where it is; the other foot starts to swing.
        const landingFoot = feet[planted]!;
        landingFoot.planted = true;
        landingFoot.z = Math.max(landingFoot.z, z - 0.02);
        landingFoot.y = Math.max(0, ground(landingFoot.x, landingFoot.z));
        const swing = feet[1 - planted]!;
        swing.planted = false;
        swingFrom = { z: swing.z, y: swing.y };
        lastStep = k;
        if (!seen.has('start')) event(t, 'start', `${s.motion} · ${s.speed.toFixed(1)} m/s`);
      }
      const plantedFoot = feet[planted]!;
      // Slip: a stride that does not fit the speed drags the planted foot forward.
      plantedFoot.z += Math.max(0, vz) * dt * slipRate * (landing >= 0 && t - landing < 0.25 ? 6 * (1 - Math.min(1, s.blend_s / 0.35)) + 1 : 1);
      const swing = feet[1 - planted]!;
      const phase = (walked - k * s.stride) / s.stride;
      const targetZ = z + s.stride / 2;
      swing.z = swingFrom.z + (targetZ - swingFrom.z) * phase;
      const gTarget = Math.max(0, ground(swing.x, targetZ));
      const under = Math.max(0, ground(swing.x, swing.z));
      const lift = s.step_height * Math.sin(Math.PI * phase);
      // The foot clears what is under it by its lift; a step higher than the lift catches the toes (that depth is the penetration).
      const rise = Math.max(0, Math.max(under, gTarget) - swingFrom.y);
      swing.y = Math.max(swingFrom.y + (gTarget - swingFrom.y) * phase + lift * 0.5, under - Math.max(0, rise - s.step_height));
      if (vz < 0.05) swing.y = under;
      plantedFoot.y = Math.max(plantedFoot.y, Math.max(0, ground(plantedFoot.x, plantedFoot.z)));
    } else {
      for (const f of feet) { f.planted = false; f.z = z + (f.x < 0 ? -0.1 : 0.1); f.y = mode === 'fall' ? y : Math.max(y + 0.05, ground(f.x, f.z) + 0.02); }
    }
    const comZ = z + Math.sin(lean) * HIP * 0.5 + (mode === 'fall' ? Math.sin((tilt * Math.PI) / 180) * HIP : 0);
    const shown = (mode === 'move' || mode === 'wait') && vz < 0.05 ? 'Idle' : clip;
    frames.push({ t: round(t), x: 0, y: round(y), z: round(z), tilt: round(tilt), feet: [{ ...feet[0] }, { ...feet[1] }] as [LabFoot, LabFoot], com: [0, round(comZ)], speed: round(vz), clip: shown });
    t += dt;
  }
  if (mode !== 'done' && end === 'time') event(t, 'blocked', 'Ran out of time');
  return { frames, events, settings: s, seed, end };
}

function halfWidth(o: LabObstacle): number {
  switch (o.kind) {
    case 'gap': return o.lane / 2;
    case 'window': return o.wall_width / 2;
    default: return o.width / 2;
  }
}
function obstacleAt(list: LabObstacle[], z: number): LabObstacle | undefined {
  return list.find((o) => z >= o.z - 0.05 && z <= o.z + extent(o) + 0.05);
}
function extent(o: LabObstacle): number {
  switch (o.kind) {
    case 'step': return o.depth;
    case 'ramp': return o.length + o.top;
    case 'gap': return o.width + o.landing_depth;
    case 'low_wall': case 'window': return o.thickness;
  }
}
function rampSlope(list: LabObstacle[], z: number): number {
  const r = list.find((o) => o.kind === 'ramp' && z >= o.z && z <= o.z + o.length);
  return r && r.kind === 'ramp' ? r.rise / r.length : 0;
}
function round(n: number): number { return Math.round(n * 10000) / 10000; }
