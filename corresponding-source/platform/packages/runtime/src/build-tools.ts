import type { CommandPayload, ItemInstance, Wall, WorldDocument } from '@genvr/contracts';
import { DEFAULT_ROAD_TYPE, getRoadType } from '@genvr/core-library';
import {
  type TerrainData,
  roadProfile,
  nearestWallPosition,
  OPENING_PRESETS,
  openingError,
  riverProfile,
  riverShapeError,
  roadsCrossedBy,
  roadShapeError,
  wallShapeError,
  WALL_SURFACES,
  type WallSurface,
} from '@genvr/world';
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Raycaster,
  SphereGeometry,
  Vector2,
  Vector3,
  type Camera,
  type Object3D,
} from 'three/webgpu';
import { ItemTools, type ItemSelection, type SnapSettings } from './item-tools.js';
import type { ItemsView } from './items.js';
import { buildRoad, type RoadMaterials } from './road-view.js';
import { riverGeometry } from './river-view.js';
import { BlockTools, type BlockToolSettings } from './block-tools.js';
import type { VoxelData } from '@genvr/world';
import { buildWallMeshes } from './structures.js';
import { DEFAULT_BRUSH, TerrainTools, type BrushSettings } from './terrain-tools.js';

export type BuildTool =
  | 'place'
  | 'select'
  | 'terrain'
  | 'cover'
  | 'water'
  | 'river'
  | 'road'
  | 'wall'
  | 'door'
  | 'window'
  | 'eraser'
  | 'blocks'
  | 'map';
export const BUILD_TOOLS: readonly BuildTool[] = [
  'blocks',
  'place',
  'select',
  'terrain',
  'cover',
  'water',
  'river',
  'road',
  'wall',
  'door',
  'window',
  'eraser',
  'map',
];

/** What the river tool draws (P2-39): one width per river, how much it widens, how fast it runs. */
export interface RiverToolSettings {
  width: number;
  widen: number;
  flow: number;
}

export const DEFAULT_RIVER: RiverToolSettings = { width: 8, widen: 1.3, flow: 1.5 };

/** Lanes and direction of the streets the road tool draws (R2g); lanes undefined = as many as fit. */
export interface RoadToolSettings {
  lanes?: number | undefined;
  oneway: boolean;
  /** Metres across (2–16, BUILD-B5); the road type's width when absent. */
  width?: number | undefined;
  /** Raised sidewalk in metres (0.5–6) on the chosen sides; none when absent. */
  sidewalk?: number | undefined;
  sidewalkSide?: 'both' | 'left' | 'right' | undefined;
}

/** What the wall, door and window tools build (BUILD-B6): wall height and look, and the size of openings. */
export interface WallToolSettings {
  height: number;
  /** A wall look from the library; light plaster when absent. */
  surface?: WallSurface | undefined;
  door: { width: number; height: number };
  window: { width: number; height: number; bottom: number };
}

export const DEFAULT_WALL: WallToolSettings = {
  height: 3,
  door: { width: OPENING_PRESETS.door.width, height: OPENING_PRESETS.door.height },
  window: { ...OPENING_PRESETS.window },
};

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
  /** Wall height and look, door and window sizes (BUILD-B6). */
  wall?: WallToolSettings;
  /** The lake or river picked with the select tool, whose settings the properties panel shows. */
  water: SelectedWater | null;
  /** Digging and stacking on block ground (P2-26); null where the ground is a height field. */
  blocks?: BlockToolSettings | null;
  /** Where the Real place tool builds (the ground point last tapped with the map tool), or null for the middle. */
  mapSpot?: { x: number; z: number } | null;
  /** Metres along the points drawn so far by the road, wall or river tool (BUILD-B4). */
  length?: number;
  /** What the eraser would remove under the pointer (BUILD-B8), or null. */
  eraseTarget?: { kind: 'item' | 'road' | 'wall' | 'water' | 'river'; id: string; name: string } | null;
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
  blocks?: { voxels: VoxelData; player: () => { x: number; y: number; z: number } };
  /** Block ground: the wall whose blocks stand in a column (doors, windows, and the eraser). */
  wallAt?: (x: number, z: number) => string | null;
  world: () => WorldDocument;
  apply: (command: CommandPayload) => boolean;
  /** True when an item rests where the rest law would put it (P2-43; copies and rows follow it). */
  isResting?: (instance: ItemInstance) => boolean;
  onStatus?: (status: ToolStatus) => void;
}

