import type { GenvrManifest, PlacementRules, Style } from '../../contracts/index.js';
/**
 * 3D models of the Core Library built from simple shapes. They need no downloads, render as
 * one instanced draw call per item type, and look right in the blocky style. Store models arrive
 * as `.genvr` packages with glTF files instead.
 */
export type PartShape = 'box' | 'cylinder' | 'cone' | 'sphere' | 'pyramid' | 'wedge';
export interface ItemPart {
    shape: PartShape;
    /** Width, height, depth in meters (cylinder/cone/sphere: x = z = diameter). */
    size: readonly [number, number, number];
    /** Center of the part; y = 0 is the ground under the item. */
    position: readonly [number, number, number];
    color: string;
    /** Rotation about the vertical axis in radians. */
    rotationY?: number;
}
/** Build-panel group of a model (the item library tabs). */
export type ItemGroup = 'nature' | 'props' | 'buildings' | 'parts';
export interface CoreItem {
    manifest: GenvrManifest;
    group: ItemGroup;
    parts: readonly ItemPart[];
    /** Grid size in meters for block-style items that stack in cells (Minecraft-like). */
    grid?: number;
    /** Basic parts: width, height, and depth change freely (P3-25). */
    resizable?: boolean;
    /**
     * The same item drawn for a style (P2-26 stage 3): the Voxel look is built from small cubes; the
     * Realistic look is a real 3D model (P2-38). Places of that style use it; other styles use `parts`.
     */
    looks?: Partial<Record<Style, ItemLook>>;
    /**
     * Not opened to every place yet (decision 130): kept out of `CORE_ITEMS`, the catalogs and the library, but
     * found by `getCoreItem`, so a place built for the experiment can hold it. Opening it is one change: moving it
     * into `CORE_ITEMS`.
     */
    experimental?: true;
    /** The experiment the item belongs to (decision 130: the Tidewater world). */
    world?: 'tidewater';
    /** A lamp: it glows at night and lights what is around it (`at` in item metres, before turn and size). */
    light?: ItemLight;
}
/** Where a lamp item shines from at night, its colour, and how far its light reaches in metres. */
export interface ItemLight {
    at: readonly [number, number, number];
    color: string;
    range: number;
}
/** One level of a model look: a GLB file with its size. */
export interface ModelLevel {
    url: string;
    bytes: number;
    triangles: number;
}
/**
 * A look made from a real 3D model (P2-38): GLB levels, nearest first (the near model, a simpler
 * one, and for trees a flat picture), made from a CC0 or MIT source by tooling/realistic-models.
 */
export interface ModelLook {
    model: {
        levels: readonly ModelLevel[];
        bounds: ItemBounds;
        /**
         * What a player bumps into, where it is much smaller than the whole model (2026-09-29): a
         * tree's trunk, not its crown. Measured at body height by `tooling/realistic-models/trunks.mjs`.
         * The collider and the overlap and spawn checks use it; resting still uses `bounds`.
         */
        blocks?: ItemBounds;
        /** Picture for the library. */
        picture: string;
        source: {
            name: string;
            page: string;
            license: string;
        };
    };
}
/** A value of one generator parameter. */
export type GeneratedParam = number | string | boolean;
/** What an instance may set a generator parameter to: a number range, or one of some names. */
export interface GeneratedLimit {
    min?: number;
    max?: number;
    values?: readonly string[];
}
/** Author-declared groups; never infer behavior or grouping from a parameter name. */
export type GeneratedControlGroup = 'appearance' | 'motion' | 'behavior' | 'distribution' | 'general';
export interface GeneratedControlMetadata {
    group: GeneratedControlGroup;
    label: string;
    help: string;
    /** Only declare a unit when the generator actually uses it. */
    unit?: string;
}
/** Most generator parameters one item may have (`ItemInstance.params` keys, decision 130). */
export declare const GENERATED_PARAMS_MAX = 16;
/**
 * A look made by a runtime generator (Tidewater world, decision 130): geometry worked out in the runtime from
 * parameters, not a file. An instance may change the parameters within `limits` (`ItemInstance.params`); the
 * server refuses values outside them. The runtime registers the generator under `generator`.
 */
