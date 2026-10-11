import RAPIER from '@dimforge/rapier3d-compat';
/** Loads the Rapier WASM module once (embedded in the package, no extra files to serve). */
export declare function initPhysics(): Promise<void>;
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
export declare const CHARACTER: {
    readonly radius: 0.35;
    readonly halfHeight: 0.55;
    /** Distance from feet to capsule center. */
    readonly centerOffset: 0.9;
};
export interface CharacterSettings {
    /** Highest step walked up automatically (curbs, stairs). */
    maxStep: number;
    maxSlopeDeg: number;
    snapToGround: number;
}
/**
 * Thin wrapper around a Rapier world: static colliders for the ground, world bounds, and items,
 * plus a kinematic character controller. Independent of three.js so it can run on the server
 * (authoritative movement checks) and in tests.
 */
export declare class PhysicsWorld {
    #private;
    readonly world: RAPIER.World;
    constructor();
    /** Flat ground as a thick slab with its top at y = 0. */
    addGround(halfSize: number): void;
    /** Invisible walls at the world edge (natural boundaries are drawn by the renderer). */
    addBounds(halfSize: number, height?: number): void;
    /** Static box collider, e.g. for a placed item's bounding box. */
    addBox(center: Vec3Like, halfExtents: Vec3Like): void;
    /**
     * Moving body for a loose (unanchored) item (P3-26): falls, tumbles, and is pushed by players.
     * The body sits at the item's origin; its box sits at `center` in the item's own space.
     */
    addLooseBox(position: Vec3Like, rotation: {
        x: number;
        y: number;
        z: number;
        w: number;
    }, center: Vec3Like, halfExtents: Vec3Like): RAPIER.RigidBody;
    removeBody(body: RAPIER.RigidBody): void;
    /** Replaces the collider of one terrain chunk (triangle mesh at full detail). */
    setTerrainChunk(key: string, positions: Float32Array, indices: Uint32Array): void;
    removeTerrainChunk(key: string): void;
    get terrainChunkKeys(): string[];
    /**
     * Replaces the static colliders of one structure (a wall's boxes, a room floor mesh), keyed so a
     * rebuild or removal swaps exactly that structure.
     */
    setStructure(key: string, boxes: ReadonlyArray<{
        center: readonly number[];
        half: readonly number[];
        yaw: number;
    }>, meshes?: ReadonlyArray<{
        positions: Float32Array;
        indices: Uint32Array;
    }>, 
    /** One-way boxes: characters that ask for it pass through them from below (side view). */
    oneWay?: boolean): void;
    removeStructure(key: string): void;
    /** Top of a one-way platform's collider, or undefined for every other collider. */
    oneWayTop(collider: RAPIER.Collider): number | undefined;
    get structureKeys(): string[];
    /**
     * How far a sphere can travel from `from` along the unit direction `dir` before it touches
     * something (walls, terrain, items); `maxDistance` when the way is clear. Used to keep the
     * follow camera in front of walls. `exclude` skips a character's own capsule.
     */
    sweepSphere(from: Vec3Like, dir: Vec3Like, maxDistance: number, radius: number, exclude?: ColliderOwner | null, 
    /** A second collider to skip (the item being ridden, movement modes). */
    alsoExclude?: ColliderOwner | null): number;
    createCharacter(feet: Vec3Like, settings?: Partial<CharacterSettings>): Character;
    /**
     * A moving box driven like the character (movement modes): a kinematic body at `origin` turned by
     * `yaw`, with a cuboid of `halfExtents` at `center` in its own space. `ground` true steps over small
     * bumps and snaps to the surface; otherwise it only slides along what it touches.
     */
    createBoxCharacter(origin: Vec3Like, yaw: number, center: Vec3Like, halfExtents: Vec3Like, ground: boolean): BoxCharacter;
    /**
     * A kinematic box that others collide with (an item another player rides, movement modes): the
     * caller moves it with `moveKinematic`.
     */
    addKinematicBox(origin: Vec3Like, yaw: number, center: Vec3Like, halfExtents: Vec3Like): RAPIER.RigidBody;
    step(dt: number): void;
    dispose(): void;
}
export declare class Character {
    #private;
    private readonly physics;
    /** Side view (decision 95): one-way platforms let the character through from below. */
    oneWay: boolean;
    /** Dropping down through the one-way platform underfoot (S in the side view). */
    dropThrough: boolean;
    constructor(physics: PhysicsWorld, feet: Vec3Like, settings: CharacterSettings);
    /** The capsule collider (e.g. to exclude it from camera sweeps). */
    get collider(): RAPIER.Collider;
    get grounded(): boolean;
    /**
     * Takes the capsule out of the world (false) while the player rides an item, so the item's own box
     * never bumps into its rider, and puts it back (true).
     */
    setEnabled(on: boolean): void;
    /** A wall touched on the side during the last move: 1 on the right (+x), -1 on the left, 0 none. */
    get wall(): -1 | 0 | 1;
    /** Sets the up speed (m/s), e.g. a jump in the air or a wall jump, or 0 to hang for a dash. */
    launch(verticalVelocity: number): void;
    /** Feet position (capsule center minus the offset). */
    get feet(): Vec3Like;
    /**
     * Moves by a horizontal velocity (m/s) for `dt` seconds with gravity and optional jump.
     * Returns the horizontal distance actually moved (0 when blocked).
     */
    move(horizontal: {
        x: number;
        z: number;
    }, jump: boolean, jumpVelocity: number, gravity: number, dt: number): number;
    /**
     * Swimming: moves horizontally while floating toward `floatFeetY` (feet height that keeps the
     * head above the water); `jump` gives a push up, e.g. to climb out onto the shore.
     */
    swim(horizontal: {
        x: number;
        z: number;
    }, floatFeetY: number, jump: boolean, dt: number): number;
    /** Free underwater displacement without gravity/buoyancy; retains Rapier collision resolution. */
    swimDisplacement(displacement: Vec3Like, dt: number): number;
    /**
     * Climbing a ladder (P2-23): moves by a velocity (m/s) in all three directions without gravity.
     * Returns the distance actually moved; `grounded` tells when a climb down reached the ground.
     */
    climb(velocity: Vec3Like, dt: number): number;
    /** Teleport, e.g. back to spawn after falling out of the world. */
    teleport(feet: Vec3Like): void;
}
/**
 * The same kinematic character controller as `Character`, with a box (an item being ridden,
 * movement modes). The body sits at the item's origin and turns with its yaw; `move` resolves a
 * wanted displacement against everything else and returns what was moved.
 */
export declare class BoxCharacter {
    #private;
    private readonly physics;
    constructor(physics: PhysicsWorld, origin: Vec3Like, yaw: number, center: Vec3Like, halfExtents: Vec3Like, ground: boolean);
    get collider(): RAPIER.Collider;
    /** Standing on something after the last move. */
    get grounded(): boolean;
    /** The body's origin (the item's origin). The same object every time: copy it to keep it. */
    get position(): Readonly<Vec3Like>;
    /**
     * Turns to `yaw`, moves by `delta` as far as the way is clear, steps the world by `dt`, and returns
     * the displacement actually made (the same object every time).
     */
    move(delta: Vec3Like, yaw: number, dt: number): Readonly<Vec3Like>;
    /** Puts the box at a new origin and yaw at once (a correction from the room). */
    teleport(origin: Vec3Like, yaw: number): void;
    dispose(): void;
}
