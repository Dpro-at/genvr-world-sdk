import type { CommandPayload, ItemInstance, WorldDocument } from '../contracts/index.js';
import { type Intersection, type Object3D, type Ray } from 'three/webgpu';
import { type ItemsView } from './items.js';
/** The items currently selected (one item, or every member of a group). */
export interface ItemSelection {
    /** The first selected item (the only one unless a group or several items are selected). */
    instanceId: string;
    itemId: string;
    name: string;
    /** Every selected item (task P3-26). */
    instanceIds: string[];
    /** Group of the selected items when the whole selection is one group. */
    groupId: string | null;
    /** True when any selected item is locked: no handles, moving, or deleting. */
    locked: boolean;
}
interface ItemToolsOptions {
    scene: Object3D;
    items: ItemsView;
    world: () => WorldDocument;
    apply: (command: CommandPayload) => boolean;
    heightAt: (x: number, z: number) => number;
    /** Raycast from a screen position against the given objects (nearest first). */
    cast: (clientX: number, clientY: number, targets: Object3D[]) => Intersection[];
    /** The pick ray through a screen position. */
    ray: (clientX: number, clientY: number) => Ray;
    /** Screen position (client pixels) of a world point, or null when it is behind the camera. */
    toScreen: (x: number, y: number, z: number) => {
        x: number;
        y: number;
    } | null;
    /** Surfaces items can stand on: terrain, structures, and other items. */
    surfaces: () => Object3D[];
    onChange: () => void;
    fail: (message: string) => void;
    /** Group the commands of one drag into one undo step. */
    beginGroup?: () => void;
    endGroup?: () => void;
    /**
     * True when an item rests where the rest law would put it (P2-43). Copies of a resting item
     * rest too; copies of an item placed in the air keep its height. Without it, an item counts as
     * resting when it stands on the ground.
     */
    isResting?: (instance: ItemInstance) => boolean;
}
/** Snapping (task P3-24): grid step in meters (0 = free) and turn step in radians. */
export interface SnapSettings {
    grid: number;
    angle: number;
}
/** By default items snap to a half-meter grid and turn in quarter turns. */
export declare const DEFAULT_SNAP: SnapSettings;
/**
 * Whether a command from a placement path asks the rest law for its height (P2-43): every path
 * does, except grid blocks (their cells are exact) and a drag on the y arrow (the creator chose
 * that height on purpose).
 */
export declare function asksForRest(grid: number | null, axis?: number): boolean;
/**
 * Place and select tools (task P3-03): a ghost follows the pointer, a tap places the item;
 * selected items can be turned, moved, duplicated, repeated in a row, or deleted. Every change
 * is a normal world command (undo, saving, and multiplayer just work).
 */
export declare class ItemTools {
    #private;
    private readonly options;
    constructor(options: ItemToolsOptions);
    /** Drag handles show on the selected item while the select tool is active. */
    setGizmoEnabled(on: boolean): void;
    /** Starts dragging a handle under the pointer; false when no handle was hit. */
    startGizmo(pointerId: number, clientX: number, clientY: number): boolean;
    /** Moves or turns the selection with the handle; snaps to the grid and turn steps. */
    moveGizmo(pointerId: number, clientX: number, clientY: number): boolean;
    /**
     * Moves the selection by a step (arrow keys, P3-24): `dx`, `dz` on the ground, `dy` up.
     * One undo step for the whole selection.
     */
    nudge(dx: number, dy: number, dz: number): boolean;
    /** Grid step for nudges (a tenth of a meter without a grid). */
    get nudgeStep(): number;
    get hasSelection(): boolean;
    /**
     * Box select (Shift and drag): every unlocked item whose middle is inside the screen
     * rectangle, with whole groups. `add` keeps the current selection.
     */
    selectInRect(left: number, top: number, right: number, bottom: number, add: boolean): void;
    endGizmo(pointerId: number): void;
    get placeItemId(): string | null;
    get moving(): boolean;
    get selection(): ItemSelection | null;
    /** Selects items by id (the studio explorer); an empty list clears the selection. */
    select(instanceIds: readonly string[]): void;
    /** Chooses the item the place tool puts down. */
    setPlaceItem(itemId: string | null): void;
    /** Leaves place/select mode (tool switched). */
    reset(): void;
    /** Quarter turn: the ghost while placing or moving, otherwise the selected item. */
    rotate(): void;
    hover(clientX: number, clientY: number): void;
    /** Place tool tap: puts the chosen item down (the tool stays active for more). */
    tapPlace(clientX: number, clientY: number): void;
    /**
     * Select tool tap: selects an item (with its group), or drops the item being moved. With
     * `add` (Shift or Ctrl), the item joins the selection, or leaves it when already selected.
     */
    tapSelect(clientX: number, clientY: number, add?: boolean): void;
    /** Grid and turn steps for placing, moving, and turning. */
    setSnap(settings: Partial<SnapSettings>): void;
    /** Instance id of the item under a screen position, or null. */
    pickItem(clientX: number, clientY: number, ignore?: string | null): string | null;
    /** Starts moving the selected item: the next tap drops it where the ghost is. */
    startMove(): void;
    /** Copies the selected item next to itself and selects the copy. */
    duplicate(): string | null;
    /** Makes a row of copies (fences, trees, lamps). */
    row(count: number): void;
    remove(): void;
    /** Keeps the selection outline on the selected item (call after every command). */
    refreshOutline(): void;
    /** An item's model changed (its package loaded): the ghost is drawn again on the next move. */
    modelChanged(itemId: string): void;
    dispose(): void;
}
export {};
