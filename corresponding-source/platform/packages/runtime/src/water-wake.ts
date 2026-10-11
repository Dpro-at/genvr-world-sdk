import { type Node, Vector4, TSL } from 'three/webgpu';

const { float, exp, max, sin, uniform, uniformArray, vec2 } = TSL;

/**
 * The wake a swimmer leaves on the water (P2-39 follow-up, owner request 2026-09-28).
 *
 * It is not drawn as a V. It is built the way a wake actually forms: every point a body passes
 * sends out a ring, and the V everyone recognises is the envelope of all those rings (Huygens).
 * Drop a ring behind the swimmer every so often, let each one spread and fade, and the V appears
 * on its own, along with the crossing pattern inside it.
 *
 * The one number that matters is how fast a ring spreads. On deep water a wave group travels at
 * half the speed of its crests, and working the envelope out from that gives a half-angle of
 * arcsin(1/3), about 19.5 degrees, **whatever the speed** - a famously constant angle, the same
 * for a duck and for a ship. The same angle comes out here by making each ring spread at a third
 * of the speed the swimmer had when it was dropped, so the V stays correct at any speed without
 * the angle being written down anywhere.
 *
 * Every device works this out for itself from positions it already has, for its own player and
 * for the others, so nothing about the wake is ever sent over the network.
 */

/** Rings kept at once; the oldest is replaced. */
export const MAX_RINGS = 24;
/** Meters a swimmer travels between one ring and the next. */
export const RING_SPACING = 0.45;
/** Seconds a ring lasts before it has faded to nothing. */
export const RING_LIFE = 4.5;
/** A ring spreads at this share of the speed that dropped it: 1/3 is what gives the 19.5 degrees. */
export const SPREAD_SHARE = 1 / 3;
/** Slowest a ring ever spreads (m/s), so treading water still makes rings. */
const MIN_SPREAD = 0.18;
/** Crests per meter across a ring. */
const RING_WAVES = 2.6;
/** How tightly a ring hugs its own radius. Smaller means a wider, more visible band. */
const RING_BAND = 0.9;
/** How high a ring stands at the moment it is dropped (m). */
const RING_HEIGHT = 0.13;
/** How much white the crest of a ring carries. A real wake is seen as its bright lines far more
 * than as its height, so without this the V is there in the maths and invisible on the water. */
const RING_FOAM = 0.55;
/** Meters around the swimmer that turn to white water. */
const FOAM_RADIUS = 0.75;

/** The half-angle of the V behind anything moving on deep water, in degrees. */
export const KELVIN_DEGREES = (Math.asin(SPREAD_SHARE) * 180) / Math.PI;

/** One ring: where it was dropped, when, and how fast the swimmer was going. */
export interface Ring {
  x: number;
  z: number;
  /** Seconds on the runtime clock. */
  born: number;
  /** The swimmer's speed when it was dropped (m/s). */
  speed: number;
}

/**
 * Keeps the rings that are still worth drawing and hands the shader a fixed-size array. Swimmers
 * are followed by id, so each one only drops a ring once it has moved far enough.
 */
export class WakeField {
  readonly #rings: Vector4[] = [];
  readonly #last = new Map<string, { x: number; z: number }>();
  #next = 0;
  #count = 0;
  #capacity: number;

  /** vec4 per ring: x, z, when it was born, how fast it spreads. */
  readonly rings = uniformArray(
    Array.from({ length: MAX_RINGS }, () => new Vector4(0, 0, -1000, 0)),
    'vec4',
  );
  /** How many of them the shader should look at; 0 turns the wake off entirely. */
  readonly live = uniform(0);
  /**
   * Seconds on the runtime's own clock, which both this and the shader read. It is not the
   * shader's built-in time: sharing one number means a ring's age can never drift between where
   * it is drawn and where it is worked out.
   */
  readonly clock = uniform(0);

  constructor(capacity = MAX_RINGS) {
    this.#capacity = Math.max(0, Math.min(capacity, MAX_RINGS));
    for (let i = 0; i < MAX_RINGS; i += 1) this.#rings.push(new Vector4(0, 0, -1000, 0));
  }

  /** How many rings this device may keep (the graphics setting). */
  /** The runtime moved on: rings age against this. */
  tick(seconds: number): void {
    this.clock.value = seconds;
  }

