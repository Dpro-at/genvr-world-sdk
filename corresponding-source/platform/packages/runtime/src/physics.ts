import RAPIER from '@dimforge/rapier3d-compat';

let ready: Promise<void> | null = null;

/** Loads the Rapier WASM module once (embedded in the package, no extra files to serve). */
export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Anything with one collider (a character, a ridden box) that a sweep can skip. */
export interface ColliderOwner {
  readonly collider: RAPIER.Collider;
}

/** Character capsule: 1.8 m tall, feet at the body position minus this offset. */
export const CHARACTER = {
  radius: 0.35,
  halfHeight: 0.55,
  /** Distance from feet to capsule center. */
  centerOffset: 0.9,
} as const;

export interface CharacterSettings {
  /** Highest step walked up automatically (curbs, stairs). */
  maxStep: number;
  maxSlopeDeg: number;
  snapToGround: number;
}

const DEFAULT_SETTINGS: CharacterSettings = { maxStep: 0.4, maxSlopeDeg: 45, snapToGround: 0.3 };

/**
 * Thin wrapper around a Rapier world: static colliders for the ground, world bounds, and items,
 * plus a kinematic character controller. Independent of three.js so it can run on the server
 * (authoritative movement checks) and in tests.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  }

  /** Flat ground as a thick slab with its top at y = 0. */
  addGround(halfSize: number): void {
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(halfSize, 1, halfSize).setTranslation(0, -1, 0));
  }

  /** Invisible walls at the world edge (natural boundaries are drawn by the renderer). */
  addBounds(halfSize: number, height = 50): void {
    const thickness = 1;
    const walls: Array<[number, number, number, number, number]> = [
      [halfSize + thickness, height / 2, 0, thickness, halfSize],
      [-halfSize - thickness, height / 2, 0, thickness, halfSize],
      [0, height / 2, halfSize + thickness, halfSize, thickness],
      [0, height / 2, -halfSize - thickness, halfSize, thickness],
    ];
    for (const [x, y, z, hx, hz] of walls) {
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, height / 2, hz).setTranslation(x, y, z));
    }
  }

  /** Static box collider, e.g. for a placed item's bounding box. */
  addBox(center: Vec3Like, halfExtents: Vec3Like): void {
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z).setTranslation(
        center.x,
        center.y,
        center.z,
      ),
    );
  }

  /**
   * Moving body for a loose (unanchored) item (P3-26): falls, tumbles, and is pushed by players.
   * The body sits at the item's origin; its box sits at `center` in the item's own space.
   */
  addLooseBox(
    position: Vec3Like,
    rotation: { x: number; y: number; z: number; w: number },
    center: Vec3Like,
    halfExtents: Vec3Like,
  ): RAPIER.RigidBody {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setRotation(rotation)
        .setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        .setTranslation(center.x, center.y, center.z)
        .setDensity(300)
        .setFriction(0.8),
      body,
    );
    return body;
  }

  removeBody(body: RAPIER.RigidBody): void {
    this.world.removeRigidBody(body);
  }

  readonly #terrainColliders = new Map<string, RAPIER.Collider>();

  /** Replaces the collider of one terrain chunk (triangle mesh at full detail). */
  setTerrainChunk(key: string, positions: Float32Array, indices: Uint32Array): void {
    this.removeTerrainChunk(key);
    const collider = this.world.createCollider(RAPIER.ColliderDesc.trimesh(positions, indices));
    this.#terrainColliders.set(key, collider);
  }

  removeTerrainChunk(key: string): void {
    const existing = this.#terrainColliders.get(key);
    if (!existing) return;
    this.world.removeCollider(existing, false);
    this.#terrainColliders.delete(key);
  }

  get terrainChunkKeys(): string[] {
    return [...this.#terrainColliders.keys()];
  }

  readonly #structures = new Map<string, RAPIER.Collider[]>();
  /** One-way platforms (decision 95): collider handle to the height of its top. */
  readonly #oneWay = new Map<number, number>();

  /**
   * Replaces the static colliders of one structure (a wall's boxes, a room floor mesh), keyed so a
   * rebuild or removal swaps exactly that structure.
   */
  setStructure(
    key: string,
    boxes: ReadonlyArray<{ center: readonly number[]; half: readonly number[]; yaw: number }>,
    meshes: ReadonlyArray<{ positions: Float32Array; indices: Uint32Array }> = [],
    /** One-way boxes: characters that ask for it pass through them from below (side view). */
    oneWay = false,
  ): void {
    this.removeStructure(key);
    const colliders = boxes.map(({ center, half, yaw }) =>
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(half[0]!, half[1]!, half[2]!)
          .setTranslation(center[0]!, center[1]!, center[2]!)
          .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }),
      ),
    );
    if (oneWay)
      boxes.forEach(({ center, half }, i) => this.#oneWay.set(colliders[i]!.handle, center[1]! + half[1]!));
    for (const { positions, indices } of meshes)
      colliders.push(this.world.createCollider(RAPIER.ColliderDesc.trimesh(positions, indices)));
    this.#structures.set(key, colliders);
  }

  removeStructure(key: string): void {
    for (const collider of this.#structures.get(key) ?? []) {
      this.#oneWay.delete(collider.handle);
      this.world.removeCollider(collider, false);
    }
    this.#structures.delete(key);
  }

  /** Top of a one-way platform's collider, or undefined for every other collider. */
  oneWayTop(collider: RAPIER.Collider): number | undefined {
    return this.#oneWay.get(collider.handle);
  }

  get structureKeys(): string[] {
    return [...this.#structures.keys()];
  }

  /**
   * How far a sphere can travel from `from` along the unit direction `dir` before it touches
   * something (walls, terrain, items); `maxDistance` when the way is clear. Used to keep the
   * follow camera in front of walls. `exclude` skips a character's own capsule.
   */
  sweepSphere(
    from: Vec3Like,
    dir: Vec3Like,
    maxDistance: number,
    radius: number,
    exclude?: ColliderOwner | null,
    /** A second collider to skip (the item being ridden, movement modes). */
    alsoExclude?: ColliderOwner | null,
  ): number {
    const second = alsoExclude?.collider.handle;
    const hit = this.world.castShape(
      from,
      { x: 0, y: 0, z: 0, w: 1 },
      dir,
      this.#ballOf(radius),
      0,
      maxDistance,
      true,
      undefined,
      undefined,
      exclude?.collider,
      undefined,
      second === undefined ? undefined : (collider) => collider.handle !== second,
    );
    return hit ? Math.min(maxDistance, hit.time_of_impact) : maxDistance;
  }

  #ball: RAPIER.Ball | null = null;
  /** The probe sphere, kept between frames (no allocation per camera sweep). */
  #ballOf(radius: number): RAPIER.Ball {
    if (this.#ball?.radius !== radius) this.#ball = new RAPIER.Ball(radius);
    return this.#ball;
  }

  createCharacter(feet: Vec3Like, settings: Partial<CharacterSettings> = {}): Character {
    return new Character(this, feet, { ...DEFAULT_SETTINGS, ...settings });
  }

  /**
   * A moving box driven like the character (movement modes): a kinematic body at `origin` turned by
   * `yaw`, with a cuboid of `halfExtents` at `center` in its own space. `ground` true steps over small
   * bumps and snaps to the surface; otherwise it only slides along what it touches.
   */
  createBoxCharacter(
    origin: Vec3Like,
    yaw: number,
    center: Vec3Like,
    halfExtents: Vec3Like,
    ground: boolean,
  ): BoxCharacter {
    return new BoxCharacter(this, origin, yaw, center, halfExtents, ground);
  }

  /**
   * A kinematic box that others collide with (an item another player rides, movement modes): the
   * caller moves it with `moveKinematic`.
   */
  addKinematicBox(origin: Vec3Like, yaw: number, center: Vec3Like, halfExtents: Vec3Like): RAPIER.RigidBody {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(origin.x, origin.y, origin.z)
        .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z).setTranslation(
        center.x,
        center.y,
        center.z,
      ),
      body,
    );
    return body;
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }

  dispose(): void {
    this.world.free();
  }
}

