import { type AvatarExpression } from './avatar-expression.js';
import { AnimationClip, Bone, BufferGeometry, Group, Matrix4, Skeleton, SkinnedMesh, Vector3, type Material } from 'three/webgpu';
import type { AvatarBodyType, AvatarScale, BodyId, MouthShape } from '../contracts/index.js';
import { type AnimationItem, type AvatarBody } from '../core-library/index.js';
import { type MouthMorphs } from './visemes.js';
import type { HumanData } from './character/human/format.js';
/**
 * The Genvr avatar (tasks P2-05, P2-20, P2-22): blocky characters built from the Core Library
 * body types, each with its own skeleton: Classic (Roblox-like, 15 joints, the main avatar) and
 * Starter (the first test body on the standard 52-bone humanoid rig). The rest pose is a T-pose
 * facing +z with every bone's axes aligned to the world, feet at y = 0. Changing the body type
 * rebuilds the skeleton inside the same scene objects.
 */
/** The standard 52-bone humanoid rig: the Starter body's joints. */
export declare const STANDARD_BONES: readonly string[];
export type StandardBone = string;
export declare const bonePrefix = "mixamorig";
/** Colors of the avatar's parts (hex strings), the body type, and the worn Core items. */
export interface AvatarLook {
    skin: string;
    hair: string;
    shirt: string;
    pants: string;
    shoes: string;
    /** Classic when missing (decision 73). */
    body?: BodyId;
    /** Height, width, and head size (normal when missing). */
    scale?: AvatarScale;
    wear?: readonly string[];
    /** A fantasy skin material (Core Library `SKIN_MATERIALS` id) on a generated body. */
    skinMaterial?: string | undefined;
    /** Anime Shape of a generated body's face, 0..1. */
    animeShape?: number | undefined;
    /** Muscle and fat of a generated body (contracts `BUILD_KEYS`; absent keys 0). */
    build?: Readonly<Record<string, number>> | undefined;
    /** Hair, eyebrows and beard of a generated body (contracts `HumanHair`, asset ids such as `hair.short02`). */
    humanHair?: Readonly<{
        head?: string | undefined;
        brows?: string | undefined;
        beard?: string | undefined;
    }> | undefined;
}
export declare const DEFAULT_LOOK: AvatarLook;
/**
 * Where a right hand holds things (P9-12): the bone that carries the hand, the palm in that bone's
 * own space, and the direction from the wrist to the fingers (bone space; bones rest unrotated, so
 * this is the T-pose arm, or the hanging arm of a flat body).
 */
export interface HandGrip {
    bone: Bone;
    palm: Vector3;
    along: Vector3;
}
/**
 * The right hand of a body and its skeleton: the joint that carries the hand (the body's fit for
 * the standard `RightHand` bone, else the joint that bone moves), found by its node name so rigs
 * with a bone prefix (imported mesh bodies) work too. The palm is the middle of the hand's block
 * (the fit box, or the hand joint's parts); rigged hands without blocks hold a little past the
 * wrist toward the knuckles. Null when the body has no right hand.
 */
export declare function rightHandGrip(body: AvatarBody, skeleton: Skeleton): HandGrip | null;
/** The top of a body's head above its feet at rest: its highest block, or above a rigged head joint. */
export declare function headTopOf(body: AvatarBody): number;
/**
 * The red of a hit (P9-12) on an avatar's own material: its glow turns red and fully on (a model's
 * glow may be off, `emissiveIntensity` 0, or come from a dark glow picture, which is set aside
 * while red). Amount 0 puts back exactly what the material had; a material swapped out mid-flash
 * gets its own glow back too. Nothing new is made per hit (a material set aside its glow picture
 * once is ready for the next hit).
 */
export declare class HitTint {
    #private;
    apply(material: Material, amount: number): void;
}
/** Seconds a knocked-out avatar takes to fall and fade away (P9-12). */
export declare const DOWN_SECONDS = 1.2;
/**
 * The knocked-out look at `amount` (0 = standing, 1 = gone; P9-12): the body falls backwards
 * around the chest in the first part, lying on the ground, then fades out.
 */
export declare function downLook(amount: number): {
    tilt: number;
    drop: number;
    opacity: number;
};
/**
 * The fade of a knocked-out avatar on its own material: see-through while fading, and exactly its
 * own `transparent` and `opacity` back at 1 (a model's material may be see-through by design).
 */
