import type { CommandPayload, GroundMaterialRef } from '../contracts/index.js';
import { type Cover, type Soil, type TerrainData } from '../world/index.js';
import { type Object3D } from 'three/webgpu';
export type BrushMode = 'raise' | 'lower' | 'flatten' | 'smooth' | 'paint' | 'cover';
export type BrushSize = 'small' | 'medium' | 'large';
export interface BrushSettings {
    mode: BrushMode;
    size: BrushSize;
    /** Soil used by the paint mode. */
    soil: Soil;
    /** A library ground material to paint with (Realistic places, P2-37); counts as `soil`. */
    material?: GroundMaterialRef | null;
    /**
     * What the cover mode writes (P2-40). It is the same brush as the rest, because the thing being
     * dragged over the ground is the same; only the command at the end of the stroke differs.
     */
    cover: Cover;
}
export declare const DEFAULT_BRUSH: BrushSettings;
/** Brush radius in meters. */
export declare const BRUSH_RADIUS: Record<BrushSize, number>;
interface TerrainToolsOptions {
    scene: Object3D;
    terrain: TerrainData;
    apply: (command: CommandPayload) => boolean;
    beginGroup: () => void;
    endGroup: () => void;
    /** Ground point (x, y, z) under a screen position, or null. */
    groundPoint: (clientX: number, clientY: number) => [number, number, number] | null;
}
/**
 * Terrain brush and water tools (task P3-04). Dragging the brush paints strokes along the way;
 * a whole drag is one undo step. Water fills the basin under a tap, or digs a small pond first
 * when the ground is flat.
 */
export declare class TerrainTools {
    #private;
    private readonly options;
    settings: BrushSettings;
    constructor(options: TerrainToolsOptions);
    get radius(): number;
    get stroking(): boolean;
    setSettings(settings: Partial<BrushSettings>): void;
    /** Shows the brush ring under the pointer (mouse hover and while dragging). */
    hover(clientX: number, clientY: number): void;
    hideRing(): void;
    /** Starts a drag stroke; returns false when the pointer is not over the ground. */
    start(pointerId: number, clientX: number, clientY: number): boolean;
    move(pointerId: number, clientX: number, clientY: number): boolean;
    end(pointerId: number): void;
    /**
     * Fills the basin under the tap with water, or digs a small pond first on flat ground.
     * Returns a message for the player when no water can be placed.
     */
    fillWater(clientX: number, clientY: number): string | null;
    /** Fills the hollow at x, z with water, digging a pond first on flat ground. */
    fillWaterAt(x: number, z: number): string | null;
    dispose(): void;
}
export {};