export class Character {
  readonly #body: RAPIER.RigidBody;
  readonly #collider: RAPIER.Collider;
  readonly #controller: RAPIER.KinematicCharacterController;
  #verticalVelocity = 0;
  #grounded = false;
  #wall: -1 | 0 | 1 = 0;
  /** Side view (decision 95): one-way platforms let the character through from below. */
  oneWay = false;
  /** Dropping down through the one-way platform underfoot (S in the side view). */
  dropThrough = false;
  /** Feet height before the current move (the filter must not read the body during it). */
  #feetY = 0;
  /** Colliders the character moves through: one-way platforms from below or while dropping. */
  readonly #filter = (collider: RAPIER.Collider) => {
    const top = this.physics.oneWayTop(collider);
    if (top === undefined || !this.oneWay) return true;
    if (this.dropThrough) return false;
    return this.#feetY >= top - 0.05;
  };

  constructor(
    private readonly physics: PhysicsWorld,
    feet: Vec3Like,
    settings: CharacterSettings,
  ) {
    const world = physics.world;
    this.#body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        feet.x,
        feet.y + CHARACTER.centerOffset,
        feet.z,
      ),
    );
    this.#collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(CHARACTER.halfHeight, CHARACTER.radius),
      this.#body,
    );
    this.#controller = world.createCharacterController(0.02);
    this.#controller.enableAutostep(settings.maxStep, 0.2, false);
    this.#controller.enableSnapToGround(settings.snapToGround);
    this.#controller.setMaxSlopeClimbAngle((settings.maxSlopeDeg * Math.PI) / 180);
    this.#controller.setMinSlopeSlideAngle(((settings.maxSlopeDeg + 5) * Math.PI) / 180);
    this.#controller.setUp({ x: 0, y: 1, z: 0 });
    // Walking into a loose item pushes it (P3-26).
    this.#controller.setApplyImpulsesToDynamicBodies(true);
    this.#controller.setCharacterMass(60);
  }

  /** The capsule collider (e.g. to exclude it from camera sweeps). */
  get collider(): RAPIER.Collider {
    return this.#collider;
  }

  get grounded(): boolean {
    return this.#grounded;
  }

  /**
   * Takes the capsule out of the world (false) while the player rides an item, so the item's own box
   * never bumps into its rider, and puts it back (true).
   */
  setEnabled(on: boolean): void {
    this.#collider.setEnabled(on);
  }

  /** A wall touched on the side during the last move: 1 on the right (+x), -1 on the left, 0 none. */
  get wall(): -1 | 0 | 1 {
    return this.#wall;
  }

  /** Sets the up speed (m/s), e.g. a jump in the air or a wall jump, or 0 to hang for a dash. */
  launch(verticalVelocity: number): void {
    this.#verticalVelocity = verticalVelocity;
  }

  /** Moves the collider with the one-way filter and records a side wall it ran into. */
  #compute(delta: Vec3Like): void {
    // Rapier calls the filter while it moves the character; reading the body then fails.
    this.#feetY = this.#body.translation().y - CHARACTER.centerOffset;
    this.#controller.computeColliderMovement(this.#collider, delta, undefined, undefined, this.#filter);
    this.#wall = 0;
    for (let i = 0; i < this.#controller.numComputedCollisions(); i += 1) {
      // The normal points out of the obstacle: a wall on the right points to -x.
      const normal = this.#controller.computedCollision(i)?.normal1;
      if (normal && Math.abs(normal.x) > 0.7 && Math.abs(normal.y) < 0.5) this.#wall = normal.x < 0 ? 1 : -1;
    }
  }

  /** Feet position (capsule center minus the offset). */
  get feet(): Vec3Like {
    const t = this.#body.translation();
    return { x: t.x, y: t.y - CHARACTER.centerOffset, z: t.z };
  }

  /**
   * Moves by a horizontal velocity (m/s) for `dt` seconds with gravity and optional jump.
   * Returns the horizontal distance actually moved (0 when blocked).
   */
  move(
    horizontal: { x: number; z: number },
    jump: boolean,
    jumpVelocity: number,
    gravity: number,
    dt: number,
  ) {
    // A step with zero or negative time corrupts the Rapier body (it stops moving for good). The
    // first animation frame can report a timestamp from before the clock started, so skip those.
    if (!(dt > 0)) return 0;
    if (this.#grounded && jump) this.#verticalVelocity = jumpVelocity;
    this.#verticalVelocity -= gravity * dt;
    if (this.#grounded && this.#verticalVelocity < 0) this.#verticalVelocity = -1;

    this.#compute({
      x: horizontal.x * dt,
      y: this.#verticalVelocity * dt,
      z: horizontal.z * dt,
    });
    const moved = this.#controller.computedMovement();
    const t = this.#body.translation();
    this.#body.setNextKinematicTranslation({ x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z });
    this.#grounded = this.#controller.computedGrounded();
    if (this.#grounded && this.#verticalVelocity < 0) this.#verticalVelocity = 0;
    this.physics.step(dt);
    return Math.hypot(moved.x, moved.z);
  }

  /**
   * Swimming: moves horizontally while floating toward `floatFeetY` (feet height that keeps the
   * head above the water); `jump` gives a push up, e.g. to climb out onto the shore.
   */
  swim(horizontal: { x: number; z: number }, floatFeetY: number, jump: boolean, dt: number): number {
    if (!(dt > 0)) return 0;
    const t = this.#body.translation();
    const feetY = t.y - CHARACTER.centerOffset;
    this.#verticalVelocity = jump ? 5 : Math.max(-2, Math.min(2, (floatFeetY - feetY) * 3));
    this.#compute({
      x: horizontal.x * dt,
      y: this.#verticalVelocity * dt,
      z: horizontal.z * dt,
    });
    const moved = this.#controller.computedMovement();
    this.#body.setNextKinematicTranslation({ x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z });
    this.#grounded = false;
    this.physics.step(dt);
    return Math.hypot(moved.x, moved.z);
  }

  /** Free underwater displacement without gravity/buoyancy; retains Rapier collision resolution. */
  swimDisplacement(displacement: Vec3Like, dt: number): number {
    if (!(dt > 0)) return 0;
    this.#verticalVelocity = 0;
    const t = this.#body.translation();
    this.#compute(displacement);
    const moved = this.#controller.computedMovement();
    this.#body.setNextKinematicTranslation({ x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z });
    this.#grounded = false;
    this.physics.step(dt);
    return Math.hypot(moved.x, moved.z);
  }

  /**
   * Climbing a ladder (P2-23): moves by a velocity (m/s) in all three directions without gravity.
   * Returns the distance actually moved; `grounded` tells when a climb down reached the ground.
   */
  climb(velocity: Vec3Like, dt: number): number {
    if (!(dt > 0)) return 0;
    this.#verticalVelocity = 0;
    this.#compute({
      x: velocity.x * dt,
      y: velocity.y * dt,
      z: velocity.z * dt,
    });
    const moved = this.#controller.computedMovement();
    const t = this.#body.translation();
    this.#body.setNextKinematicTranslation({ x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z });
    this.#grounded = velocity.y <= 0 && this.#controller.computedGrounded();
    this.physics.step(dt);
    return Math.hypot(moved.x, moved.y, moved.z);
  }

  /** Teleport, e.g. back to spawn after falling out of the world. */
  teleport(feet: Vec3Like): void {
    this.#body.setTranslation({ x: feet.x, y: feet.y + CHARACTER.centerOffset, z: feet.z }, true);
    this.#verticalVelocity = 0;
  }
}