  setCapacity(capacity: number): void {
    this.#capacity = Math.max(0, Math.min(Math.round(capacity), MAX_RINGS));
    if (this.#capacity === 0) this.clear();
    else this.live.value = Math.min(this.#count, this.#capacity);
  }

  /**
   * A swimmer is here now. A ring is dropped only once they have moved `RING_SPACING`, so the
   * trail is even however often this is called and standing still does not fill it up.
   */
  follow(id: string, x: number, z: number, speed: number, now: number): void {
    if (this.#capacity === 0) return;
    const last = this.#last.get(id);
    if (!last) {
      this.#last.set(id, { x, z });
      this.#drop(x, z, speed, now);
      return;
    }
    const moved = Math.hypot(x - last.x, z - last.z);
    if (moved < RING_SPACING) return;
    // Rings belong where the body was, not where it is being reported. On a slow frame a swimmer
    // covers several spacings at once, so the gap is filled in rather than left sparse; a jump
    // bigger than the whole trail is a teleport, and only the end of it gets a ring.
    const steps = Math.min(Math.floor(moved / RING_SPACING), this.#capacity);
    for (let i = 1; i <= steps; i += 1) {
      const t = (i * RING_SPACING) / moved;
      this.#drop(last.x + (x - last.x) * t, last.z + (z - last.z) * t, speed, now);
    }
    const covered = (steps * RING_SPACING) / moved;
    this.#last.set(id, { x: last.x + (x - last.x) * covered, z: last.z + (z - last.z) * covered });
  }

  /** A swimmer stopped swimming or left: their trail stays and fades, but no more is added. */
  forget(id: string): void {
    this.#last.delete(id);
  }

  #drop(x: number, z: number, speed: number, now: number): void {
    const spread = Math.max(MIN_SPREAD, speed * SPREAD_SHARE);
    this.#rings[this.#next]!.set(x, z, now, spread);
    this.rings.array[this.#next] = this.#rings[this.#next]!;
    this.#next = (this.#next + 1) % this.#capacity;
    this.#count = Math.min(this.#count + 1, this.#capacity);
    this.live.value = this.#count;
  }

  /** Rings still alive at this moment, for tests and for the bob of floating things. */
  ringsAt(now: number): Ring[] {
    const out: Ring[] = [];
    for (let i = 0; i < this.#count; i += 1) {
      const ring = this.#rings[i]!;
      if (now - ring.z > RING_LIFE) continue;
      out.push({ x: ring.x, z: ring.y, born: ring.z, speed: ring.w });
    }
    return out;
  }

  clear(): void {
    this.#count = 0;
    this.#next = 0;
    this.live.value = 0;
    this.#last.clear();
    for (const ring of this.#rings) ring.set(0, 0, -1000, 0);
  }
}

/**
 * How high the water stands at a point because of the rings, and how much white water is there.
 * The same sum on the CPU as in the shader, so a floating item rides the wake it can see.
 */
export function wakeAt(rings: readonly Ring[], x: number, z: number, now: number) {
  let lift = 0;
  let foam = 0;
  for (const ring of rings) {
    const age = now - ring.born;
    if (age < 0 || age > RING_LIFE) continue;
    const distance = Math.hypot(x - ring.x, z - ring.z);
    const radius = ring.speed * age;
    // Alive only near the ring's own edge, fading as it spreads and as it ages.
    const edge = Math.exp(-Math.abs(distance - radius) * RING_BAND);
    const fade = 1 - age / RING_LIFE;
    lift += Math.sin((distance - radius) * RING_WAVES) * RING_HEIGHT * edge * fade;
    // The crest of every ring carries some white, which is what makes the V show. Foam dies
    // sooner than the wave under it, so the arcs near the swimmer are white and the older ones
    // behind have gone back to being ripples.
    foam = Math.max(foam, edge * fade * fade * fade * RING_FOAM);
    // The newest rings are where the body is, so that is where the water is whitest.
    if (age < 0.5 && distance < FOAM_RADIUS)
      foam = Math.max(foam, (1 - distance / FOAM_RADIUS) * (1 - age / 0.5));
  }
  return { lift, foam };
}

/**
 * The same thing for the shader. Returns the rise of the water and the foam, summed over every
 * ring the device is keeping.
 */
export function wakeNodes(field: WakeField, worldX: Node<'float'>, worldZ: Node<'float'>) {
  const clock = field.clock;
  let lift: Node<'float'> = float(0);
  let foam: Node<'float'> = float(0);
  for (let i = 0; i < MAX_RINGS; i += 1) {
    // x and y hold where the ring was dropped, z when, w how fast it spreads.
    const ring = field.rings.element(i) as unknown as Node<'vec4'>;
    const age = clock.sub(ring.z);
    const distance = vec2(worldX.sub(ring.x), worldZ.sub(ring.y)).length();
    const radius = ring.w.mul(age);
    const alive = float(i).lessThan(field.live).and(age.greaterThan(0)).and(age.lessThan(RING_LIFE));
    const edge = exp(distance.sub(radius).abs().mul(-RING_BAND));
    const fade = max(float(1).sub(age.div(RING_LIFE)), 0);
    const here = sin(distance.sub(radius).mul(RING_WAVES)).mul(RING_HEIGHT).mul(edge).mul(fade);
    lift = lift.add(here.mul(alive.select(float(1), float(0))));
    const near = max(
      edge.mul(fade.mul(fade).mul(fade)).mul(RING_FOAM),
      max(float(1).sub(distance.div(FOAM_RADIUS)), 0).mul(max(float(1).sub(age.div(0.5)), 0)),
    );
    foam = max(foam, near.mul(alive.select(float(1), float(0))));
  }
  return { lift, foam };
}
