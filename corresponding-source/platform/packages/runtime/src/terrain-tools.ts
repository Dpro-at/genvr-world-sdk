import type { CommandPayload, GroundMaterialRef } from '@genvr/contracts';
import { circleArea, planWaterFill, type Cover, type Soil, type TerrainData } from '@genvr/world';
import { DoubleSide, Mesh, MeshBasicMaterial, RingGeometry, type Object3D } from 'three/webgpu';

export type BrushMode = 'raise' | 'lower' | 'flatten' | 'smooth' | 'paint' | 'cover';
export type BrushSize = 'small' | 'medium' | 'large';

export interface BrushSettings {
  mode: BrushMode;
  size: BrushSize;
  /** Exact brush radius in metres (BUILD-B1, 1–100, as the MCP tools take it); the size preset decides when absent. */
  radius?: number | undefined;
  /** How much one stroke changes, 0.1–1 of the mode's normal effect (1 when absent). */
  strength?: number | undefined;
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

export const DEFAULT_BRUSH: BrushSettings = {
  mode: 'raise',
  size: 'medium',
  soil: 'sand',
  cover: 'plants',
};

/** Brush radius in meters. */
export const BRUSH_RADIUS: Record<BrushSize, number> = { small: 3, medium: 6, large: 10 };
/** Effect of one stroke (raise/lower: meters in the middle; flatten/smooth: blend). */
const STRENGTH = { raise: 0.35, lower: 0.35, flatten: 0.6, smooth: 0.5 } as const;
/** A new stroke is applied after the brush moved this share of its radius. */
const STROKE_SPACING = 0.35;
/** A dug pond: radius and depth (two soft 1 m strokes). */
const POND_RADIUS = 5;

const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

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
export class TerrainTools {
  settings: BrushSettings = { ...DEFAULT_BRUSH };
  #stroke: { pointerId: number; last: [number, number]; target: number } | null = null;
  readonly #ring = new Mesh(
    new RingGeometry(0.92, 1, 48),
    new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      side: DoubleSide,
    }),
  );

  constructor(private readonly options: TerrainToolsOptions) {
    this.#ring.rotation.x = -Math.PI / 2;
    this.#ring.renderOrder = 10;
    this.#ring.visible = false;
    this.#ring.userData.helper = true;
    options.scene.add(this.#ring);
  }

  get radius(): number {
    const exact = this.settings.radius;
    return exact !== undefined ? Math.min(100, Math.max(1, exact)) : BRUSH_RADIUS[this.settings.size];
  }

  get stroking(): boolean {
    return this.#stroke !== null;
  }

  setSettings(settings: Partial<BrushSettings>): void {
    // Choosing S, M or L goes back to the preset radius.
    const preset = settings.size !== undefined && settings.radius === undefined ? { radius: undefined } : {};
    this.settings = { ...this.settings, ...preset, ...settings };
  }

  /** Shows the brush ring under the pointer (mouse hover and while dragging). */
  hover(clientX: number, clientY: number): void {
    const point = this.options.groundPoint(clientX, clientY);
    this.#ring.visible = point !== null;
    if (!point) return;
    this.#ring.position.set(point[0], point[1] + 0.15, point[2]);
    this.#ring.scale.setScalar(this.radius);
  }

  hideRing(): void {
    this.#ring.visible = false;
  }

  /** Starts a drag stroke; returns false when the pointer is not over the ground. */
  start(pointerId: number, clientX: number, clientY: number): boolean {
    const point = this.options.groundPoint(clientX, clientY);
    if (!point) return false;
    this.options.beginGroup();
    // Flatten levels everything to the height where the drag started.
    this.#stroke = { pointerId, last: [point[0], point[2]], target: point[1] };
    this.#apply(point[0], point[2]);
    this.hover(clientX, clientY);
    return true;
  }

  move(pointerId: number, clientX: number, clientY: number): boolean {
    const stroke = this.#stroke;
    if (!stroke || stroke.pointerId !== pointerId) return false;
    this.hover(clientX, clientY);
    const point = this.options.groundPoint(clientX, clientY);
    if (!point) return true;
    if (Math.hypot(point[0] - stroke.last[0], point[2] - stroke.last[1]) >= this.radius * STROKE_SPACING) {
      stroke.last = [point[0], point[2]];
      this.#apply(point[0], point[2]);
    }
    return true;
  }

  end(pointerId: number): void {
    if (this.#stroke?.pointerId !== pointerId) return;
    this.#stroke = null;
    this.options.endGroup();
  }

  #apply(x: number, z: number): void {
    const area = circleArea(x, z, this.radius);
    const { mode, soil } = this.settings;
    if (mode === 'cover') {
      this.options.apply({ type: 'paint_cover', params: { area, cover: this.settings.cover } });
      return;
    }
    if (mode === 'paint') {
      const material = this.settings.material;
      this.options.apply({
        type: 'paint_terrain',
        params: material ? { area, soilId: material.soil, material } : { area, soilId: soil },
      });
      return;
    }
    this.options.apply({
      type: 'sculpt_terrain',
      params: {
        area,
        operation: mode,
        strength: Math.round(STRENGTH[mode] * Math.min(1, Math.max(0.1, this.settings.strength ?? 1)) * 1000) / 1000,
        soft: true,
        ...(mode === 'flatten' ? { targetHeight: Math.round(this.#stroke!.target * 100) / 100 } : {}),
      },
    });
  }

  /**
   * Fills the basin under the tap with water, or digs a small pond first on flat ground.
   * Returns a message for the player when no water can be placed.
   */
  fillWater(clientX: number, clientY: number): string | null {
    const point = this.options.groundPoint(clientX, clientY);
    if (!point) return 'Tap the ground to add water.';
    return this.fillWaterAt(point[0], point[2]);
  }

  /** Fills the hollow at x, z with water, digging a pond first on flat ground. */
  fillWaterAt(x: number, z: number): string | null {
    const terrain = this.options.terrain;
    this.options.beginGroup();
    let plan = planWaterFill(terrain, x, z);
    if (!plan) {
      const area = circleArea(x, z, POND_RADIUS);
      for (let i = 0; i < 2; i += 1)
        this.options.apply({
          type: 'sculpt_terrain',
          params: { area, operation: 'lower', strength: 1, soft: true },
        });
      plan = planWaterFill(terrain, x, z);
    }
    const added =
      plan !== null &&
      this.options.apply({
        type: 'add_water',
        params: { id: newId('water'), kind: 'lake', area: plan.area, level: plan.level, params: {} },
      });
    this.options.endGroup();
    return added ? null : 'Water cannot stay here.';
  }

  dispose(): void {
    this.options.scene.remove(this.#ring);
    this.#ring.geometry.dispose();
    (this.#ring.material as MeshBasicMaterial).dispose();
  }
}
