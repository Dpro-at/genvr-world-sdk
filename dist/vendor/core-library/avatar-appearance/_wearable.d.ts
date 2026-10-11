import type { AvatarColorPart, GenvrManifest } from '../../contracts/index.js';
import type { RigBone, V3 } from './_animation.js';
/**
 * Clothing and accessories (task P2-20) as plain data on the standard 52-bone rig. Every part is
 * a box that follows exactly one bone, in the rest frame of the Genvr avatar (T-pose facing +z,
 * left is +x, feet at y = 0, meters), so the runtime adds them to the one skinned body mesh.
 * Blocky fit only for now; realistic fits come with P2-18 (`manifest.styles`).
 */
/** Where an item is worn; one item per slot and layer, a new one replaces the old. */
export declare const WEAR_SLOTS: readonly ["hat", "face", "neck", "top", "bottom", "shoes", "back"];
export type WearSlot = (typeof WEAR_SLOTS)[number];
/**
 * Layered clothing (decision 92): an outer item (a jacket, a vest) is worn over an inner one of
 * the same slot (a hoodie). The outer layer's colors win, and inner blocks it would cover hide.
 */
export declare const WEAR_LAYERS: readonly ["inner", "outer"];
export type WearLayer = (typeof WEAR_LAYERS)[number];
/** A hex color, or one of the player's body colors (a hood in the shirt color). */
export type WearColor = AvatarColorPart | `#${string}`;
/** Body areas an item repaints (long sleeves paint the forearms in the shirt color). */
export type BodyArea = 'torso' | 'upperArms' | 'forearms' | 'upperLegs' | 'lowerLegs' | 'feet';
export interface WearablePart {
    bone: RigBone;
    size: V3;
    center: V3;
    color: WearColor;
    /** Hidden while an outer item of the same slot is worn (a hoodie pocket under a jacket). */
    covered?: boolean;
}
export interface WearableItem {
    manifest: GenvrManifest;
    slot: WearSlot;
    layer: WearLayer;
    parts: WearablePart[];
    paint: Partial<Record<BodyArea, WearColor>>;
    /** Sticks out far from the body (capes, wings): places may leave these out (P2-21). */
    large: boolean;
}
/** Declares a wearable; accessories are store type `avatar`, clothes are type `clothing`. */
export declare function defineWearable(item: {
    slug: string;
    name: string;
    slot: WearSlot;
    /** `outer` goes over an inner item of the same slot; most items are `inner`. */
    layer?: WearLayer;
    kind: 'clothing' | 'accessory';
    parts?: WearablePart[];
    paint?: WearableItem['paint'];
    large?: boolean;
}): WearableItem;
/** One box on one bone. */
export declare const wearBox: (bone: RigBone, size: V3, center: V3, color: WearColor, options?: {
    covered?: boolean;
}) => WearablePart;
/** The same part on both sides: `center` is the left one (+x), the right one is mirrored. */
export declare function pair(bone: (side: 'Left' | 'Right') => RigBone, size: V3, center: V3, color: WearColor): WearablePart[];