/**
 * The same kinematic character controller as `Character`, with a box (an item being ridden,
 * movement modes). The body sits at the item's origin and turns with its yaw; `move` resolves a
 * wanted displacement against everything else and returns what was moved.
 */
export class BoxCharacter {
  readonly #body: RAPIER.RigidBody;
  readonly #collider: RAPIER.Collider;
  readonly #controller: RAPIER.KinematicCharacterController;
  readonly #position = { x: 0, y: 0, z: 0 };
  readonly #rotation = { x: 0, y: 0, z: 0, w: 1 };
  readonly #moved = { x: 0, y: 0, z: 0 };
  #grounded = false;

  constructor(
    private readonly physics: PhysicsWorld,
    origin: Vec3Like,
    yaw: number,
    center: Vec3Like,
    halfExtents: Vec3Like,
    ground: boolean,
  ) {
    const world = physics.world;
    this.#position.x = origin.x;
    this.#position.y = origin.y;
    this.#position.z = origin.z;
    this.#setYaw(yaw);
    this.#body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(origin.x, origin.y, origin.z)
        .setRotation(this.#rotation),
    );
    this.#collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        Math.max(0.05, halfExtents.x),
        Math.max(0.05, halfExtents.y),
        Math.max(0.05, halfExtents.z),
      ).setTranslation(center.x, center.y, center.z),
      this.#body,
    );
    this.#controller = world.createCharacterController(0.02);
    this.#controller.setUp({ x: 0, y: 1, z: 0 });
    if (ground) {
      this.#controller.enableAutostep(0.35, 0.3, false);
      this.#controller.enableSnapToGround(0.3);
      this.#controller.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
      this.#controller.setMinSlopeSlideAngle((50 * Math.PI) / 180);
    } else {
      this.#controller.setMaxSlopeClimbAngle(Math.PI / 2);
    }
    // Riding into a loose item pushes it, like walking into one.
    this.#controller.setApplyImpulsesToDynamicBodies(true);
    this.#controller.setCharacterMass(400);
  }

  get collider(): RAPIER.Collider {
    return this.#collider;
  }

  /** Standing on something after the last move. */
  get grounded(): boolean {
    return this.#grounded;
  }

  /** The body's origin (the item's origin). The same object every time: copy it to keep it. */
  get position(): Readonly<Vec3Like> {
    return this.#position;
  }

  #setYaw(yaw: number): void {
    this.#rotation.y = Math.sin(yaw / 2);
    this.#rotation.w = Math.cos(yaw / 2);
  }

  /**
   * Turns to `yaw`, moves by `delta` as far as the way is clear, steps the world by `dt`, and returns
   * the displacement actually made (the same object every time).
   */
  move(delta: Vec3Like, yaw: number, dt: number): Readonly<Vec3Like> {
    this.#moved.x = 0;
    this.#moved.y = 0;
    this.#moved.z = 0;
    if (!(dt > 0)) return this.#moved;
    this.#setYaw(yaw);
    this.#body.setRotation(this.#rotation, true);
    this.#controller.computeColliderMovement(this.#collider, delta);
    const moved = this.#controller.computedMovement();
    this.#grounded = this.#controller.computedGrounded();
    this.#moved.x = moved.x;
    this.#moved.y = moved.y;
    this.#moved.z = moved.z;
    this.#position.x += moved.x;
    this.#position.y += moved.y;
    this.#position.z += moved.z;
    this.#body.setNextKinematicTranslation(this.#position);
    this.#body.setNextKinematicRotation(this.#rotation);
    this.physics.step(dt);
    return this.#moved;
  }

  /** Puts the box at a new origin and yaw at once (a correction from the room). */
  teleport(origin: Vec3Like, yaw: number): void {
    this.#position.x = origin.x;
    this.#position.y = origin.y;
    this.#position.z = origin.z;
    this.#setYaw(yaw);
    this.#body.setTranslation(this.#position, true);
    this.#body.setRotation(this.#rotation, true);
  }

  dispose(): void {
    this.physics.world.removeCharacterController(this.#controller);
    this.physics.world.removeRigidBody(this.#body);
  }
}
