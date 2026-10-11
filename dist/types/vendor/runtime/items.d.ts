import { type ItemInstance, type Ride, type Style, type WorldDocument } from '../contracts/index.js';
import { type ItemBounds, type ItemPart } from '../core-library/index.js';
import { type RestShape, type SurfaceIndex } from '../validator/index.js';
import type { TerrainData } from '../world/index.js';
import { BufferGeometry, Group, Matrix4, Mesh, Ray, Vector3, type AnimationClip, type Material, type Object3D } from 'three/webgpu';
import type RAPIER from '@dimforge/rapier3d-compat';
import { type ItemPackages, type PackageMesh } from './item-packages.js';
import type { PhysicsWorld } from './physics.js';
/**
 * Where an item is drawn while it moves away from where it was placed (movement modes): ridden, or
 * left somewhere by a rider. Pitch and roll are the lean worked out on this device (never sent).
 */
export interface LivePose {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch?: number;
    roll?: number;
}
/** What the runtime needs to draw and collide one item type. */
export interface ItemModel {
    id: string;
    name: string;
    parts: readonly ItemPart[];
    bounds: ItemBounds;
    /** What a player bumps into, where that is much smaller than `bounds` (a tree's trunk). */
    blocks?: ItemBounds;
    collider: 'none' | 'box';
    /** Copies join edge to edge (fences, blocks) instead of leaving a small gap. */
    snug: boolean;
    /** Cell size for block-style items that stack in a grid, or null. */
    grid: number | null;
    /** Basic parts: width, height, and depth change freely. */
    resizable: boolean;
    /** Meshes of a glTF package (P2-16); drawn instead of `parts` when present. */
    meshes?: readonly PackageMesh[];
    /**
     * Simpler versions of `meshes` for far away (decision 94), nearest first. Moving copies use a
     * level only where it shares the mesh's vertices (levels made by Genvr), so bones still fit.
     */
    lods?: readonly (readonly PackageMesh[])[];
    /** Opt-in shader LOD residency, one padded distance interval per mesh level.
     * Overlap keeps both levels available for shader cross-fades. The padding must exceed
     * refreshDistance; shaders still use the actual camera and their unpadded fade ranges.
     * Static instanced models only; ordinary package LOD remains unchanged. */
    lodResidency?: {
        ranges: readonly (readonly [number, number])[];
        refreshDistance: number;
        /** Optional static fallback for transforms a procedural shader cannot represent. Must not mutate matrix. */
        forceNear?: (matrix: Matrix4) => boolean;
    };
    /** Animated or skinned package models: drawn as copies that move (P2-16 slice d). */
    animation?: {
        scene: Object3D;
        clips: readonly AnimationClip[];
    };
    /** Sound name to file link (package `audio`). */
    sounds?: Readonly<Record<string, string>>;
    /** Players climb it (manifest `physics.climbable`, P2-23). */
    climbable?: boolean;
    /** Made to hang in the air (manifest `physics.floats`); copies may say otherwise. */
    floats?: boolean;
}
/** Floating items up to this thick are one-way platforms in side-view places (decision 95). */
export declare const ONE_WAY_THICKNESS = 1;
/** A ladder the player touches: its top and bottom (feet heights) and which way it faces. */
export interface Climbable {
    instanceId: string;
    top: number;
    bottom: number;
    /** Turn about Y; the ladder's front is +z in its own space. */
    yaw: number;
    /** Middle of its box on the ground plane. */
    x: number;
    z: number;
}
/** How high above a ladder's top players climb, to clear the edge of what it leans on. */
export declare const CLIMB_OVER = 0.15;
/** Most moving package items drawn per place; more copies are drawn still (instanced). */
export declare const MAX_ANIMATED_ITEMS = 50;
/** The clip an animated item plays: `idle` when there is one, else the first. */
export declare function idleClip(clips: readonly AnimationClip[]): AnimationClip | undefined;
/**
 * The sound an animated item makes each time its animation starts again (decision 79): the
 * sound named like the animation, else the first sound of the package.
 */
export declare function loopSound(model: ItemModel, clipName: string): string | undefined;
/** Frames between animation updates of a moving copy at each LOD level (far ones move less often). */
export declare const ANIMATION_EVERY: readonly [1, 2, 4];
/** Heard when an animated item's animation starts again (to play its sound there). */
export interface ItemLoopEvent {
    instanceId: string;
    itemId: string;
    position: Vector3;
    /** Link of the sound to play, if the item has one. */
    sound: string | undefined;
}
/**
 * Resolves an item id to its model: a Core Library item (in its look for the place's style, P2-26),
 * or a loaded glTF package (P2-16); the placeholder while a package loads or when there is none.
 */
/**
 * The item as the place draws it: a Core item's parts in the place's style, a Core item's real 3D
 * model where its style has one (Realistic, P2-38; its parts stand in while the model loads), or
 * an uploaded package.
 */