export interface GeneratedLook {
    generated: {
        /** Registered generator id, e.g. 'tidewater.palm'. */
        generator: string;
        /** Default parameters; an instance may override them within `limits`. */
        params: Readonly<Record<string, GeneratedParam>>;
        limits: Readonly<Record<string, GeneratedLimit>>;
        /** Optional documentation for known parameter keys. Legacy controls remain in General. */
        controls?: Readonly<Record<string, GeneratedControlMetadata>>;
        /** Bounds at the default parameters (placement, rest and the library picture). */
        bounds: ItemBounds;
        /** What a player bumps into, where much smaller than `bounds` (a palm's trunk). */
        blocks?: ItemBounds;
        /** Picture for the library. */
        picture: string;
        source: {
            name: string;
            page: string;
            license: string;
        };
    };
}
export type ItemLook = readonly ItemPart[] | ModelLook | GeneratedLook;
export declare const isModelLook: (look: ItemLook | undefined) => look is ModelLook;
export declare const isGeneratedLook: (look: ItemLook | undefined) => look is GeneratedLook;
/** The parts of an item in a style: its own parts for that style, else the default parts. */
export declare const itemParts: (item: Pick<CoreItem, "parts" | "looks">, style?: Style) => readonly ItemPart[];
/** The item's real 3D model in a style, if it has one (P2-38). */
export declare const itemModelLook: (item: Pick<CoreItem, "looks">, style?: Style) => ModelLook | null;
/** The item's generated look in a style, if it has one (decision 130). */
export declare const itemGeneratedLook: (item: Pick<CoreItem, "looks">, style?: Style) => GeneratedLook | null;
/** The first generated look of an item in any style (its parameters are the same in every style). */
export declare const anyGeneratedLook: (item: Pick<CoreItem, "looks">) => GeneratedLook | null;
export interface ItemBounds {
    min: [number, number, number];
    max: [number, number, number];
}
/**
 * Placement rules of Core models by kind (P2-11, owner note); a model can replace them with its
 * own `placement` fields. Parts and building blocks are free to go anywhere. Uploaded models
 * get the same rules for their kind (P4-10).
 */
export declare const KIND_PLACEMENT: Readonly<Record<string, PlacementRules | undefined>>;
/** One Core model; the file lives at `3d-models/<subcategory>/<slug>.ts`. */
export declare function defineModel(recipe: {
    id: string;
    name: string;
    subcategory: 'nature' | 'props-and-decor' | 'structures' | 'building-blocks' | 'parts' | 'gameplay';
    collider?: 'none' | 'box';
    grid?: number;
    resizable?: boolean;
    placement?: PlacementRules;
    /** Players climb it (ladders). */
    climbable?: boolean;
    /** A tool a player holds and uses in a game (P9-12). */
    tool?: GenvrManifest['tool'];
    /** A map marker of the rules: seen while building, hidden while playing (P9-12). */
    marker?: GenvrManifest['marker'];
    parts: ItemPart[];
    looks?: Partial<Record<Style, ItemLook>>;
    light?: ItemLight;
}): CoreItem;
export declare const box: (size: ItemPart["size"], position: ItemPart["position"], color: string, rotationY?: number) => ItemPart;
export declare const shape: (s: PartShape, size: ItemPart["size"], position: ItemPart["position"], color: string) => ItemPart;
/**
 * A yellow chevron lying on the bar of a gate at height `barTop`, its point toward +z (the
 * direction of travel), so a gate shows which way it faces from either side. The arms differ 2 cm in height where they meet. Its parts sit inside
 * the bar and stick out on top, so no face of it shares a plane with the bar (no flicker).
 */
export declare const directionMark: (barTop: number) => ItemPart[];
/** Shared colors of the blocky Core models. */
export declare const WOOD = "#9a6a3a";
export declare const DARK_WOOD = "#6e4a28";
export declare const LEAF = "#4caf50";
export declare const DARK_LEAF = "#2e7d32";
export declare const STONE = "#9aa3ad";
export declare const METAL = "#5b6470";
/** Base color of parts: near white, so an item's color param shows as picked. */
export declare const PART = "#ececf0";
/** Axis-aligned bounds of an item in its own space (parts turned about Y use their diagonal). */
export declare function itemBounds(parts: readonly ItemPart[]): ItemBounds;
/**
 * What a player bumps into on an item in a style (2026-09-29), or null where that is its whole
 * box. Follows the same look `itemBoundsForStyle` measures, so the two always describe one model.
 */
export declare function itemBlocksForStyle(item: CoreItem, style?: Style): ItemBounds | null;
/**
 * Where an item blocks, seen from above (2026-09-29): the middle of what a player bumps into and
 * a circle around it, at size 1 and not turned. Used to keep a starter world's spawn ring apart.
 */
export declare function itemFootprint(item: CoreItem, style?: Style): {
    x: number;
    z: number;
    radius: number;
};
/**
 * Bounds of an item's look in a specific style: from a 3D model if it has one, else calculated
 * from parts. For realistic-only models at other styles, falls back to any model look's bounds.
 */
export declare function itemBoundsForStyle(item: CoreItem, style?: Style): ItemBounds;
export declare function defineRealisticModel(recipe: {
    id: string;
    name: string;
    subcategory: 'nature' | 'props-and-decor' | 'structures';
    look: ModelLook;
    collider?: 'none' | 'box';
}): CoreItem;
/**
 * A Core model drawn by a runtime generator (Tidewater world, decision 130): Realistic only, marked experimental
 * and with its world, so it stays out of the catalogs until opened. The file lives at
 * `3d-models/tidewater/<subcategory>/<slug>.ts` with the id `genvr.core.tidewater.<slug>`.
 */
export declare function defineGeneratedModel(recipe: {
    id: string;
    name: string;
    subcategory: 'nature' | 'props-and-decor' | 'structures';
    look: GeneratedLook;
    collider?: 'none' | 'box';
    /** Triangles of the nearest level at the default parameters (the item budget). */
    triangles: number;
    placement?: PlacementRules;
}): CoreItem;