/**
 * Tools the ground brush drives (P2-40). Terrain shapes the ground and Cover says what may grow on
 * it, but the thing the creator does is the same drag with the same ring, so it is the same brush
 * with a different command at the end of the stroke.
 */
const BRUSH_TOOLS = new Set<BuildTool | null>(['terrain', 'cover']);

/** Snap drawn points to half a meter so walls line up easily. */
const SNAP = 0.5;
/** Tap this close to the first wall point to close a room. */
const CLOSE_DISTANCE = 1.5;
/** Tap this close to the last road point to finish the road. */
const FINISH_DISTANCE = 1;

const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

/**
 * Kid-first build tools (docs/BUILD-TOOLS.md): tap points on the ground to draw a road or a wall,
 * tap a wall to add a door or window, tap anything to erase it. Every result is a normal world
 * command, so undo, saving, and multiplayer work the same as for the AI assistant.
 */
export class BuildTools {
  #tool: BuildTool | null = null;
  #eraseTarget: NonNullable<ToolStatus["eraseTarget"]> | null = null;
  #wall: WallToolSettings = { ...DEFAULT_WALL, door: { ...DEFAULT_WALL.door }, window: { ...DEFAULT_WALL.window } };
  #points: Array<[number, number]> = [];
  #hover: [number, number] | null = null;
  #message: string | null = null;
  readonly #raycaster = new Raycaster();
  readonly #preview = new Group();
  readonly #ghost = {
    wall: new MeshStandardMaterial({ color: 0xffd166, transparent: true, opacity: 0.55 }),
    floor: new MeshStandardMaterial({ color: 0xffd166, transparent: true, opacity: 0.35 }),
    marker: new MeshBasicMaterial({ color: 0xffb703 }),
    closing: new MeshBasicMaterial({ color: 0x06d6a0 }),
  };
  readonly #markerGeometry = new SphereGeometry(0.35, 12, 8);
  readonly #items: ItemTools;
  readonly #terrain: TerrainTools;
  readonly #blocks: BlockTools | null;
  #roadType: string = DEFAULT_ROAD_TYPE.id;
  #river: RiverToolSettings = { ...DEFAULT_RIVER };
  #road: RoadToolSettings = { oneway: false };
  #water: SelectedWater | null = null;
  #mapSpot: { x: number; z: number } | null = null;

  constructor(private readonly options: BuildToolsOptions) {
    this.#preview.name = 'build-preview';
    this.#preview.userData.helper = true;
    options.scene.add(this.#preview);
    this.#items = new ItemTools({
      scene: options.scene,
      items: options.items,
      world: options.world,
      apply: options.apply,
      heightAt: options.heightAt,
      cast: (x, y, targets) => this.#cast(x, y, targets),
      ray: (x, y) => {
        this.#cast(x, y, []);
        return this.#raycaster.ray;
      },
      toScreen: (x, y, z) => {
        const point = new Vector3(x, y, z).project(options.camera);
        if (point.z > 1) return null;
        const rect = options.canvas.getBoundingClientRect();
        return {
          x: rect.left + ((point.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - point.y) / 2) * rect.height,
        };
      },
      surfaces: () => [options.ground, options.structures, options.items.group],
      onChange: () => this.#emit(),
      fail: (message) => this.#fail(message),
      beginGroup: options.beginGroup,
      endGroup: options.endGroup,
      ...(options.isResting ? { isResting: options.isResting } : {}),
    });
    this.#terrain = new TerrainTools({
      scene: options.scene,
      terrain: options.terrain,
      apply: options.apply,
      beginGroup: options.beginGroup,
      endGroup: options.endGroup,
      groundPoint: (x, y) => {
        const hit = this.#cast(x, y, [options.ground])[0];
        return hit ? [hit.point.x, hit.point.y, hit.point.z] : null;
      },
    });
    this.#blocks = options.blocks
      ? new BlockTools({
          scene: options.scene,
          voxels: options.blocks.voxels,
          player: options.blocks.player,
          cast: (x, y) => this.#cast(x, y, [options.ground]),
          ray: (x, y) => {
            this.#cast(x, y, []);
            return this.#raycaster.ray;
          },
          apply: options.apply,
        })
      : null;
  }

  /** Digging and stacking settings (Stack or Dig, which block); switches to the Blocks tool. */
  setBlockTool(settings: Partial<BlockToolSettings>): void {
    if (!this.#blocks) return;
    this.#blocks.set(settings);
    if (this.#tool !== 'blocks') this.setTool('blocks');
    this.#emit();
  }

  /** Width, widening and flow the river tool draws with (P2-39); switches to the river tool. */
  setRiver(settings: Partial<RiverToolSettings>): void {
    this.#river = { ...this.#river, ...settings };
    if (this.#tool !== 'river') this.setTool('river');
    else this.#refresh();
  }

  /** Chooses the road type (street, dirt road, railway, ...) and switches to the road tool. */
  setRoadType(typeId: string): void {
    this.#roadType = getRoadType(typeId).id;
    if (this.#tool !== 'road') this.setTool('road');
    this.#refresh();
  }

  /** Height and look of new walls, and the size of new doors and windows (BUILD-B6). */
  setWall(settings: Partial<WallToolSettings>): void {
    this.#wall = { ...this.#wall, ...settings };
    this.#refresh();
  }

  /** Lanes and direction of the streets the road tool draws (R2g). */
  setRoad(settings: Partial<RoadToolSettings>): void {
    this.#road = { ...this.#road, ...settings };
    this.#refresh();
  }

  /** Changes the terrain brush (mode, size, paint soil). */
  setBrush(settings: Partial<BrushSettings>): void {
    this.#terrain.setSettings(settings);
    this.#emit();
  }

  /**
   * Starts a drag at a pointer press; true when a tool took the pointer. Select tool: a handle
   * moves, turns, or resizes; Shift and drag draws a box to select items. Blocks tool: a drag
   * from a block digs or stacks a line or a rectangle.
   */
  startStroke(pointerId: number, clientX: number, clientY: number, shift = false): boolean {
    if (this.#tool === 'blocks') return this.#blocks?.startDrag(pointerId, clientX, clientY) ?? false;
    if (this.#tool === 'select') {
      if (this.#items.startGizmo(pointerId, clientX, clientY)) return true;
      if (!shift) return false;
      this.#box = { pointerId, x: clientX, y: clientY, add: this.#items.hasSelection };
      return true;
    }
    if (!BRUSH_TOOLS.has(this.#tool)) return false;
    return this.#terrain.start(pointerId, clientX, clientY);
  }

  /** Continues a brush drag; true when this pointer belongs to the brush. */
  moveStroke(pointerId: number, clientX: number, clientY: number): boolean {
    const box = this.#box;
    if (box && box.pointerId === pointerId) {
      this.#drawBox(box.x, box.y, clientX, clientY);
      return true;
    }
    return (
      this.#terrain.move(pointerId, clientX, clientY) ||
      this.#items.moveGizmo(pointerId, clientX, clientY) ||
      (this.#blocks?.moveDrag(pointerId, clientX, clientY) ?? false)
    );
  }

  endStroke(pointerId: number, clientX?: number, clientY?: number): void {
    this.#terrain.end(pointerId);
    this.#items.endGizmo(pointerId);
    const problem = this.#blocks?.endDrag(pointerId, clientX, clientY);
    if (problem) this.#fail(problem);
    const box = this.#box;
    if (!box || box.pointerId !== pointerId) return;
    this.#box = null;
    this.#boxElement?.remove();
    this.#boxElement = null;
    if (clientX === undefined || clientY === undefined) return;
    // A tiny box is a Shift tap (handled by tap as "add to the selection").
    if (Math.hypot(clientX - box.x, clientY - box.y) < 8) return;
    this.#items.selectInRect(
      Math.min(box.x, clientX),
      Math.min(box.y, clientY),
      Math.max(box.x, clientX),
      Math.max(box.y, clientY),
      box.add,
    );
  }

  #box: { pointerId: number; x: number; y: number; add: boolean } | null = null;
  #boxElement: HTMLDivElement | null = null;

  /** The selection box over the 3D view (screen pixels). */
  #drawBox(x0: number, y0: number, x1: number, y1: number): void {
    if (!this.#boxElement) {
      const element = document.createElement('div');
      element.setAttribute('aria-hidden', 'true');
      Object.assign(element.style, {
        position: 'fixed',
        pointerEvents: 'none',
        border: '1.5px dashed rgba(255, 255, 255, 0.9)',
        background: 'rgba(255, 255, 255, 0.12)',
        boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.35)',
        zIndex: '5',
      });
      document.body.append(element);
      this.#boxElement = element;
    }
    Object.assign(this.#boxElement.style, {
      left: `${Math.min(x0, x1)}px`,
      top: `${Math.min(y0, y1)}px`,
      width: `${Math.abs(x1 - x0)}px`,
      height: `${Math.abs(y1 - y0)}px`,
    });
  }

  /** Arrow keys and Page Up / Page Down move the selection (select tool); true when handled. */
  nudge(dx: number, dy: number, dz: number): boolean {
    if (this.#tool !== 'select' || !this.#items.hasSelection) return false;
    const step = this.#items.nudgeStep;
    return this.#items.nudge(dx * step, dy * step, dz * step);
  }

  /** True while arrow keys move the selection instead of the player. */
  get arrowsNudge(): boolean {
    return this.#tool === 'select' && this.#items.hasSelection;
  }

  /** Chooses an item from the library and switches to the place tool. */
  setPlaceItem(itemId: string): void {
    this.setTool('place');
    this.#items.setPlaceItem(itemId);
    this.#emit();
  }

  /** An item's model changed (a package finished loading): redraw what shows it. */
  itemModelChanged(itemId: string): void {
    this.#items.modelChanged(itemId);
  }

  /** Grid and turn steps (studio snapping, P3-24). */
  setSnap(settings: Partial<SnapSettings>): void {
    this.#items.setSnap(settings);
  }

  /** One turn step of the item being placed or moved, or of the selected item. */
  rotateItem(): void {
    this.#items.rotate();
  }

  moveItem(): void {
    this.#items.startMove();
  }

  duplicateItem(): void {
    this.#items.duplicate();
  }

  /** Repeats the selected item in a row (fences, trees). */
  rowItems(count = 4): void {
    this.#items.row(count);
  }

  deleteItem(): void {
    this.#items.remove();
  }

  /** Digs and fills a pond at a ground position (the assistant's add_water). */
  addWater(x: number, z: number): string | null {
    return this.#terrain.fillWaterAt(x, z);
  }

  /** Selects items by id (studio explorer); switches to the select tool. */
  selectItems(instanceIds: readonly string[]): void {
    if (this.#tool !== 'select') this.setTool('select');
    this.#items.select(instanceIds);
  }

  /** Call after every applied command (keeps the selection outline in place). */
  afterCommand(): void {
    this.#items.refreshOutline();
    // A selected item may have been renamed, locked, grouped, or removed (explorer, undo, others).
    if (this.#items.selection || this.#tool === 'select') this.#emit();
  }

  get tool(): BuildTool | null {
    return this.#tool;
  }

  setTool(tool: BuildTool | null): void {
    if (tool !== this.#tool) this.#items.reset();
    if (!BRUSH_TOOLS.has(tool)) this.#terrain.hideRing();
    // The two brush tools keep their own mode, so picking Terrain again does not leave the creator
    // painting cover, and picking Cover again does not start raising the ground.
    if (tool === 'cover') this.#terrain.setSettings({ mode: 'cover' });
    else if (tool === 'terrain' && this.#terrain.settings.mode === 'cover')
      this.#terrain.setSettings({ mode: DEFAULT_BRUSH.mode });
    if (tool !== 'blocks') this.#blocks?.hide();
    this.#tool = tool;
    this.#items.setGizmoEnabled(tool === 'select');
    this.#points = [];
    this.#hover = null;
    this.#message = null;
    if (tool !== 'select') this.#water = null;
    this.#refresh();
  }

  /** Removes the last drawn point (Backspace). */
  removeLastPoint(): void {
    this.#points.pop();
    this.#refresh();
  }

  cancel(): void {
    if (this.#tool === 'place' || this.#tool === 'select') this.#items.reset();
    this.#points = [];
    this.#message = null;
    this.#refresh();
  }

  /** Finishes the current road or open wall (Enter or the Done button). */
  finish(closed = false): boolean {
    const points = this.#points;
    if (this.#tool === 'road' && points.length >= 2) {
      const error = roadShapeError(points);
      if (error) return this.#fail(error);
      const type = getRoadType(this.#roadType);
      const road = { roadId: newId('road'), points, width: this.#road.width ?? type.width, materialId: type.id, ...this.#markings(type.look), ...this.#sidewalk() };
      if (!this.options.apply({ type: 'draw_road', params: road }))
        return this.#fail('The road cannot go there.');
    } else if (this.#tool === 'river' && points.length >= 2) {
      const error = riverShapeError(points);
      if (error) return this.#fail(error);
      if (
        !this.options.apply({
          type: 'draw_river',
          params: { riverId: newId('river'), points, ...this.#river },
        })
      )
        return this.#fail('The river cannot go there.');
      // The river is built; the builder is warned about roads it now runs under, which stay flat
      // over the new channel until they are drawn again (P2-39).
      const world = this.options.world();
      const crossed = roadsCrossedBy(
        riverProfile(
          { heightAt: this.options.heightAt },
          points,
          this.#river.width,
          this.#river.widen,
          world.environment.water,
          world.environment.sea?.level ?? null,
        ),
        world.roads,
      );
      if (crossed.length > 0) {
        this.#points = [];
        this.#message = `The river runs under ${crossed.join(' and ')}. Draw ${crossed.length > 1 ? 'those roads' : 'that road'} again so ${crossed.length > 1 ? 'they bridge' : 'it bridges'} it.`;
        this.#refresh();
        return true;
      }
    } else if (this.#tool === 'wall' && points.length >= 2) {
      const error = wallShapeError(points, closed);
      if (error) return this.#fail(error);
      const look = this.#wall.surface ? { materialId: WALL_SURFACES[this.#wall.surface] } : {};
      const params = { wallId: newId('wall'), points, closed, height: this.#wall.height, ...look };
      if (!this.options.apply({ type: 'draw_wall', params }))
        return this.#fail('The wall cannot go there.');
    } else {
      return false;
    }
    this.#points = [];
    this.#message = null;
    this.#refresh();
    return true;
  }

  /** A tap or click (no drag) at a screen position. */
  tap(clientX: number, clientY: number, add = false): void {
    const tool = this.#tool;
    if (!tool) return;
    if (tool === 'place') {
      this.#items.tapPlace(clientX, clientY);
      return;
    }
    if (tool === 'select') {
      const before = this.#items.selection;
      this.#items.tapSelect(clientX, clientY, add);
      // Nothing was hit: the tap may be on a lake or a river, which have their own settings
      // (P2-39). An item always wins, so water is only picked on empty water.
      if (!this.#items.selection && !before) {
        const hit = this.#cast(clientX, clientY, [this.options.water, this.options.rivers])[0];
        const name = hit?.object.name ?? '';
        this.#water = name.startsWith('water:')
          ? { kind: 'water', id: name.slice('water:'.length) }
          : name.startsWith('river:')
            ? { kind: 'river', id: name.slice('river:'.length) }
            : null;
      } else this.#water = null;
      this.#emit();
      return;
    }
    // The brush already worked on the press (see startStroke). Written out rather than asking
    // BRUSH_TOOLS, because what is left after it has to narrow to the door and window tools below.
    if (tool === 'terrain' || tool === 'cover') return;
    if (tool === 'blocks') {
      const problem = this.#blocks ? this.#blocks.tap(clientX, clientY) : 'This place has no blocks.';
      if (problem) this.#fail(problem);
      else if (this.#message) {
        this.#message = null;
        this.#emit();
      }
      this.#blocks?.hover(clientX, clientY);
      return;
    }
    if (tool === 'water') {
      const problem = this.#terrain.fillWater(clientX, clientY);
      if (problem) this.#fail(problem);
      else {
        this.#message = null;
        this.#emit();
      }
      return;
    }
    if (tool === 'map') {
      // The Real place tool (plan 2026-10-06-real-place): a tap picks where the real area is built.
      const point = this.#groundPoint(clientX, clientY);
      if (!point) return;
      this.#mapSpot = { x: point[0], z: point[1] };
      this.#emit();
      return;
    }
    if (tool === 'road' || tool === 'wall' || tool === 'river') {
      const point = this.#groundPoint(clientX, clientY);
      if (!point) return;
      const first = this.#points[0];
      const last = this.#points[this.#points.length - 1];
      if (
        tool === 'wall' &&
        first &&
        this.#points.length >= 3 &&
        this.#distance(point, first) < CLOSE_DISTANCE
      ) {
        this.finish(true);
        return;
      }
      if (last && this.#distance(point, last) < FINISH_DISTANCE) {
        this.finish();
        return;
      }
      this.#points.push(point);
      this.#message = null;
      this.#refresh();
      return;
    }
    if (tool === 'eraser') {
      const item = this.#items.pickItem(clientX, clientY);
      if (item) {
        this.options.apply({ type: 'remove_item', params: { instanceId: item } });
        return;
      }
      const water = this.#cast(clientX, clientY, [
        this.options.structures,
        this.options.water,
        this.options.rivers,
      ])[0];
      if (water?.object.name.startsWith('water:')) {
        this.options.apply({
          type: 'remove_water',
          params: { waterId: water.object.name.slice('water:'.length) },
        });
        return;
      }
      if (water?.object.name.startsWith('river:')) {
        this.options.apply({
          type: 'remove_river',
          params: { riverId: water.object.name.slice('river:'.length) },
        });
        return;
      }
    }
    const blockWall = this.options.wallAt ? this.#pickBlockWall(clientX, clientY) : null;
    if (blockWall && (tool === 'eraser' || tool === 'door' || tool === 'window')) {
      if (tool === 'eraser')
        this.options.apply({ type: 'remove_wall', params: { wallId: blockWall.wall.id } });
      else this.#addOpening(blockWall.wall, tool, blockWall.x, blockWall.z);
      return;
    }
    const hit = this.#pickStructure(clientX, clientY);
    if (tool === 'eraser') {
      if (!hit) {
        const point = this.options.roadAt ? this.#groundPoint(clientX, clientY) : null;
        const roadId = point ? this.options.roadAt!(point[0], point[1]) : null;
        if (roadId) this.options.apply({ type: 'remove_road', params: { roadId } });
        return;
      }
      const [kind, id] = hit.name.split(':') as [string, string];
      if (kind === 'road') this.options.apply({ type: 'remove_road', params: { roadId: id } });
      else if (kind === 'wall' || kind === 'floor')
        this.options.apply({ type: 'remove_wall', params: { wallId: id } });
      return;
    }
    // Door or window.
    if (!hit || !hit.name.startsWith('wall:')) {
      this.#fail('Tap a wall to add it.');
      return;
    }
    const wall = this.options.world().walls.find((w) => `wall:${w.id}` === hit.name);
    if (!wall) return;
    this.#addOpening(wall, tool, hit.point.x, hit.point.z);
  }

  /**
   * Block ground (P2-26): the wall a tap lands on, found from the block behind the tapped face
   * (walls are blocks there, not meshes of their own).
   */
  #pickBlockWall(clientX: number, clientY: number): { wall: Wall; x: number; z: number } | null {
    const hit = this.#cast(clientX, clientY, [this.options.ground])[0];
    if (!hit?.face) return null;
    const x = hit.point.x - hit.face.normal.x * 0.5;
    const z = hit.point.z - hit.face.normal.z * 0.5;
    const id = this.options.wallAt!(x, z);
    const wall = id ? this.options.world().walls.find((w) => w.id === id) : undefined;
    return wall ? { wall, x, z } : null;
  }

  /** Mouse hover: shows where the next point would go. */
  hover(clientX: number, clientY: number): void {
    if (this.#tool === 'eraser') {
      const next = this.#eraseTargetAt(clientX, clientY);
      if (next?.kind !== this.#eraseTarget?.kind || next?.id !== this.#eraseTarget?.id) {
        this.#eraseTarget = next;
        this.#emit();
      }
      return;
    }
    if (this.#tool === 'place' || this.#tool === 'select') {
      this.#items.hover(clientX, clientY);
      return;
    }
    if (BRUSH_TOOLS.has(this.#tool)) {
      this.#terrain.hover(clientX, clientY);
      return;
    }
    if (this.#tool === 'blocks') {
      this.#blocks?.hover(clientX, clientY);
      return;
    }
    if (this.#tool !== 'road' && this.#tool !== 'wall') return;
    this.#hover = this.#groundPoint(clientX, clientY);
    this.#refreshPreview();
  }

  /** What a click of the eraser would remove at this point, in the same order as the click itself. */
  #eraseTargetAt(clientX: number, clientY: number): NonNullable<ToolStatus['eraseTarget']> | null {
    const world = this.options.world();
    const item = this.#items.pickItem(clientX, clientY);
    if (item) {
      const instance = world.instances.find((i) => i.instanceId === item);
      return { kind: 'item', id: item, name: instance?.name ?? instance?.itemId.split('.').pop() ?? 'Item' };
    }
    const hit = this.#cast(clientX, clientY, [this.options.structures, this.options.water, this.options.rivers])[0];
    const [kind, id] = (hit?.object.name ?? '').split(':') as [string, string | undefined];
    if (id && kind === 'water') return { kind: 'water', id, name: world.environment.water.find((w) => w.id === id)?.name ?? 'Water' };
    if (id && kind === 'river') {
      const river = world.environment.rivers.find((r) => r.id === id);
      return { kind: 'river', id, name: river?.name ?? `River · ${river?.width ?? ''} m` };
    }
    const structure = this.#pickStructure(clientX, clientY);
    const [skind, sid] = (structure?.name ?? '').split(':') as [string, string | undefined];
    if (sid && skind === 'road') {
      const road = world.roads.find((r) => r.id === sid);
      return { kind: 'road', id: sid, name: road?.name ?? `${getRoadType(road?.materialId ?? DEFAULT_ROAD_TYPE.id).name} · ${road?.width ?? ''} m` };
    }
    if (sid && (skind === 'wall' || skind === 'floor')) {
      const wall = world.walls.find((w) => w.id === sid);
      return { kind: 'wall', id: sid, name: wall?.name ?? (wall?.closed ? 'Room' : 'Wall') };
    }
    return null;
  }

  #addOpening(wall: Wall, kind: 'door' | 'window', x: number, z: number) {
    const { segment, offset } = nearestWallPosition(wall, x, z);
    const size = kind === 'door' ? { ...this.#wall.door, bottom: 0 } : this.#wall.window;
    const opening = {
      id: newId(kind),
      kind,
      segment,
      offset: Math.round(offset * 10) / 10,
      ...size,
    };
    const error = openingError(wall, opening);
    if (error) {
      this.#fail(error);
      return;
    }
    if (!this.options.apply({ type: 'add_wall_opening', params: { wallId: wall.id, opening } }))
      this.#fail('It does not fit here.');
    else {
      this.#message = null;
      this.#emit();
    }
  }

  #fail(message: string): false {
    this.#message = message;
    this.#emit();
    return false;
  }

  #distance(a: readonly [number, number], b: readonly [number, number]) {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  #cast(clientX: number, clientY: number, targets: Object3D[]) {
    const rect = this.options.canvas.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.#raycaster.setFromCamera(ndc, this.options.camera);
    return this.#raycaster.intersectObjects(targets, true);
  }

  /** The ground or building surface under a screen point, unsnapped (filming spots, FILM-10). */
  groundAt(clientX: number, clientY: number): { x: number; z: number } | null {
    const hit = this.#cast(clientX, clientY, [this.options.ground, this.options.structures])[0];
    return hit ? { x: hit.point.x, z: hit.point.z } : null;
  }

  #groundPoint(clientX: number, clientY: number): [number, number] | null {
    const hit = this.#cast(clientX, clientY, [this.options.ground, this.options.structures])[0];
    return hit ? [snap(hit.point.x), snap(hit.point.z)] : null;
  }

  #pickStructure(clientX: number, clientY: number) {
    const hit = this.#cast(clientX, clientY, [this.options.structures])[0];
    if (!hit) return null;
    // Real buildings are one merged mesh (Real place R4): the hit face says which wall it belongs to.
    const wallIdAt = hit.object.userData.wallIdAt as ((face: number) => string | null) | undefined;
    if (wallIdAt) {
      const id = hit.faceIndex == null ? null : wallIdAt(hit.faceIndex);
      return id ? { name: `wall:${id}`, point: hit.point } : null;
    }
    return { name: hit.object.name, point: hit.point };
  }

  #emit() {
    const drawsALine = this.#tool === 'road' || this.#tool === 'wall' || this.#tool === 'river';
    const needed = drawsALine ? 2 : Infinity;
    this.options.onStatus?.({
      tool: this.#tool,
      points: this.#points.length,
      canFinish: this.#points.length >= needed,
      message: this.#message,
      placeItemId: this.#items.placeItemId,
      selected: this.#items.selection,
      moving: this.#items.moving,
      brush: { ...this.#terrain.settings },
      roadType: this.#roadType,
      road: { ...this.#road },
      river: { ...this.#river },
      wall: { ...this.#wall, door: { ...this.#wall.door }, window: { ...this.#wall.window } },
      water: this.#water ? { ...this.#water } : null,
      blocks: this.#blocks?.settings ?? null,
      mapSpot: this.#mapSpot ? { ...this.#mapSpot } : null,
      length: Math.round(this.#points.reduce((sum, point, i) => (i ? sum + Math.hypot(point[0] - this.#points[i - 1]![0], point[1] - this.#points[i - 1]![1]) : 0), 0) * 10) / 10,
      eraseTarget: this.#eraseTarget,
    });
  }

  /** The sidewalk of a new road (R2h), when one is chosen. */
  #sidewalk(): { sidewalk?: number; sidewalkSide?: 'both' | 'left' | 'right' } {
    const { sidewalk, sidewalkSide } = this.#road;
    return sidewalk ? { sidewalk, ...(sidewalkSide && sidewalkSide !== 'both' ? { sidewalkSide } : {}) } : {};
  }

  /** Lanes and direction for a new road: streets only (other looks have no lane lines). */
  #markings(look: string): { lanes?: number; oneway?: boolean } {
    if (look !== 'street') return {};
    return { ...(this.#road.lanes ? { lanes: this.#road.lanes } : {}), ...(this.#road.oneway ? { oneway: true } : {}) };
  }

  #refresh() {
    this.#refreshPreview();
    this.#emit();
  }

  #clearPreview() {
    for (const child of [...this.#preview.children]) {
      this.#preview.remove(child);
      if (child instanceof Mesh && child.geometry !== this.#markerGeometry) child.geometry.dispose();
    }
  }

  /** Ghost of the road or wall being drawn, including the hovered next point. */
  #refreshPreview() {
    this.#clearPreview();
    const points = [...this.#points];
    if (this.#tool !== 'road' && this.#tool !== 'wall' && this.#tool !== 'river') return;
    const first = points[0];
    const closing =
      this.#tool === 'wall' &&
      first &&
      points.length >= 3 &&
      this.#hover !== null &&
      this.#distance(this.#hover, first) < CLOSE_DISTANCE;
    if (this.#hover && !closing) points.push(this.#hover);
    const heightAt = this.options.heightAt;
    if (points.length >= 2) {
      if (this.#tool === 'road' && !roadShapeError(points)) {
        const type = getRoadType(this.#roadType);
        const samples = roadProfile({ heightAt }, points, this.options.world().environment.water);
        const built = buildRoad(
          { id: 'preview', width: this.#road.width ?? type.width, materialId: type.id, ...this.#markings(type.look), ...this.#sidewalk() },
          samples,
          heightAt,
          this.options.roadMaterials,
          { ghost: true, lift: 0.25 },
        );
        for (const mesh of built.meshes) this.#preview.add(mesh);
      } else if (this.#tool === 'river' && !riverShapeError(points)) {
        // The ghost is the real ribbon, so the builder sees where the water will actually run and
        // how far it cuts in, not just the line they tapped.
        const world = this.options.world();
        const samples = riverProfile(
          { heightAt },
          points,
          this.#river.width,
          this.#river.widen,
          world.environment.water,
          world.environment.sea?.level ?? null,
        );
        if (samples.length >= 2) {
          const ghost = new Mesh(
            riverGeometry(samples),
            new MeshBasicMaterial({ color: 0x5fb8d8, transparent: true, opacity: 0.55 }),
          );
          ghost.position.y = 0.05;
          this.#preview.add(ghost);
          // A marker on every waterfall, so a steep drop is seen before the river is built.
          for (const sample of samples) {
            if (sample.kind !== 'waterfall') continue;
            const marker = new Mesh(
              this.#markerGeometry,
              new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
            );
            marker.position.set(sample.x, sample.surface + 0.3, sample.z);
            this.#preview.add(marker);
          }
        }
      } else if (this.#tool === 'wall' && !wallShapeError(points, Boolean(closing))) {
        const wall: Wall = { id: 'preview', points, height: this.#wall.height, closed: Boolean(closing), openings: [], ...(this.#wall.surface ? { materialId: WALL_SURFACES[this.#wall.surface] } : {}) };
        for (const mesh of buildWallMeshes(wall, heightAt, this.#ghost).meshes) this.#preview.add(mesh);
      }
    }
    this.#points.forEach(([x, z], i) => {
      const marker = new Mesh(
        this.#markerGeometry,
        i === 0 && closing ? this.#ghost.closing : this.#ghost.marker,
      );
      marker.position.set(x, heightAt(x, z) + 0.4, z);
      if (i === 0 && closing) marker.scale.setScalar(1.6);
      this.#preview.add(marker);
    });
  }

  dispose(): void {
    this.#items.dispose();
    this.#terrain.dispose();
    this.#clearPreview();
    this.options.scene.remove(this.#preview);
    this.#markerGeometry.dispose();
    for (const material of Object.values(this.#ghost)) material.dispose();
  }
}