export declare function resolveItem(itemId: string, packages?: ItemPackages, style?: Style, coreModels?: ItemPackages, 
/** The placed instance's own parameters: a generated look (decision 130) is built with them. */
params?: Readonly<Record<string, unknown>>): ItemModel;
/** All parts merged into one geometry with vertex colors (one draw call per item type). */
export declare function itemGeometry(parts: readonly ItemPart[]): BufferGeometry;
/**
 * Model key of an item with some instance parameters: its item id, plus the values of its generator parameters
 * when it has a generated look (decision 130), so copies with equal parameters share one model and one batch.
 */
export declare function modelKey(itemId: string, params?: Readonly<Record<string, unknown>>): string;
/**
 * Render-only shift that puts a far, coarsely-drawn thing on the ground exactly as it is drawn
 * there (P2-43): the document position still rests on the exact terrain (`heightAt`), but a chunk
 * drawn at less than full detail shows a different height at that point, so the item is shifted by
 * the difference for drawing only. Zero at full detail (`step === 1`), where the drawn ground is
 * the exact one.
 */
export declare function drawOffset(x: number, z: number, exact: number, step: number, terrain: Pick<TerrainData, 'drawnHeightAt'>): number;
/**
 * Ground and rest-law context an `ItemsView` needs for render-only drawing fixes (P2-43 task 11):
 * `stepAt` says which level of detail `TerrainView` is drawing the ground with at a point, and
 * `shapeOf`/`surfaces` are the rest law's own view of the place, used to size a `foundation`
 * item's plinth the same way the rest law itself would.
 */
export interface ItemsDrawContext {
    /** The exact ground (never a coarse level), and the ground exactly as a coarse chunk draws it. */
    terrain: Pick<TerrainData, 'heightAt' | 'drawnHeightAt'>;
    /** The step (1, 2 or 4) `TerrainView` is currently drawing the chunk at x, z with. */
    stepAt: (x: number, z: number) => number;
    /** Increases whenever a chunk `stepAt` would answer changes; cheap to poll. */
    stepVersion: () => number;
    shapeOf: (itemId: string) => RestShape | null;
    surfaces: () => SurfaceIndex;
    /** True in Realistic places: the plinth is drawn in stone instead of the style's dark grey (no
     * wall-color palette is readily available to the runtime here, P2-43 task 11). */
    realistic: () => boolean;
}
/** Rotation about the vertical axis of a quaternion (items are only turned about Y). */
export declare const yawOf: (q: readonly number[]) => number;
export declare const yawQuaternion: (yaw: number) => [number, number, number, number];
/** Collider box of one placed item, in world space. */
export declare function itemColliderBox(model: ItemModel, instance: Pick<ItemInstance, 'transform'>): {
    center: number[];
    half: number[];
    yaw: number;
};
/**
 * World-space matrix of a `foundation` item's plinth box (P2-43 task 11): as wide and deep as the
 * item's own rest base (`rest()`'s `restFeet` base, same as the collider box's own convention
 * above), reaching `plinth` meters up to the item's base (its lowest point). `offsetY` is the same
 * render-only coarse-ground shift (`drawOffset`) applied to the item itself, so a plinth moves
 * with its item instead of floating above (or sinking below) the drawn ground (P2-43 task 11
 * review round 1).
 */
export declare function plinthMatrix(instance: ItemInstance, shape: RestShape, plinth: number, offsetY?: number): Matrix4;
/** LOD distances (m) for a model about 3 m across; bigger models switch farther away. */
export declare const LOD_DISTANCES: readonly [25, 60];
/**
 * Renders placed items with one InstancedMesh per item type and keeps a box collider per
 * item. Only item types whose instances changed are updated.
 */
