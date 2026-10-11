import { type AvatarLook, type GenvrManifest } from '../../contracts/index.js';
import { type AvatarBody } from './_body-type.js';
/**
 * A creator's uploaded body item as an `AvatarBody` (uploaded bodies, plan 2026-10-03, Task 2), built the way the
 * Core mesh bodies are (anime boy): the joints read from the file on upload, the standard bones played 1:1, no block
 * parts and no item fits, the model and picture from the item's package links. The runtime's skeleton, binding and
 * clips take it unchanged. Null for an item that is not a body, a non-creator id, or a rig without the core bones.
 */
export declare function bodyFromItem(manifest: GenvrManifest, files: {
    model: string;
    picture?: string;
}): AvatarBody | null;
/**
 * A player's look with a body they may wear (uploaded bodies, plan Task 4): Genvr's bodies always, a creator's body
 * item only when `allowed` lists it (the join ticket); any other body item becomes Classic. Read leniently, as the room
 * reads every look.
 */
export declare function keepAllowedBody(look: unknown, allowed: readonly string[]): AvatarLook;
