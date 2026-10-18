import type { HumanData } from './format.js';
/**
 * The human generator (CHAR-02): mixes the baked shape targets for a style and gender, stands the body on the
 * ground and places the 52 joints from the shaped mesh (each joint is the mean of a fixed set of vertices). Pure
 * code without three.js, so the bake, tests and a worker can all run it.
 */
export declare const HUMAN_STYLES: readonly ["anime"];
export type HumanStyle = (typeof HUMAN_STYLES)[number];
export declare const HUMAN_GENDERS: readonly ["boy", "girl"];
export type HumanGender = (typeof HUMAN_GENDERS)[number];
/** Genders that have a body today (the girl comes next). */
export declare const READY_GENDERS: readonly HumanGender[];
/** Target weights per style and gender: macro targets of the base data, then our own style target. */
export declare const HUMAN_PRESETS: Record<`${HumanStyle}:${HumanGender}`, Readonly<Record<string, number>> | null>;
export interface HumanJoint {
    name: string;
    parent: string | null;
    at: [number, number, number];
    bind?: [number, number, number, number];
}
export interface HumanBody {
    /** Drawn vertices, metres, feet at y = 0, facing +z. */
    positions: Float32Array;
    /** Two triangles per quad. */
    triangles: Uint32Array;
    /** The lighter level of detail: two triangles per LOD quad (same vertices), or null when not baked. */
    lodTriangles: Uint32Array | null;
    /** The quads (four ids each), for the editor's quad wireframe and stats. */
    quads: Uint32Array;
    /** Quad edges as degenerate triangles (a, b, b): a wireframe of them draws only the quad edges. */
    quadEdges: Uint32Array;
    skinIndex: Uint16Array;
    /** Four weights per vertex, sum 1. */
    skinWeight: Float32Array;
    /** Region per vertex (0 skin, 1 shorts). */
    region: Float32Array;
    /**
     * Rest joints in the T-pose the clips start from (world-aligned axes). The mesh itself stays in its own A-pose:
     * `bind` turns a joint (the upper arms) from the T-pose into it, as for the warrior body.
     */
    joints: HumanJoint[];
    /** Top of the head above the feet (m). */
    height: number;
    /** Face landmarks on the shaped head (bind pose, same space as `positions`), when asked for. */
    face: Record<string, [number, number, number]>;
    /** Per drawn vertex, where the closed-eye (blink) shape moves it; played on the GPU, never mixed in. */
    blink: Float32Array;
    /** Distances from the shaped upper/lower lid edges, filled during contour fitting. */
    lidDistance?: Float32Array;
    /** Per drawn vertex, where the open-mouth shape moves it (speech), played on the GPU like the blink. */
    mouthOpen: Float32Array;
    /** Per drawn vertex, how far along its lash strip it sits: 0 at the lid rim, 1 at the tip (0 off the lashes). */
    lash: Float32Array;
    /** Per drawn vertex, 0..1: how much muscle and how much fat can grow there (the editor's anatomy view). */
    muscleMap: Float32Array;
    fatMap: Float32Array;
    /** Per drawn vertex, 1 + the index of the muscle group (contracts `MUSCLE_GROUPS`) or fat region leading it. */
    muscleGroup: Float32Array;
    fatRegion: Float32Array;
}
/** Mixes targets into a copy of every vertex position (drawn and helper). */
export declare function mixHuman(data: HumanData, weights: Readonly<Record<string, number>>): Float32Array;
/**
 * The T-pose of joints fitted in the mesh's A-pose: the upper arm, forearm and hand are turned level along their
 * side's x axis (outer bones first, each carrying its subtree). Each keeps the local turn back into the mesh's pose
 * as its `bind`, so the mesh binds where it is and clips start from the T-pose.
 */
export declare function tPose(joints: readonly HumanJoint[]): HumanJoint[];
/** Joint rest positions of mixed vertices (before the ground shift), where the mesh is (its A-pose). */
export declare function fitJoints(data: HumanData, positions: Float32Array): HumanJoint[];
/** Builds the body for a style and gender (null when that gender has no body yet). */
export declare function generateHuman(data: HumanData, style?: HumanStyle, gender?: HumanGender, landmarks?: Readonly<Record<string, readonly number[]>>, extra?: Readonly<Record<string, number>>): HumanBody | null;
/**
 * Anime Shape (owner + ChatGPT review): how much of each face morph the master slider brings at 1 (eyes, nose,
 * mouth, jaw, lower face, cranium); the slider scales them all.
 */
export declare const ANIME_SHAPE_MIX: Readonly<Record<string, number>>;
/** The target weights of an Anime Shape value (0..1). */
export declare const animeShapeWeights: (amount: number) => Record<string, number>;
/**
 * Where the overall fat goes with the fat pattern (owner, Stage B; anatomy.md): -1 the upper body (android: belly,
 * waist), +1 the lower body (gynoid: hips, buttocks, thighs). Share of the overall fat added to each region.
 */
export declare const FAT_PATTERN: Readonly<Record<string, readonly [upper: number, lower: number]>>;
/**
 * Overall muscle and fat at slider 1, as a share of MakeHuman's min-to-max macro difference: on the young/child
 * boy that difference is only ~2.7 cm, too small to see (owner check, 2026-10-05). `zone`: our muscle shapes at
 * slider 1 (x the zone's own height from zones.json, 1.2-3 cm).
 */
export declare const BUILD_STRENGTH: {
    muscle: number;
    fat: number;
    zone: number;
};
/**
 * The target weights of a body's build (muscle, fat, fat pattern, muscle groups, fat regions, face controls; keys of the contracts'
 * `BUILD_KEYS`): each control mixes its baked `+` or `-` target. The double chin only grows, above fat 0.6.
 */
export declare function buildWeights(build?: Readonly<Record<string, number>>): Record<string, number>;
/** The drawn body of mixed positions: on the ground, triangles, quad edges, weights and joints. */
export declare function buildHuman(data: HumanData, mixed: Float32Array, landmarks?: Readonly<Record<string, readonly number[]>>): HumanBody;