export declare class ItemsView {
    #private;
    private readonly physics;
    private readonly resolve;
    readonly group: Group<import("three/webgpu").Object3DEventMap>;
    readonly material: Material;
    /** Called each time a moving item's animation starts again (the runtime plays its sound). */
    onItemLoop: ((event: ItemLoopEvent) => void) | null;
    constructor(physics: PhysicsWorld, resolve?: (itemId: string, params?: Readonly<Record<string, unknown>>) => ItemModel);
    /**
     * Ground and rest-law context for render-only drawing fixes (P2-43 task 11): far placed things
     * sit on the ground as it is drawn (coarse LOD), and `foundation` items get a plinth down to the
     * ground. Set once, before the first `sync` (null on places with no `TerrainView`, e.g. block
     * ground, where this does not apply).
     */
    setDrawContext(context: ItemsDrawContext | null): void;
    /**
     * Refreshes the coarse-ground offset of placed items after `TerrainView` changes a chunk's step
     * (call a few times a second, not every frame, like `updateLod`): a cheap no-op unless the step
     * of some chunk actually changed since the last call.
     */
    updateDrawOffsets(): void;
    /**
     * The ground changed (P2-43 final review): a plinth reaches down to the ground, so the next
     * `sync` works the plinths out again even though no placed item moved.
     */
    groundChanged(): void;
    /**
     * The model of an item; with an instance's `params`, the model built with them when the item has a generated
     * look (decision 130). Ordinary items ignore `params`.
     */
    model(itemId: string, params?: Readonly<Record<string, unknown>>): ItemModel;
    /**
     * Draws an item again with a newly resolved model (a glTF package finished loading):
     * forgets the cached model, rebuilds its meshes, and replaces its colliders.
     */
    reload(itemId: string, doc: WorldDocument): void;
    /**
     * The collider boxes of scattered things (P2-40 woods: tree trunks) within `radius` of (x, z).
     * They have no physics body, so the camera checks them itself (`rayBoxDistance`).
     */
    scatteredBoxesNear(x: number, z: number, radius: number): ReturnType<typeof itemColliderBox>[];
    /** Call after every command. */
    /**
     * Things the world scattered rather than the creator placing them (P2-40): the woods and painted
     * cover. They are drawn as ordinary instances so they get the instancing, LOD, materials and
     * colliders that already work here, instead of a second path that would drift from this one.
     * The list changes as the player moves, so it is kept apart from the document's own items.
     */
    setScattered(instances: readonly ItemInstance[], doc: WorldDocument): void;
    sync(doc: WorldDocument): void;
    /**
     * Draws an item at `pose` instead of where it was placed (movement modes), or back where it was
     * placed with null. `solid` gives it a moving box other players bump into; the item the local
     * player steers is not solid here (its rider's controller has the box). Starting or ending a live
     * pose regroups the batches once; moving it only sets its own matrix (no per-frame allocation).
     */
    setLivePose(instanceId: string, pose: LivePose | null, solid?: boolean): void;
    /** Where an item is drawn now: its live pose, or where it was placed; null for an unknown item. */
    livePose(instanceId: string): LivePose | null;
    /** Ids of the items drawn at a live pose now. */
    liveIds(): string[];
    /** The moving box of a live item another player rides, or null (the camera sweep skips it). */
    liveCollider(instanceId: string): {
        collider: RAPIER.Collider;
    } | null;
    /** A placed item's box in its own space, scaled (seats are laid out in it); null for an unknown item. */
    itemBounds(instanceId: string): {
        min: {
            x: number;
            y: number;
            z: number;
        };
        max: {
            x: number;
            y: number;
            z: number;
        };
    } | null;
    /** The ride of a placed item (its params, then its library item's default), or null. */
    rideOf(instanceId: string): Ride | null;
    /**
     * The nearest rideable item whose origin (at its live pose) is within its ride's reach of `feet`,
     * or null. The room judges again from the position it trusts.
     */
    rideableNear(feet: {
        x: number;
        y: number;
        z: number;
    }): {
        instanceId: string;
        ride: Ride;
    } | null;
    /** Starts or stops physics for loose items; stopping puts every item back where it was saved. */
    setSimulating(on: boolean, doc: WorldDocument): void;
    /**
     * Shows or hides the map markers of the rules (spawn points, zones; P9-12). Hidden, players see
     * only the zones their designer made visible in play.
     */
    setMarkersVisible(on: boolean, doc: WorldDocument): void;
    /**
     * Lets items fall and come to rest with physics while building (P2-11 settle): the same moving
     * boxes as loose items in play, against the ground, water floors, walls, and every other item.
     * Runs up to `seconds` of simulated time at once, then returns where each item came to rest;
     * nothing is changed (apply the result as commands). Items without a collider stay where they
     * are (the caller leaves out items meant to float).
     */
    settle(doc: WorldDocument, instanceIds: readonly string[], seconds?: number): Array<{
        instanceId: string;
        position: [number, number, number];
        rotation: [number, number, number, number];
    }>;
    /** Draws loose items where physics moved them (call every frame, after the physics step). */
    updateLoose(): void;
    /**
     * Advances the animations of moving items (call every frame). Far copies move every few frames
     * by the time of all of them, so they keep the same speed with less work.
     */
    update(dt: number): void;
    /**
     * Moves items between their LOD levels by distance from the camera (decision 94); call a few
     * times a second, not every frame.
     */
    updateLod(camera: Vector3): void;
    /** Cheap every-frame camera check for opted-in shader LODs; buffers refill only after
     * the declared movement threshold, or through normal instance-edit synchronization. */
    updateProceduralLod(camera: Vector3): void;
    /** Number of moving copies drawn now (tests, stats). */
    get animatedCount(): number;
    /**
     * Nearest unlocked item whose bounding box the ray passes through. Boxes (not exact triangles) make
     * thin items such as fences and lamps easy to tap on a phone.
     */
    pick(ray: Ray, ignore?: string | null): string | null;
    /**
     * Instance id of a raycast hit on an item, or null: an instanced mesh (by its name and slot)
     * or a part of a moving copy (by its root). Also accepts a mesh name alone.
     */
    instanceIdAt(hit: string | Object3D, instanceIndex: number | undefined): string | null;
    /** A single (non-instanced) mesh of an item, e.g. for the ghost preview. */
    /**
     * The climbable item (ladder) the player touches at `feet`, or null: the feet are inside its
     * collider box grown by `CLIMB_REACH` across, from just below its bottom to a little
     * above its top.
     */
    climbableAt(feet: {
        x: number;
        y: number;
        z: number;
    }): Climbable | null;
    previewMesh(itemId: string, material: Material): Mesh;
    dispose(): void;
}