export declare class FadeLook {
    #private;
    apply(material: Material, opacity: number): void;
}
/** Edge of the small cubes an avatar is drawn with in cube looks (P2-26), before fitting a part. */
export declare const AVATAR_CUBE = 0.1;
export interface GenvrAvatar {
    /** Add this to the scene; its position is the feet, rotation.y the facing. */
    readonly root: Group;
    /** Tilts the whole body (swimming) around the chest without changing the facing. */
    readonly pose: Group;
    readonly mesh: SkinnedMesh;
    /** The current body type's skeleton and clips (they change with the body type). */
    readonly skeleton: Skeleton;
    readonly clips: AnimationClip[];
    /** The worn body: a Genvr body, or a creator's uploaded body (its item id). */
    readonly body: AvatarBody['id'];
    /**
     * Changes colors, worn items, body type, and size at once. Returns true when the skeleton was
     * replaced (another body type or size): animators must bind to the new clips then.
     */
    setLook(look: AvatarLook): boolean;
    /** Draws the avatar as small cubes (Voxel places) or with smooth blocks. */
    setCubes(cubes: boolean): void;
    /** Swings hair, coat panels, and tassels (bodies with springs); call after the clips each frame. */
    updateSprings(delta: number): void;
    /**
     * Shows a mouth shape while the avatar speaks (lip sync, P2-44); `X` is at rest. Block bodies draw it, mesh bodies
     * show it through their mouth blend shapes; bodies without either (2D bodies for now) ignore it.
     */
    setMouth(shape: MouthShape): void;
    readonly expressionSupported: boolean;
    setExpression(expression: AvatarExpression): void;
    updateExpression(delta: number): void;
    /** The mouth shape shown now (`X` at rest, and for bodies that cannot show one). */
    readonly mouth: MouthShape;
    /** Height of the top of the head above the feet at rest (m); follows the body type. */
    readonly headTop: number;
    /** Where the right hand holds things (null for bodies without a right arm); follows the body type. */
    readonly rightHand: HandGrip | null;
    /**
     * Tints the whole avatar red by `amount` (0 = its own colors, 1 = full red; P9-12 hits). Changes
     * the avatar's own material only, so nothing new is made per hit and nothing is drawn twice.
     */
    setFlash(amount: number): void;
    /**
     * Level of detail of a generated body: `full` near the camera, `lite` far away and on phones (the same body and
     * skeleton with fewer triangles). Other bodies ignore it.
     */
    setDetail(detail: 'full' | 'lite'): void;
    /**
     * The knocked-out look (P9-12): 0 stands, up to 1 fallen and faded out (see `downLook`). While
     * above 0 it owns the body's tilt, so callers leave `pose.rotation` alone.
     */
    setDown(amount: number): void;
    readonly down: number;
    dispose(): void;
}
interface BodyModel {
    geometry: BufferGeometry;
    material: Material | Material[];
    /** The model's morph target names (its blend shapes), by index. */
    morphs?: Record<string, number>;
    /** How the model's mouth blend shapes show the nine mouth shapes (lip sync P2-44); null without them. */
    mouth: MouthMorphs | null;
    /** Our generated body's baked data, for its shape variants (geometry by rounded Anime Shape and build). */
    human?: {
        data: HumanData;
        variants: Map<string, BufferGeometry>;
    };
}
/**
 * A model's skinned geometry bound to the body's own skeleton: vertices moved to their bind
 * position (the model's T-pose rest) and each skin index pointed at the body joint with the same
 * canonical bone name (including supported external namespaces). Unknown bones fall to
 * the root.
 */
export declare function bindModelGeometry(body: AvatarBody, source: BufferGeometry, boneNames: readonly string[], bindMatrix?: Matrix4): BufferGeometry;
/** Retains every material primitive in a locally imported character. */
export declare function mergeLocalBodyPrimitives(body: AvatarBody, scene: Group): BodyModel;
/** Loads a mesh body's model once (null for block bodies or when it cannot be loaded). */
export declare function loadBodyModel(body: AvatarBody): Promise<BodyModel | null>;
/** Register a user-selected local body without replacing the host's item resolver. */
export declare function registerLocalAvatarBody(body: AvatarBody): () => void;
/** How the app turns a body item id into a body (the place's body route and `bodyFromItem`); null: unknown. */
export declare function setItemBodyResolver(resolver: ((id: string) => Promise<AvatarBody | null>) | null): void;
/** Loads the model of a look's body (if it has one) before an avatar wears it. */
export declare function preloadAvatarLook(look: AvatarLook): Promise<void>;
/** Forward tilt of the body while swimming (radians). */
export declare const SWIM_TILT = 1.5;
/**
 * Clips played lying in the water and their tilt: the crawl almost flat on the surface (reference sheet: 2-3
 * degrees off flat), the breaststroke a little more upright for the breath.
 */
export declare const SWIM_CLIPS: ReadonlyMap<string, number>;
/** The body's forward tilt a clip is played with. */
export declare const clipTilt: (clip: string | null | undefined) => number;
/** Builds the Genvr avatar with its animation clips. */
export declare function createGenvrAvatar(look?: AvatarLook, options?: {
    cubes?: boolean;
    /** Called when a mesh body's model arrives and replaces the stand-in: rebind the animator. */
    onBodyReady?: () => void;
}): GenvrAvatar;
/** Arm raise (degrees above hanging) where the collarbone starts to lift, its share, and its limit. */
export declare const SHOULDER_LIFT: {
    from: number;
    share: number;
    max: number;
};
/** Curl of each finger segment (1, 2, 3) at a full grip, degrees; the thumb curls less. */
export declare const FINGER_CURL: {
    finger: number[];
    thumb: number[];
};
/**
 * A library animation as a clip of a body type. Each joint takes the rotations of the standard
 * bones mapped to it, combined parent first (all rest frames are aligned, so this is exact);
 * joints without animated bones stay at rest.
 */
export declare function clipFromAnimation(animation: AnimationItem, body?: AvatarBody): AnimationClip;
/** Every Core animation as clips of a body type (Classic when not given). */
export declare const createAvatarClips: (body?: AvatarBodyType) => AnimationClip[];
/** Rest position of a joint (world, T-pose), e.g. for tests and attachment points. */
export declare function restPosition(joint: string, body?: AvatarBodyType): Vector3;
export {};
