import type { CommandPayload, ItemInstance, WorldDocument } from '../contracts/index.js';
import { type TerrainData } from '../world/index.js';
import { type Camera, type Object3D } from 'three/webgpu';
import { type ItemSelection, type SnapSettings } from './item-tools.js';
import type { ItemsView } from './items.js';
import { type RoadMaterials } from './road-view.js';
import { type BlockToolSettings } from './block-tools.js';
import type { VoxelData } from '../world/index.js';
import { type BrushSettings } from './terrain-tools.js';
export type BuildTool = 'place' | 'select' | 'terrain' | 'cover' | 'water' | 'river' | 'road' | 'wall' | 'door' | 'window' | 'eraser' | 'blocks' | 'map';
export declare const BUILD_TOOLS: readonly BuildTool[];
/** What the river tool draws (P2-39): one width per river, how much it widens, how fast it runs. */
export interface RiverToolSettings {
    width: number;
    widen: number;
    flow: number;
}
export declare const DEFAULT_RIVER: RiverToolSettings;
/** Lanes and direction of the streets the road tool draws (R2g); lanes undefined = as many as fit. */
export interface RoadToolSettings {
    lanes?: number | undefined;
    oneway: boolean;
}
/** A lake or a river picked in the 3D view (P2-39). */
export interface SelectedWater {
    kind: 'water' | 'river';
    id: string;
}
export interface ToolStatus {
    tool: BuildTool | null;
    /** Points placed so far by the road or wall tool. */
    points: number;
    /** True when the drawing can be finished (enough points). */
    canFinish: boolean;
    /** Short feedback for the player (why something did not work), or null. */
    message: string | null;
    /** Item the place tool puts down. */
    placeItemId: string | null;
    /** Item selected by the select tool. */
    selected: ItemSelection | null;
    /** True while the selected item follows the pointer (next tap drops it). */
    moving: boolean;
    /** Terrain brush settings. */
    brush: BrushSettings;
    /** Road type the road tool draws (Core Library road type id). */
    roadType: string;
    road: RoadToolSettings;
    /** What the river tool draws (P2-39). */
    river: RiverToolSettings;
    /** The lake or river picked with the select tool, whose settings the properties panel shows. */
    water: SelectedWater | null;
    /** Digging and stacking on block ground (P2-26); null where the ground is a height field. */
    blocks?: BlockToolSettings | null;
    /** Where the Real place tool builds (the ground point last tapped with the map tool), or null for the middle. */
    mapSpot?: {
        x: number;
        z: number;
    } | null;
}
interface BuildToolsOptions {
    camera: Camera;
    canvas: HTMLCanvasElement;
    scene: Object3D;
    /** Ground to draw on (terrain) and structures to pick (walls, roads, floors). */
    ground: Object3D;
    structures: Object3D;
    items: ItemsView;
    water: Object3D;
    /** The rivers' meshes, so they can be picked and erased like other water (P2-39). */
    rivers: Object3D;
    terrain: TerrainData;
    roadMaterials: RoadMaterials;
    /** Commands between these two calls undo as one step. */
    beginGroup: () => void;
    endGroup: () => void;
    heightAt: (x: number, z: number) => number;
    /** Block ground (P2-26): roads are blocks, found by where they lie instead of by a mesh. */
    roadAt?: (x: number, z: number) => string | null;
    /** Block ground (P2-26): the blocks to dig and stack, and where the player stands. */
    blocks?: {
        voxels: VoxelData;
        player: () => {
            x: number;
            y: number;
            z: number;
        };
    };
    /** Block ground: the wall whose blocks stand in a column (doors, windows, and the eraser). */
    wallAt?: (x: number, z: number) => string | null;
    world: () => WorldDocument;
    apply: (command: CommandPayload) => boolean;
    /** True when an item rests where the rest law would put it (P2-43; copies and rows follow it). */
    isResting?: (instance: ItemInstance) => boolean;
    onStatus?: (status: ToolStatus) => void;
}
/**
 * Kid-first build tools (docs/BUILD-TOOLS.md): tap points on the ground to draw a road or a wall,
 * tap a wall to add a door or window, tap anything to erase it. Every result is a normal world
 * command, so undo, saving, and multiplayer work the same as for the AI assistant.
 */
export declare class BuildTools {
    #private;
    private readonly options;
    constructor(options: BuildToolsOptions);
    /** Digging and stacking settings (Stack or Dig, which block); switches to the Blocks tool. */
    setBlockTool(settings: Partial<BlockToolSettings>): void;
    /** Width, widening and flow the river tool draws with (P2-39); switches to the river tool. */
    setRiver(settings: Partial<RiverToolSettings>): void;
    /** Chooses the road type (street, dirt road, railway, ...) and switches to the road tool. */
    setRoadType(typeId: string): void;
    /** Lanes and direction of the streets the road tool draws (R2g). */
    setRoad(settings: Partial<RoadToolSettings>): void;
    /** Changes the terrain brush (mode, size, paint soil). */
    setBrush(settings: Partial<BrushSettings>): void;
    /**
     * Starts a drag at a pointer press; true when a tool took the pointer. Select tool: a handle
     * moves, turns, or resizes; Shift and drag draws a box to select items. Blocks tool: a drag
     * from a block digs or stacks a line or a rectangle.
     */
    startStroke(pointerId: number, clientX: number, clientY: number, shift?: boolean): boolean;
    /** Continues a brush drag; true when this pointer belongs to the brush. */
    moveStroke(pointerId: number, clientX: number, clientY: number): boolean;
    endStroke(pointerId: number, clientX?: number, clientY?: number): void;
    /** Arrow keys and Page Up / Page Down move the selection (select tool); true when handled. */
    nudge(dx: number, dy: number, dz: number): boolean;
    /** True while arrow keys move the selection instead of the player. */
    get arrowsNudge(): boolean;
    /** Chooses an item from the library and switches to the place tool. */
    setPlaceItem(itemId: string): void;
    /** An item's model changed (a package finished loading): redraw what shows it. */
    itemModelChanged(itemId: string): void;
    /** Grid and turn steps (studio snapping, P3-24). */
    setSnap(settings: Partial<SnapSettings>): void;
    /** One turn step of the item being placed or moved, or of the selected item. */
    rotateItem(): void;
    moveItem(): void;
    duplicateItem(): void;
    /** Repeats the selected item in a row (fences, trees). */
    rowItems(count?: number): void;
    deleteItem(): void;
    /** Digs and fills a pond at a ground position (the assistant's add_water). */
    addWater(x: number, z: number): string | null;
    /** Selects items by id (studio explorer); switches to the select tool. */
    selectItems(instanceIds: readonly string[]): void;
    /** Call after every applied command (keeps the selection outline in place). */
    afterCommand(): void;
    get tool(): BuildTool | null;
    setTool(tool: BuildTool | null): void;
    /** Removes the last drawn point (Backspace). */
    removeLastPoint(): void;
    cancel(): void;
    /** Finishes the current road or open wall (Enter or the Done button). */
    finish(closed?: boolean): boolean;
    /** A tap or click (no drag) at a screen position. */
    tap(clientX: number, clientY: number, add?: boolean): void;
    /** Mouse hover: shows where the next point would go. */
    hover(clientX: number, clientY: number): void;
    /** The ground or building surface under a screen point, unsnapped (filming spots, FILM-10). */
    groundAt(clientX: number, clientY: number): {
        x: number;
        z: number;
    } | null;
    dispose(): void;
}
export {};
