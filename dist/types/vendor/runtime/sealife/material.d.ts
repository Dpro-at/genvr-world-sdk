import { MeshStandardNodeMaterial } from 'three/webgpu';
/**
 * Sea-life materials (SEALIFE-01): plain TSL node materials, so the same graph compiles to WGSL on WebGPU and to
 * GLSL on the WebGL2 backend (no `wgslFn`, no stand-ins needed). Everything that differs per item lives in vertex
 * attributes written by `sealife/mesh.ts`, so one material per kind draws every size, palette and seed:
 *
 * - colour `color`, back-side colour `aInner` (inside of a shell or a tube), spot colour and amount `aSpot`;
 * - `aPattern` = (spot frequency 1/m, line amount, roughness, bump strength); `uv.y` is the line coordinate;
 * - `aMotion` (see `sealife/motion.ts`): the offset is computed from the raw geometry position in the item's own
 *   frame and turned by the copy's instance matrix, so it follows the item's turn and lean.
 *
 * Spots are worley cells in the item's own (rest) coordinates, lines are bands on whole numbers of `uv.y`; both
 * tint towards the spot colour and raise a small bump (screen-space derivative normal, as three's bump map).
 * Pattern detail fades out where a cell gets smaller than a few pixels, so far copies do not shimmer.
 *
 * The motion lives in `positionNode` (and the shadow caster position), so shadows move with the shape.
 */
export type SeaMotionKind = 'none' | 'lift' | 'hinge';
/** How far the shadow casters of double-sided sheets are pushed away from the light (m). */
export declare const SHADOW_INSET = 0.012;
export interface SeaMaterialOptions {
    motion: SeaMotionKind;
    doubleSided: boolean;
    /** Physical material with clearcoat on glossy (low-roughness) vertices. */
    gloss: boolean;
}
export declare function createSeaMaterial(options: SeaMaterialOptions): MeshStandardNodeMaterial;
/** Shared material keys (`registerGeneratorMaterial`). */
export declare const SEALIFE_MATERIALS: {
    readonly starfish: "sealife.starfish";
    readonly clam: "sealife.clam";
    readonly shell: "sealife.shell";
};
export declare const SEALIFE_MATERIAL_OPTIONS: Readonly<Record<keyof typeof SEALIFE_MATERIALS, SeaMaterialOptions>>;
