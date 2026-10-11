import { type BodyId, type AvatarLook, type AvatarScale, type PlaceAvatar } from '../../contracts/index.js';
import type { RigBone, V3 } from './_animation.js';
import { type CoreBody } from './_body-type.js';
import type { BodyArea } from './_wearable.js';
/**
 * The dressed avatar (tasks P2-20, P2-22): a body type's blocks with repainted areas, plus the worn
 * items fitted to that body. The runtime builds the skinned mesh from it and the pages draw the
 * avatar sketches from it, so both always show the same look.
 */
/** Body types in library order; Classic is the main avatar (decision 73). */
export declare const AVATAR_BODIES: readonly CoreBody[];
/**
 * Bodies players pick for themselves (the Look tab). The flat 2D body is a place body: it is
 * worn only where a side-view place uses it for everyone (decision 93).
 */
export declare const PLAYER_BODIES: readonly CoreBody[];
/**
 * One of Genvr's bodies by id. A creator's uploaded body (an item id) is not known here: Classic stands in for it, as
 * for any unknown id; the runtime resolves uploaded bodies from the store (uploaded bodies, 2026-10-03).
 */
export declare const findBody: (id: BodyId | undefined) => CoreBody;
/** The colors of a look, the body type, and the worn items (Core wearable ids). */
export interface LookInput {
    skin: string;
    hair: string;
    shirt: string;
    pants: string;
    shoes: string;
    body?: BodyId;
    scale?: AvatarScale;
    wear?: readonly string[];
}
/**
 * A body type at a size (P2-22), like Roblox body scales: joints, blocks, fits, and sketch data
 * grow together (height up, width across and deep), and the head grows around the neck. Sizes
 * round to 1 percent and each size is built once.
 */
export declare function sizedBody(id: BodyId | undefined, scale?: AvatarScale): CoreBody;
/** A block of the dressed avatar on one joint, with its final color (hex). */
export interface LookPart {
    joint: string;
    size: V3;
    center: V3;
    color: string;
    /** The worn item this block belongs to (none for the body itself). */
    item?: string;
    /** Body area of a body block. */
    area?: BodyArea;
    /** A face block (eyes, mouth): the runtime may draw it its own way (the mouth's shapes, lip sync P2-44). */
    face?: 'eyes' | 'mouth';
}
/** The dressed avatar: the body with repainted areas, then every worn item's blocks. */
export declare function lookParts(look: LookInput): LookPart[];
/** Bones an item's blocks follow on the Starter body. */
export declare const itemBones: (id: string) => RigBone[];
/** A look from anywhere (a client, an old save): valid colors, known items, one per slot and layer. */
export declare function normalizeAvatarLook(saved: unknown): AvatarLook;
/** Whether a place allows an item on players' own looks (limited places leave out large ones). */
export declare const allowedInPlace: (id: string, rules: Pick<PlaceAvatar, "mode">) => boolean;
/**
 * The look a player shows in a place (P2-21): their own, their own without large items, or the
 * place's outfit with their own skin, hair, and body type.
 */
export declare function applyPlaceAvatar(saved: unknown, rules: PlaceAvatar): AvatarLook;
