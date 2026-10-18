import { SceneLighting } from './scene-lighting.js';
import { avatarMotionEntry } from './avatar-motion-library.js';
import { retargetAvatarMotion } from './avatar-motion.js';
import type { AvatarExpression } from './avatar-expression.js';
import { TidewaterLighting } from './tidewater-sky/lighting.js';
import { builderAssembly, exportBuilderSelection } from './builder-export.js';
import { TidewaterGround } from './tidewater-ground/index.js';
import { TidewaterWorldWind } from './vegetation/world-wind.js';
import { PalmWorldBindings } from './vegetation/palm-bindings.js';
import { hasPalmGeometry, preparePalmModel } from './vegetation/palm-model.js';
import { createCanopyAssets } from './vegetation/canopy-assets.js';
import { CanopyWorldBindings } from './vegetation/canopy-bindings.js';
import { hasCanopyGeometry, prepareCanopyModel } from './vegetation/canopy-model.js';
import { CanopyLoading } from './vegetation/canopy-loading.js';
import { swellFromSetting } from './ocean/sea-clock.js';
import {
  SIZE_TIERS,
  readSkySettings,
  type PlaceBlockLook,
  type Ride,
  type RideModel,
  type CommandPayload,
  type ItemInstance,
  type SideMove,
  type VoiceLine,
  type WorldDocument,
} from '@genvr/contracts';
import {
  DEFAULT_GROUND,
  findAnimation,
  getCoreItem,
  getGround,
  resolveTerrainSurface,
  terrainSurfaceSoil,
  itemBlocksForStyle,
  itemBoundsForStyle,
  packageRestRule,
  restRule,
  SIT_ANIMATION_ID,
} from '@genvr/core-library';
import {
  CanvasTexture,
  Euler,
  Quaternion,
  Mesh,
  MeshStandardNodeMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Path,
  Raycaster,
  RepeatWrapping,
  Scene,
  Shape,
  ShapeGeometry,
  type BufferGeometry,
  SRGBColorSpace,
  Timer,
  TSL,
  Vector2,
  Vector3,
  WebGPURenderer,
  type Object3D,
} from 'three/webgpu';
import { AvatarAnimator, locomotionClip } from './animator.js';
import { createGenvrAvatar, DOWN_SECONDS, preloadAvatarLook, SWIM_TILT, type AvatarLook } from './avatar.js';
import {
  BuildTools,
  type BuildTool,
  type RiverToolSettings,
  type RoadToolSettings,
  type ToolStatus,
} from './build-tools.js';
import type { SnapSettings } from './item-tools.js';
import { CHASE_CAMERA, chaseCameraYaw, FOLLOW_CAMERA, nextCameraDistance, rayBoxDistance } from './camera.js';
import { GroundSpeed } from './ground-speed.js';
import {
  RIDER,
  RideController,
  rideInput,
  rideTilt,
  seatInWorld,
  seatLayout,
  type Pose4,
  type RideBounds,
} from './ride.js';
import { coreModelPackage, cutoutLeaves, ItemPackages, type PackageFetcher } from './item-packages.js';
import {
  CLIMB_OVER,
  itemColliderBox,
  itemGeometry,
  ItemsView,
  resolveItem,
  type Climbable,
  type LivePose,
} from './items.js';
import {
  isResting,
  restingPoint,
  ruleReport,
  SurfaceIndex,
  validateWorld,
  worldBox,
  type RestShape,
  type RuleResult,
  type WorldEnvironment,
  type WorldFinding,
  type WorldReport,
} from '@genvr/validator';
import { applyWithRest, beginRestGroup, endRestGroup, type RestContext } from './rest-apply.js';
import { RuleMarkers } from './rule-markers.js';
import { ViewCube, type ViewFace } from './view-cube.js';
import { PreviewRenderer } from './previews.js';
import {
  HIT_FLASH_SECONDS,
  NUMBER_ABOVE_HEAD,
  RemotePlayers,
  type RemotePlayerState,
} from './remote-players.js';
import { DamageNumbers } from './damage-numbers.js';
import type { BrushSettings } from './terrain-tools.js';
import type { BlockToolSettings } from './block-tools.js';
import { HeldTool, PlayerHands, strikeEmote, type HandsMode } from './player-hands.js';
import { DEFAULT_CLARITY, WaterView } from './water-view.js';
import {
  builtOver,
  drawnScatter,
  needsReselect,
  preImage,
  ScatterView,
  scatterChunksAfter,
} from './scatter-view.js';
import { FLOW_DRAG, RiverView } from './river-view.js';
import { WakeField } from './water-wake.js';
import { SOIL_COLORS, STYLE_LOOKS, type StyleLook } from './environment.js';
import { realisticQuality } from './realistic-quality.js';
import { SunShadows } from './shadows.js';
import { PostEffects } from './post-effects.js';
import { EnvironmentView } from './environment-view.js';
import { WorldAudio } from './audio.js';
import { SurfAudio, type SurfLogEntry } from './ocean/surf-audio.js';
import { initPhysics, PhysicsWorld } from './physics.js';
import { outerGroundGeometry } from './outer-ground.js';
import { createSwimMotion, stepSwimMotion, swimLookForward, swimFallout } from './swim-motion.js';
import { StructuresView } from './structures.js';
import { NightLights } from './night-lights.js';
import { SpeechMouth } from './speech.js';
import {
  SceneAnimationLayer,
  scenePose,
  travelPose,
  type SceneMotion,
  type ScenePose,
} from './scene-director.js';
import {
  CommandError,
  CommandHistory,
  BLOCKS,
  createWorldState,
  encodeTerrain,
  placeWaterAt,
  doorSpots,
  freeSpawnPoint,
  Replica,
  nearRoad as nearRoadOf,
  restLayers,
  roomFloorLevel,
  wallBoxes,
  riverFlowAt,
  type RiverProfile,
  VOXEL_EDGE_HEIGHT,
  VOXEL_ROAD_BLOCKS,
  type AppliedStep,
  type BlockName,
  type RideSurface,
  SOILS,
  TerrainFieldSampler,
  type Soil,
} from '@genvr/world';
import { TerrainColliders } from './terrain-physics.js';
import { TerrainView } from './terrain-view.js';
import { hydrateTerrainFieldSet, type TerrainFieldPageLoader } from './terrain-field-loader.js';
import { NativeTerrainColliders } from './terrain-native/colliders.js';
import { NativeTerrainView } from './terrain-native/view.js';
import { inspectResources, type DiagnosticOptions, type RuntimeDiagnostics } from './diagnostics.js';
import { GRASS_CARDS_URL, GrassView, type GrassGround } from './grass.js';
import { GroundTextures } from './ground-materials.js';
import {
  groundLayers,
  realisticGroundMaterial,
  realisticOuterMaterial,
  type GroundRules,
} from './terrain-realistic.js';
import { VoxelColliders } from './voxel-physics.js';
import { VoxelView } from './voxel-view.js';
import {
  firstGamepad,
  GamepadInput,
  KeyboardInput,
  mergeIntents,
  stickValue,
  TouchJoystickInput,
  type InputSource,
} from './input.js';

export interface RuntimeOptions {
  /** Optional filming rig, after gameplay camera and before environment/LOD/water update.
   * Return true on a camera cut to discard temporal rendering history. A structured result also declares
   * actor visibility while the filming camera replaces the gameplay camera. */
  onFilmFrame?: (
    camera: PerspectiveCamera,
    dt: number,
    player: { x: number; y: number; z: number },
  ) => boolean | { cut: boolean; actorVisible: boolean } | void;
  /** Called immediately after drawing, while the canvas framebuffer is readable. */
  onRendered?: () => void;
  container: HTMLElement;
  world: WorldDocument;
  /** Stored terrain chunks (encoded) from the API. */
  terrainChunks?: string[];
  /** Versioned field pages, fetched before any active terrain consumer is created. */
  loadTerrainFieldPage?: TerrainFieldPageLoader;
  loadSignal?: AbortSignal;
  /** Called with every command applied locally (edits, undo, redo), e.g. to save it. */
  /** `id` identifies the command for co-building confirmations (see confirmCommand). */
  /** A local change to report; `source` says whether it was an edit, an undo, or a redo. */
  onCommand?: (command: CommandPayload, id: string, source: 'edit' | 'undo' | 'redo') => void;
  /** Enables the build tools (owner and builders). */
  editable?: boolean;
  /** Build tool feedback for the UI (current tool, points drawn, messages). */
  onToolStatus?: (status: ToolStatus) => void;
  /** Colors of the player's avatar (default look when omitted). */
  avatarLook?: AvatarLook;
  /**
   * Device emulator in the studio (P3-06): the mouse acts as a finger, so dragging on the left
   * half moves the player like the touch joystick on a phone.
   */
  emulateTouch?: boolean;
  /**
   * Fetches the package of an item that is not in the Core Library (P2-16), e.g. from
   * `GET /v1/items/:id/package`; without it such items stay placeholder boxes.
   */
  fetchPackage?: PackageFetcher;
  /** Folder of the Draco decoder for compressed glTF models (default `/decoders/draco/`). */
  dracoPath?: string;
  /** Draws with WebGL 2 even where WebGPU works (checks the fallback of older devices). */
  forceWebGL?: boolean;
  /**
   * A world only looked at (scroll stories): no avatar is seen, and the hidden player is kept
   * under the camera, so grass, shadows and detail are made where the camera looks.
   */
  viewOnly?: boolean;
  /**
   * `side`: a 2D place seen from the side (decision 93). In play and Test the camera looks from
   * the side and players move left and right on one line; building stays free 3D.
   */
  playView?: 'free' | 'side';
  /** Extra moves of a side-view place, chosen by its creator (decision 95). */
  sideMoves?: readonly SideMove[];
  /** How blocks are drawn in places made of blocks, chosen by the owner (decision 110). */
  blockLook?: PlaceBlockLook;
  /**
   * Building with the avatar's hands (decision 109): sends a place or dig request to the room;
   * false when there is no room to send it to.
   */
  onPlayerBlocks?: (blocks: Array<[number, number, number, number]>) => boolean;
  /** Why a place or dig did not happen (too far, standing there, ...), to show the player. */
  onHandsNotice?: (message: string) => void;
  /**
   * The block in the avatar's hand changed (a block id, 0 when building is off), so the room can
   * show it to others (decision 109).
   */
  onHeldBlock?: (block: number) => void;
  /**
   * E, or Y on a game controller, was pressed (movement modes): get on the rideable item in reach, or
   * off the one ridden. Not in side-view places, where E dashes.
   */
  onInteract?: () => void;
}

/** Side view (decision 93): how far the camera stands from the line players move on, and how high. */
export const SIDE_CAMERA = { distance: 14, height: 2.5, minDistance: 8, maxDistance: 26 } as const;

export interface GenvrRuntime {
  /** Detached local save, including heightfield, voxel edits and loaded raster field pages. */
  snapshot(): { world: WorldDocument; terrainChunks: string[] };
  /** Explicit on-demand inventory; never walks scene resources on the animation loop. */
  diagnostics(options?: DiagnosticOptions): RuntimeDiagnostics;
  /** "WebGPU" or "WebGL2" (automatic fallback). */
  readonly backend: string;
  /**
   * The surf sound (Tidewater sea, plan task 6), for checks: what was scheduled lately and whether it played, how
   * many waterline stations listen, and whether a shore field is there (else the fake surf plays).
   */
  readonly surf: {
    readonly log: ReadonlyArray<SurfLogEntry>;
    readonly stations: number;
    readonly shoreReady: boolean;
  };
  /** Applies a world command locally; false when it cannot apply. Terrain, roads, and walls render now; items, water, and sky changes follow. */
  applyCommand(command: CommandPayload): boolean;
  /** Why the last command could not apply (world model message), or null after a success. */
  readonly lastCommandError: string | null;
  /** A mark in the undo history; `mergeUndoSince(mark)` later joins everything after it into one step. */
  undoMark(): number;
  mergeUndoSince(mark: number): void;
  /** Applies several commands as one undo step (e.g. locking every item of a group); false if any failed. */
  applyBatch(commands: readonly CommandPayload[]): boolean;
  undo(): boolean;
  redo(): boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  terrainHeightAt(x: number, z: number): number;
  /**
   * The place's ground is made of blocks (P2-26): height field tools (terrain, water, road, wall)
   * do not work on it yet.
   */
  readonly blockGround: boolean;
  /** Road types that can be laid on block ground (null: every type, on the height field). */
  readonly blockRoadTypes: readonly string[] | null;
  /** Selects a build tool (null = just play). No effect unless the runtime is editable. */
  setTool(tool: BuildTool | null): void;
  /**
   * World validator (P2-12): floating, buried, and overlapping items, the spawn point, and the
   * place's phone budget, with fix commands (apply them with `applyBatch`).
   */
  checkWorld(): WorldReport;
  /**
   * Where a new item stands at x, z (P2-11): the ground, a room floor, or on top of building
   * parts that fill the spot; with `on`, on top of that placed item. Null when `on` is unknown.
   */
  restingPoint(x: number, z: number, on?: string): [number, number, number] | null;
  /**
   * Placement rules of a placed item with kept or broken (P2-11 debug view), or null when the
   * item has no rules or is not loaded yet.
   */
  itemRules(instanceId: string): RuleResult[] | null;
  /**
   * Whether an item may stand at a spot by its placement rules (the assistant asks before
   * placing): null when it may, otherwise the first broken rule in words.
   */
  canStand(itemId: string, position: [number, number, number], yaw?: number): string | null;
  /**
   * Red boxes around these items and places in the world (debug view of the checks, such as a
   * door or a closed-in area players cannot reach); [] clears them.
   */
  markItems(instanceIds: readonly string[], areas?: ReadonlyArray<NonNullable<WorldFinding['area']>>): void;
  /**
   * Lets these items fall and come to rest with physics, like loose items in play (P2-11), and
   * saves where they land as one undo step. Items meant to float stay. Returns how many moved.
   */
  settleItems(instanceIds: readonly string[]): number;
  /** An item's name: Core Library or a loaded package (P2-16); null while not known yet. */
  itemName(itemId: string): string | null;
  /** Detached static selected item/group, with transforms and tints, for Builder saving. */
  exportSelectedItems(instanceIds: readonly string[]): Promise<ArrayBuffer>;
  previewSelectedItems(instanceIds: readonly string[]): Promise<string>;
  /** Picture of a library entry for catalogs (PNG data URL), rendered by the engine. */
  preview(kind: 'item' | 'road', id: string): Promise<string>;
  /** Chooses the road type for the road tool (switches to it). */
  setRoadType(typeId: string): void;
  /** What the river tool draws (P2-39). */
  setRiver(settings: Partial<RiverToolSettings>): void;
  /** Lanes and direction of the streets the road tool draws (R2g). */
  setRoad(settings: Partial<RoadToolSettings>): void;
  /** Changes the terrain brush (mode, size, paint soil). */
  setBrush(settings: Partial<BrushSettings>): void;
  /** Digging and stacking on block ground (Stack or Dig, which block); switches to the Blocks tool. */
  setBlockTool(settings: Partial<BlockToolSettings>): void;
  /** Chooses an item from the library (switches to the place tool). */
  setPlaceItem(itemId: string): void;
  /** Quarter turn of the item being placed or moved, or of the selected item. */
  rotateItem(): void;
  /** Grid step (meters, 0 = free) and turn step (radians) for placing, moving, and turning. */
  setSnap(settings: Partial<SnapSettings>): void;
  moveItem(): void;
  duplicateItem(): void;
  rowItems(count?: number): void;
  deleteItem(): void;
  /** Digs and fills a pond at x, z (assistant); returns an error message or null. */
  addWater(x: number, z: number): string | null;
  /** Selects items by id (studio explorer, P3-26); switches to the select tool. */
  selectItems(instanceIds: readonly string[]): void;
  /** Finishes the road or wall being drawn. */
  finishDrawing(): boolean;
  cancelDrawing(): void;
  removeLastPoint(): void;
  /** Current world document (read-only view; change it only through commands). */
  readonly world: WorldDocument;
  /** Player feet position. */
  readonly playerPosition: { x: number; y: number; z: number };
  /** Current avatar clip (movement clips or a library animation). */
  readonly avatarClip: string | null;
  /** Sit down (on a bench if one is close, otherwise on the ground) or stand up again. */
  toggleSit(): void;
  /**
   * Plays an animation from the library (P2-19) by item id; moving or jumping stops it. Sit
   * toggles sitting. Returns false for unknown animations.
   */
  playAnimation(id: string): boolean;
  presentAnimation(target: string, animationId: string): boolean;
  importAvatarMotion(target: string, id: string, data: ArrayBuffer): Promise<boolean>;
  presentExpression(target: string, expression: AvatarExpression): boolean;
  supportsAvatarExpression(target: string): boolean;
  readonly avatarState: {body:string;visible:boolean;mouth:import('@genvr/contracts').MouthShape;position:{x:number;y:number;z:number};headTop:number};
  /** Temporary filming pose; native sitting, emotes and player controls remain independent. */
  prepareSceneAnimation(id: string): Promise<boolean>;
  playSceneAnimation(id: string): boolean;
  /** Local production preview only: transient object choreography, never saved commands. */
  sceneMotion(instanceId: string, motion: SceneMotion, seconds: number): boolean;
  sceneActorIds(): string[];
  clearSceneMotions(): void;
  stopSceneAnimation(): void;
  /**
   * Filming (FILM-10): walks (or runs) the avatar to a spot on the ground the way a player would,
   * so it turns, climbs slopes and plays its walk; null stops it. The player's own keys pause meanwhile.
   */
  sceneWalk(to: { x: number; z: number } | null, run?: boolean): void;
  /** Filming (FILM-10): the ground spot under a screen point (page pixels); null off the ground or outside the editor. */
  groundAt(clientX: number, clientY: number): { x: number; z: number } | null;
  /**
   * Filming (FILM-10b): moves a scene object (the same objects as `sceneMotion`) from `from` (or where it stands)
   * along up to 8 ground spots at walking or running pace; it stays on the last spot until `clearSceneMotions`.
   * A `sceneMotion` on the same object plays on top of the walk.
   */
  sceneTravel(
    instanceId: string,
    from: { x: number; z: number } | null,
    to: ReadonlyArray<{ x: number; z: number }>,
    run?: boolean,
  ): boolean;
  /** Back to the spawn point of the place. */
  respawn(): void;
  /**
   * In a shared room the room puts the player back (R key, falling out): `ask` sends the request and returns true;
   * null (or false) puts the player back on this device. A respawn done here alone was corrected back by the room.
   */
  setRespawnRequest(ask: (() => boolean) | null): void;
  /** Off while a menu is open: movement keys and touch sticks are ignored. */
  setControlsEnabled(on: boolean): void;
  /**
   * Physics for loose (unanchored) items (P3-26): on while playing and testing, off while building
   * (items then show where they are saved). On by default when the runtime is not editable.
   */
  setSimulating(on: boolean): void;
  /**
   * Map markers of the rules (spawn points, P9-12): shown while building, hidden while playing
   * and testing (`setSimulating` sets it).
   */
  setMarkersVisible(on: boolean): void;
  /**
   * The game tool in the player's right hand (a Core Library item id, P9-12), or none. It takes the
   * hand: building with the hands is off while a tool is held.
   */
  setHeldTool(itemId: string | null): void;
  /**
   * Plays the Strike clip once and its sound (the player used the held tool). Only the look of a strike: false
   * when the avatar has no such clip; the attack is sent either way.
   */
  strike(): boolean;
  /**
   * A player was hit (P9-12): they flash red for a moment, "-damage" rises over their head, and
   * the hit is heard there. `self` is the local player; other ids are players shown in the room.
   */
  showHit(id: string | 'self', damage: number): void;
  /** Another player struck with their tool (the room's `struck`, P9-12): their Strike plays and is heard. */
  showStrike(id: string): void;
  /**
   * A player says a voice line (the room's `said`, lip sync P2-44): the sound plays from them and their mouth moves,
   * by the line's mouth cues or, without cues, by the sound's loudness. `self` is the local player.
   */
  say(id: string | 'self', line: { url: string; voice: Pick<VoiceLine, 'duration' | 'cues'> }, onMouth?: (shape: import('@genvr/contracts').MouthShape) => void): Promise<boolean>;
  /**
   * The local player is knocked out in a game (P9-12): the avatar falls and fades; false stands
   * it up again (respawn).
   */
  setKnockedOut(on: boolean): void;
  /**
   * The other player a strike of this reach and arc would hit now, nearest first, or null (sent
   * with the attack as the client's claim; the server judges on its own positions).
   */
  meleeTarget(reach: number, arcDeg: number): string | null;
  /** Player view settings (P3-21): camera turn speed, inverted up and down, names above players. */
  setViewSettings(settings: { cameraSensitivity: number; invertCamera: boolean; showNames: boolean }): void;
  /**
   * Graphics (P3-21): quality 0 = automatic, 1 (fastest) to 10 (sharpest) sets the pixel density
   * and shadows; fpsCap limits frames per second (0 = no limit).
   */
  setGraphics(settings: { quality: number; fpsCap: number }): void;
  /**
   * A picture of the current view without build helpers (selection, handles, drawing guides),
   * as base64 WebP (JPEG where WebP is missing), at most `maxWidth` pixels wide. For place
   * thumbnails and screenshots.
   */
  capture(maxWidth?: number): string;
  /** Loudness (0-1) of footsteps and other effects, and of the weather and nature ambience (P2-08). */
  setSpeechMouth(id: string, shape: import('@genvr/contracts').MouthShape): boolean;
  setVoiceRecordingStream(stream: MediaStream | null): void;
  setAudioVolumes(volumes: { effects: number; ambience: number }): void;
  /** The player's own avatar: colors and worn clothing and accessories (P2-20). */
  setPresentationBackdrop(on: boolean, navigation?: boolean): void;
  setAvatarLook(look: AvatarLook): void;
  /** Stops or restarts rendering (the studio pauses its own view while a device emulator runs). */
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  /** The world's sound as a live stream for filming (FILM-08); null before any sound has started. */
  worldSoundStream(): MediaStream | null;
  /** True while the local Realistic player can use underwater ascent/descent controls. */
  readonly divingAvailable: boolean;
  /** Performance of the last frames (studio console, P3-06). */
  stats(): { fps: number; drawCalls: number; triangles: number; objects: number };
  /** Jump once (on-screen button for touch screens). */
  jump(): void;
  /** Dash once (on-screen button in side-view places with the dash move, decision 95). */
  dash(): void;
  /** The local player's pose, sent to the realtime room. */
  readonly localPlayer: { x: number; y: number; z: number; yaw: number; clip: string };
  /** How players see the place (decision 93): `side` for 2D places seen from the side. */
  readonly playView: 'free' | 'side';
  /** Extra moves of a side-view place (decision 95). */
  readonly sideMoves: readonly SideMove[];
  /** Shows or updates another player in the same room. */
  upsertRemotePlayer(id: string, state: RemotePlayerState): void;
  removeRemotePlayer(id: string): void;
  /** Ids of the other players currently shown. */
  remotePlayerIds(): string[];
  /**
   * Co-building (P3-08): while on, local edits stay pending until the room confirms or rejects
   * them, and edits from others are applied with applyRemoteCommand.
   */
  setCollaborative(on: boolean): void;
  /** Another builder's edit, in the room's order. `resync` means reload the place. */
  applyRemoteCommand(command: CommandPayload): { dropped: string[]; resync: boolean };
  confirmCommand(id: string): void;
  /** Local edits the room has not confirmed yet, oldest first (resent after a reconnect). */
  pendingCommands(): Array<{ id: string; command: CommandPayload }>;
  /** The room refused one of our edits: it is taken out of the local world. */
  rejectCommand(id: string): { dropped: string[]; resync: boolean };
  /** Moves the player (zones, portals, respawn); without `y` the feet land on the ground. */
  /** `free`: a start or respawn spot, moved off any house or item first (never a correction or a rule's move). */
  teleportPlayer(position: { x: number; y?: number; z: number }, options?: { free?: boolean }): void;
  /** The place is made of blocks (P2-26): players may build with their hands there. */
  readonly hasBlocks: boolean;
  /**
   * Building with the avatar's hands (decision 109): whether the room allows it, the block in
   * hand, and what a tap does on touch screens (the mouse digs with the left and places with the
   * right button). Building works only while playing or testing.
   */
  setHands(settings: { allowed?: boolean; block?: BlockName; mode?: HandsMode }): void;
  /**
   * The room seated the local player on an item (movement modes): seat 1 steers it here (prediction
   * with the item's box collider), other seats ride along; the camera chases the item. False when the
   * item is unknown or not rideable here (building, side view). A new seat on the same item (moved up
   * to seat 1) takes over the steering.
   */
  startRide(instanceId: string, seat: number): boolean;
  /**
   * The room got the local player off (movement modes): they stand at `exit` (the room's exit spot).
   * The item stays where it was left until the room says otherwise.
   */
  endRide(exit?: { x: number; y: number; z: number; yaw?: number }): void;
  /** The room refused a move of the ridden item: it goes back to `pose` at once, standing still. */
  rideCorrection(pose: Pose4): void;
  /** What the local player rides, or null. */
  readonly riding: { instanceId: string; seat: number; model: RideModel } | null;
  /** The nearest rideable item the local player can reach now (null while riding or building). */
  rideableInReach(): { instanceId: string; model: RideModel } | null;
  /**
   * The rules' `set_speed` (movement modes): walking and riding go `factor` times as fast until
   * `until` (this device's `Date.now()` ms; 0 for no end); factor 1 ends it.
   */
  setSpeedFactor(factor: number, until?: number): void;
  /**
   * The room's clock: `serverOffset = server now - Date.now()` from the room's 'time' message. The sea's waves run
   * on it so every device in the room shows the same wave at the same moment (Tidewater sea, plan task 3).
   */
  setServerOffset(ms: number): void;
  /** The local player's speed over the ground, m/s (walking or riding), for the Speed display. */
  readonly speed: number;
  /**
   * The room's poses of items away from where they were placed (its `rides` rows, movement modes):
   * each item not steered by a player shown here is drawn there; items without a row go back.
   */
  applyRidePoses(
    rows: ReadonlyArray<{ instanceId: string; x: number; y: number; z: number; yaw: number }>,
  ): void;
  /** On-screen buttons held while riding (touch): up (the jump button) and Down. */
  setRideButtons(buttons: { up?: boolean; descend?: boolean }): void;
  /** Player blocks the room accepted (from anyone). */
  applyPlayerBlocks(blocks: ReadonlyArray<readonly [number, number, number, number]>): void;
  /** Every player block of the room, replacing those shown (on joining). */
  loadPlayerBlocks(chunks: readonly string[]): void;
  dispose(): void;
}

const WALK_SPEED = 4.5;
const RUN_SPEED = 8.5;
const JUMP_VELOCITY = 7;
const GRAVITY = 22;
/** Swimming: start when the water is this deep at the feet; float with the feet this far down. */
const SWIM = {
  startDepth: 1.1,
  stopDepth: 0.8,
  floatDepth: 1.25,
  speed: 0.6,
} as const;
/** How close a bench must be to sit on it. */
const SEAT_REACH = 1.6;
/**
 * Ladders (P2-23): climbing speed up and down, sideways speed on the ladder, how fast players
 * step off the top onto what is behind it, how long a jump off keeps them from grabbing again,
 * and how far in front of the ladder's middle climbers hold on.
 */
const CLIMB = { speed: 2, sideways: 1.2, stepOff: 1.5, letGo: 0.4, hold: 0.35 } as const;
/**
 * Side-view moves (decision 95): a dash's speed, length, and wait before the next; a wall jump's
 * push away from the wall and how long it lasts; how soon after touching a wall a jump still
 * counts; and how long S lets the player fall through the one-way platform underfoot.
 */
const SIDE_MOVE = {
  dashSpeed: 14,
  dashTime: 0.18,
  dashWait: 0.6,
  wallPush: 6,
  wallPushTime: 0.25,
  wallGrace: 0.12,
  dropTime: 0.35,
} as const;
function groundTexture(look: StyleLook): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = `#${look.ground.toString(16).padStart(6, '0')}`;
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = `#${look.groundAccent.toString(16).padStart(6, '0')}`;
    context.fillRect(0, 0, 32, 32);
    context.fillRect(32, 32, 32, 32);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

/**
 * Genvr runtime v0: renders a world document (sky, light, ground sized by tier, water) and a
 * walkable placeholder avatar with keyboard, touch, and gamepad input. Physics (Rapier), chunked
 * terrain, items, and multiplayer follow in Phase 2 and 3 tasks.
 */
export async function createRuntime({
  onFilmFrame,
  onRendered,
  container,
  world,
  terrainChunks = [],
  loadTerrainFieldPage,
  loadSignal,
  onCommand,
  editable = false,
  onToolStatus,
  avatarLook,
  emulateTouch = false,
  fetchPackage,
  dracoPath,
  forceWebGL = false,
  viewOnly = false,
  playView = 'free',
  sideMoves = [],
  blockLook,
  onPlayerBlocks,
  onHeldBlock,
  onHandsNotice,
  onInteract,
}: RuntimeOptions): Promise<GenvrRuntime> {
  loadSignal?.throwIfAborted();
  const activeSurface = world.terrain.activeSurface;
  const activeFields =
    activeSurface && loadTerrainFieldPage
      ? await hydrateTerrainFieldSet(
          world.terrain.fieldSets![activeSurface.setId]!,
          world.version,
          loadTerrainFieldPage,
          loadSignal ? { signal: loadSignal } : {},
        )
      : undefined;
  loadSignal?.throwIfAborted();
  const state = createWorldState(world, terrainChunks, {
    ...(activeFields ? { fieldStores: new Map([[activeSurface!.setId, activeFields]]) } : {}),
  });
  const renderer = new WebGPURenderer({ antialias: true, forceWebGL });
  await renderer.init();
  // Compute (the Tidewater FFT sea) needs the WebGPU backend; the WebGL2 fallback keeps today's water.
  const webgpu = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
  // Debug flag for side-by-side checks: ?ocean=gerstner or ?ocean=tidewater (plan task 2).
  const urlFlags = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  let profilePipelineCount = 0,
    profilePipelineMs = 0;
  const profilePipelineNames = new Set<string>();
  if (urlFlags?.get('profileFrames') === '1') {
    // Both renderer backends implement this internal hook; public typings omit it.
    const backend = renderer.backend as unknown as {
      createRenderPipeline: (
        object: { material: { name: string; type: string } },
        promises?: Promise<unknown>[],
      ) => void;
    };
    const createPipeline = backend.createRenderPipeline.bind(backend);
    backend.createRenderPipeline = (...args: Parameters<typeof createPipeline>) => {
      const started = performance.now();
      try {
        return createPipeline(...args);
      } finally {
        profilePipelineCount++;
        profilePipelineMs += performance.now() - started;
        profilePipelineNames.add(args[0].material.name || args[0].material.type);
      }
    };
  }
  const oceanFlag = urlFlags?.get('ocean') ?? null;
  const oceanDebug = urlFlags?.get('oceanDebug') ?? null;
  /**
   * Fixed camera for side-by-side shots (Tidewater world, spec section 9): `?cam=x,h,z&look=x,h,z`, heights in
   * metres above the ground at that point. `camSpace=sea` instead uses sea-relative Y and source62°/60000m projection. The player stands under the camera (so the ground streams there) and is
   * hidden. A debug flag like `?ocean`: nothing in a place can set it.
   */
  const fixedCamera = parseFixedCamera(urlFlags?.get('cam') ?? null, urlFlags?.get('look') ?? null);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  let style = STYLE_LOOKS[world.style.base];
  let currentStyle = world.style.base;
  const half = SIZE_TIERS[world.sizeTier].sideMeters / 2;

  const scene = new Scene();
  const sceneLighting = new SceneLighting(scene);
  // Sky, light, fog, and weather from the Core Library; live when set_sky / set_weather change them.
  const touchDevice = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const environment = new EnvironmentView(
    scene,
    style,
    Math.min(900, half * 1.6),
    touchDevice ? 0.5 : 1,
    renderer,
  );
  environment.apply(world.environment);
  // World audio (P2-08): footsteps and ambience made with Web Audio; thunder follows lightning.
  const audio = new WorldAudio();
  /** The surf, wave by wave, timed to the shore waves on the room clock (plan task 6). */
  const surf = new SurfAudio(audio);
  /** Who is saying a voice line now, and on which clock (lip sync, P2-44). */
  const speeches = new Map<string, { mouth: SpeechMouth; now: () => number; onMouth?: (shape: import('@genvr/contracts').MouthShape) => void }>();
  const audioState = () => ({
    weather: state.doc.environment.weather.preset,
    // The sky shown now: a day-night cycle brings crickets at night (P2-02).
    sky: environment.skyPhase,
  });
  let audioSky = environment.skyPhase;
  environment.onLightning = () => audio.thunder();
  scene.add(environment.group, environment.hemisphere);
  const sun = environment.sun;
  sun.castShadow = true;
  // One map around the player, or cascades reaching far in styles lit by the sky (P2-36).
  const sunShadows = new SunShadows(sun, scene);
  let skyQuality = realisticQuality({ quality: 0, touchDevice, webgpu });
  const worldFlag = new URLSearchParams(window.location.search).get('world');
  if (worldFlag === 'genvr') skyQuality = { ...skyQuality, worldLook: 'genvr' };
  environment.setRealisticQuality(skyQuality);
  // Bloom joins the shadows: realistic sky on devices whose quality allows it.
  const applyShadows = () => {
    sunShadows.apply(environment.realistic ? skyQuality : null);
    // Bloom and the underwater view are asked for separately: a phone runs with bloom off and
    // must still be able to look around under the water (P2-39).
    post.set(
      environment.realistic && skyQuality.bloom,
      {
        on: environment.realistic,
        rays: skyQuality.waterRays,
      },
      environment.realistic ? skyQuality.worldLook : 'genvr',
    );
  };
  scene.add(sun, sun.target);
  const sunOffset = environment.sunOffset;

  // Terrain: chunked heightfield streamed around the player (full detail near, lower detail far).
  audio.setState(audioState());
  const terrain = state.terrain;
  const nativeProfile = activeSurface
    ? resolveTerrainSurface(terrain.activeSurfaceStore!.descriptor, activeSurface)
    : null;
  const nativeSampler = activeSurface ? new TerrainFieldSampler(terrain.activeSurfaceStore!) : null;
  let tidewaterLighting: TidewaterLighting | null = null;
  const terrainView = new TerrainView(terrain, SOIL_COLORS[world.style.base]);
  // Block ground (P2-26): Voxel places made with it draw blocks instead of the height field.
  const voxels = state.voxels ?? null;
  const voxelView = voxels
    ? new VoxelView(voxels, blockLook ?? style.blocks ?? 'plain', touchDevice ? 5 : 7)
    : null;
  const groundView = voxelView ?? terrainView;
  let nativeTerrain: NativeTerrainView | null = null;
  const nativeWindDirection = TSL.uniform(new Vector2(-0.35, 0.94));
  const nativeWindSpeed = TSL.uniform(7);
  nativeWindDirection.setGroup(TSL.renderGroup);
  nativeWindSpeed.setGroup(TSL.renderGroup);
  let tidewaterWind: TidewaterWorldWind | null = null;
  const sourceWind = () =>
    (tidewaterWind ??= new TidewaterWorldWind({
      windDirection: nativeWindDirection,
      windSpeed: nativeWindSpeed,
    }));
  const disposeSourceWind = () => tidewaterWind?.dispose();
  if (activeSurface) terrainView.group.visible = false;

  // Realistic ground (P2-37): the place's palette drawn with real materials from the Core Library.
  const groundTextures = new GroundTextures();
  let groundKey = '';
  let groundRules: GroundRules | null = null;
  let groundMaterial: { dispose(): void } | null = null;
  let tidewaterGround: TidewaterGround | null = null;
  let outerRealistic: MeshStandardNodeMaterial | null = null;
  /** Ground material name of each palette slot in Realistic places (grass grows on grass kinds). */
  let groundPalette: (string | undefined)[] = [];
  /** Default snow line (meters) when a Realistic place has not set one. */
  const DEFAULT_SNOW_LINE = 80;
  const applyGround = () => {
    // Shared settings also serve plant-only worlds with nonprocedural ground materials.
    const windSettings = readSkySettings(state.doc.environment.sky.params);
    const windAngle = ((windSettings.windDirection ?? 200.42) * Math.PI) / 180;
    nativeWindDirection.value.set(-Math.sin(windAngle), -Math.cos(windAngle));
    nativeWindSpeed.value = windSettings.windSpeed ?? 7;
    if (activeSurface) {
      nativeTerrain?.setSourceMaterial(webgpu && skyQuality.worldLook === 'tidewater');
      return;
    }
    const realistic = !voxels && style.lighting === 'sky';
    if (!realistic) {
      if (groundKey) {
        groundKey = '';
        terrainView.setRealistic(null);
        outerRealistic?.dispose();
        outerRealistic = null;
        (outerGround as Mesh).material = outerGroundMaterial;
        groundMaterial?.dispose();
        groundMaterial = null;
        groundRules = null;
        tidewaterGround?.dispose();
        tidewaterGround = null;
      }
      return;
    }
    const materials = state.doc.terrain.materials ?? {};
    const palette = Array.from({ length: 16 }, (_, slot) => {
      const id = materials[String(slot)]?.id;
      const chosen = id ? getGround(id)?.name : undefined;
      return chosen ?? (slot < SOILS.length ? DEFAULT_GROUND[SOILS[slot]!] : undefined);
    });
    groundPalette = palette;
    tidewaterLighting?.invalidate();
    const layers = groundLayers(palette, { rock: palette[3]!, snow: palette[4]! });
    const size = skyQuality.groundSize;
    const procedural =
      webgpu &&
      skyQuality.worldLook === 'tidewater' &&
      layers.names.some((name) => getGround(name)?.procedural);
    const key = `${layers.names.join(',')}@${size}@${procedural}`;
    if (key !== groundKey) {
      groundKey = key;
      groundTextures.load(layers.names, size, () => undefined);
      const built = realisticGroundMaterial(
        groundTextures.color,
        groundTextures.surface,
        groundTextures.tiles,
        layers.rockLayer,
        layers.snowLayer,
        procedural ? layers.names.map((name) => !!getGround(name)?.procedural) : [],
      );
      if (procedural) tidewaterGround ??= new TidewaterGround(terrain, water.groundWetness, sourceWind());
      else {
        tidewaterGround?.dispose();
        tidewaterGround = null;
      }
      tidewaterGround?.update(state.doc.environment.sea?.level ?? 0);
      tidewaterGround?.bind(built.material, layers.names);
      groundMaterial?.dispose();
      groundMaterial = built.material;
      groundRules = built.rules;
      terrainView.setRealistic({ material: built.material, layerOfSlot: layers.layerOfSlot });
      // The ground beyond the edge shows the place's grass.
      outerRealistic?.dispose();
      outerRealistic = realisticOuterMaterial(
        groundTextures.color,
        groundTextures.surface,
        groundTextures.tiles[layers.layerOfSlot(0)] ?? 3,
        layers.layerOfSlot(0),
      );
      tidewaterGround?.bind(outerRealistic, layers.names, layers.layerOfSlot(0));
      (outerGround as Mesh).material = outerRealistic;
    }
    const snowLine = state.doc.style.snowLine;
    groundRules!.snowOn.value = snowLine === null ? 0 : 1;
    groundRules!.snowLine.value = snowLine ?? DEFAULT_SNOW_LINE;
    groundRules!.rockOn.value = state.doc.style.autoRock === false ? 0 : 1;
    if (tidewaterGround) {
      const settings = readSkySettings(state.doc.environment.sky.params);
      const angle = ((settings.windDirection ?? 200.42) * Math.PI) / 180;
      tidewaterGround.windDirection.value.set(-Math.sin(angle), -Math.cos(angle));
      tidewaterGround.windSpeed.value = settings.windSpeed ?? 7;
      const swell = swellFromSetting(state.doc.environment.sea?.swell).direction;
      // Automatic shore travel direction remains internal to the sea; use the source direction until exposed.
      tidewaterGround.swellDirection.value.set(
        ...(swell ?? ([-0.11914522, -0.99287684] as [number, number])),
      );
      tidewaterGround.update(state.doc.environment.sea?.level ?? 0);
    }
  };
  scene.add(groundView.group);
  const groundHeight = voxels
    ? (x: number, z: number) => voxels.surfaceHeight(x, z)
    : (x: number, z: number) => terrain.heightAt(x, z);
  /**
   * The rivers' profiles, read by the ground helpers below. They are written once the RiverView
   * exists further down, and again on every change; a holder keeps this safe, because grass
   * placement asks whether a spot is under water before the view is built.
   */
  const riverState: { profiles: readonly RiverProfile[] } = { profiles: [] };
  const waterLevelAt = (x: number, z: number): number | null =>
    voxels
      ? voxels.waterSurface(x, z)
      : // Lakes and the sea come from the document; a river has no polygon, so its surface comes
        // from the profile the ribbon is drawn from. The higher wins. The server's rest law
        // reads the same function (P2-43).
        placeWaterAt(state.doc.environment, terrain, riverState.profiles, x, z);
  const nativeDescriptor = terrain.activeSurfaceStore?.descriptor;
  const sampleNativeMask = (channel: string, x: number, z: number): number | null => {
    if (!nativeDescriptor || !activeSurface || !nativeSampler) return null;
    const offset = nativeDescriptor.sampling === 'cell-center' ? 0.5 : 0;
    const fx = (x - nativeDescriptor.origin[0]) / nativeDescriptor.spacing - offset;
    const fz = (z - nativeDescriptor.origin[1]) / nativeDescriptor.spacing - offset;
    if (
      activeSurface.edge === 'constant' &&
      (fx < 0 ||
        fz < 0 ||
        (activeSurface.farEdge === 'exclusive'
          ? fx >= nativeDescriptor.width - 1 || fz >= nativeDescriptor.height - 1
          : fx > nativeDescriptor.width - 1 || fz > nativeDescriptor.height - 1))
    )
      return null;
    return nativeSampler.sample(channel, x, z, { edge: activeSurface.edge === 'clamp' ? 'clamp' : 'none' });
  };
  const soilAt = (x: number, z: number): Soil =>
    nativeProfile && nativeSampler
      ? terrainSurfaceSoil(
          nativeProfile,
          sampleNativeMask,
          terrain.heightAt(x, z),
          state.doc.environment.sea?.level ?? -Infinity,
          x,
          z,
        )
      : voxels
        ? voxels.soilAt(x, z)
        : terrain.soilAt(x, z);
  const lightingTerrain = nativeProfile
    ? {
        half: Math.max(
          ...terrain.activeSurfaceStore!.descriptor.origin.map((origin) =>
            Math.max(Math.abs(origin), Math.abs(origin + nativeProfile.size)),
          ),
        ),
        heightAt: (x: number, z: number) => terrain.heightAt(x, z),
        slotAt: (x: number, z: number) => SOILS.indexOf(soilAt(x, z)),
      }
    : terrain;

  // Outer ground beyond the playable area (fog hides the far edge; natural boundaries in P2-14).
  // A frame around the playable square, never under it, so lakes and holes inside stay visible.
  let texture = groundTexture(style);
  // Height-field places: the outer ground starts at the border's own heights (R2k: a real town on a hill ended in a
  // cliff down to a flat sheet at 0). Block places keep the flat frame at their edge height.
  const outerFollowsEdge = !voxels;
  if (outerFollowsEdge) texture.repeat.set(1, 1);
  else texture.repeat.set(half / style.tile, half / style.tile);
  const outerGround = new Mesh(
    outerFollowsEdge
      ? outerGroundGeometry((x, z) => terrain.heightAt(x, z), half, style.tile)
      : new ShapeGeometry(
          (() => {
            const outer = half * 2;
            const frame = new Shape([
              new Vector2(-outer, -outer),
              new Vector2(outer, -outer),
              new Vector2(outer, outer),
              new Vector2(-outer, outer),
            ]);
            frame.holes.push(
              new Path([
                new Vector2(-half, -half),
                new Vector2(-half, half),
                new Vector2(half, half),
                new Vector2(half, -half),
              ]),
            );
            return frame;
          })(),
        ),
    new MeshStandardMaterial({ map: texture, roughness: 0.95 }),
  ) as Mesh<BufferGeometry, MeshStandardMaterial>;
  const outerGroundMaterial = outerGround.material;
  if (!outerFollowsEdge) {
    // The shape is drawn in x/y; lay it flat (y becomes -z).
    outerGround.rotation.x = -Math.PI / 2;
    // Block ground meets the outside ground at its border height.
    outerGround.position.y = VOXEL_EDGE_HEIGHT - 0.05;
  }
  outerGround.receiveShadow = true;
  outerGround.visible = !activeSurface;
  outerGround.name = 'outer-ground';
  scene.add(outerGround);
  /** Redraws the outer ground from the border's heights, at most a few times a second while a build runs. */
  let outerTimer: ReturnType<typeof setTimeout> | null = null;
  const rebuildOuterGround = () => {
    if (!outerFollowsEdge || outerTimer) return;
    outerTimer = setTimeout(() => {
      outerTimer = null;
      const old = outerGround.geometry;
      outerGround.geometry = outerGroundGeometry((x, z) => terrain.heightAt(x, z), half, style.tile);
      old.dispose();
    }, 300);
  };

  // Grass that grows by itself on grass ground in Realistic places (P2-38).
  // The same road test as the server's scatter check (P2-43 final review).
  const nearRoad = (x: number, z: number): boolean => nearRoadOf(state.doc.roads, x, z);
  const grassGround: GrassGround = {
    isGrass: (x, z) => {
      const name = groundPalette[terrain.slotAt(x, z)];
      return !!name && getGround(name)?.kind === 'grass';
    },
    height: (x, z) => terrain.heightAt(x, z),
    slope: (x, z) => {
      const dx = terrain.heightAt(x + 1, z) - terrain.heightAt(x - 1, z);
      const dz = terrain.heightAt(x, z + 1) - terrain.heightAt(x, z - 1);
      return (Math.atan(Math.hypot(dx, dz) / 2) * 180) / Math.PI;
    },
    blocked: (x, z) => {
      // Ground the creator cleared grows nothing at all (P2-40): it is the one thing a rule can be
      // told, and it has to mean the same to grass as it does to the woods, or clearing a spot
      // takes the tree away and leaves the grass standing where the tree was.
      if (terrain.coverAt(x, z) === 'cleared') return true;
      const water = waterLevelAt(x, z);
      if (water !== null && water > terrain.heightAt(x, z) - 0.05) return true;
      const snowLine = state.doc.style.snowLine;
      if (snowLine !== null && terrain.heightAt(x, z) > (snowLine ?? DEFAULT_SNOW_LINE)) return true;
      return nearRoad(x, z);
    },
  };
  const grass = new GrassView(grassGround, GRASS_CARDS_URL);
  // A few patches per frame: a flying camera (filming, story pages) crosses many patches at once.
  grass.setGrowBudget(4);
  scene.add(grass.group);
  let grassKey = '';
  let grassRoads = state.doc.roads.length;
  /** Grass follows the place's setting and the device's quality; it grows again after ground edits. */
  const applyGrass = (groundChanged = false) => {
    const setting = state.doc.style.grass;
    const on = !activeSurface && !voxels && style.lighting === 'sky' && setting?.on !== false;
    grass.group.visible = on;
    const density = skyQuality.grassDensity * (setting?.density ?? 1);
    const key = `${on}/${skyQuality.grassRadius}/${density}`;
    if (key !== grassKey) {
      grassKey = key;
      grass.setDensity(skyQuality.grassRadius, density);
    } else if (groundChanged) grass.clear();
  };

  // Water bodies (lakes, ponds, sea), rebuilt when they change.
  // The sea (P2-39) has no drawn shape: it fills everything below its level out to the outer
  // ground's edge, which is twice the place's half size (see `outerGround`).
  /** Room time minus this device's clock (ms), from `setServerOffset`; 0 outside a room. */
  let serverOffset = 0;
  const water = new WaterView(
    (x, z) => terrain.heightAt(x, z),
    style.water.color,
    style.water.opacity,
    half * 2,
  );
  // Reflections in the water on computers by default (the Graphics setting decides later).
  water.setRenderer(renderer, world);
  water.sync(world);
  scene.add(water.group);

  // Rivers (P2-39): drawn from their derived profiles, which also give the current in the water.
  const rivers = new RiverView((x, z) => terrain.heightAt(x, z), style.water.color, water.causticsTexture);
  rivers.sync(world);
  riverState.profiles = rivers.profiles;
  scene.add(rivers.group);
  // Swimmers leave rings on the water (owner request, 2026-09-28). Worked out here from positions
  // this device already has, for its own player and for the others, and never sent anywhere.
  const wake = new WakeField();
  water.setWake(wake, world);

  /** The World tab's water settings (P2-39): how clear it is and how the surface moves. */
  /** The water's share of the graphics setting (P2-39), all of it from one table. */
  const applyWaterQuality = () => {
    water.setReflections(skyQuality.waterReflect > 0, state.doc);
    const forced = oceanFlag === 'tidewater' && webgpu;
    const ocean = oceanFlag === 'gerstner' ? 'gerstner' : forced ? 'tidewater' : skyQuality.waterOcean;
    water.setQuality(
      {
        grid: skyQuality.waterGrid,
        waves: skyQuality.waterWaves,
        refraction: skyQuality.waterRefraction,
        caustics: skyQuality.waterCaustics,
        reflect: skyQuality.waterReflect,
        ocean,
        oceanCascades: skyQuality.oceanCascades || 4,
        oceanGrid: skyQuality.oceanGrid || 768,
        oceanRipples: forced && skyQuality.oceanCascades === 0 ? true : skyQuality.oceanRipples,
        oceanDetail: forced && skyQuality.oceanCascades === 0 ? true : skyQuality.oceanDetail,
        ...(oceanDebug ? { oceanDebug } : {}),
      },
      state.doc,
    );
    rivers.setRefraction(skyQuality.waterRefraction, state.doc);
    rivers.setSpray(skyQuality.waterSpray, state.doc);
    wake.setCapacity(skyQuality.waterWake);
  };

  const applyWaterLook = () => {
    const setting = state.doc.style.water ?? { clarity: DEFAULT_CLARITY, waves: 'normal' as const };
    water.setClarity(setting.clarity, state.doc);
    rivers.setClarity(setting.clarity, state.doc);
    water.setWaves(setting.waves, state.doc);
  };
  applyWaterLook();
  applyWaterQuality();
  if (activeSurface) {
    try {
      nativeTerrain = await NativeTerrainView.create(terrain.activeSurfaceStore!, activeSurface, {
        ...(loadSignal ? { signal: loadSignal } : {}),
        seaLevel: state.doc.environment.sea?.level ?? 0,
        sourceMaterial: webgpu,
        providers: {
          ...(webgpu ? { detailTexture: sourceWind().detail, gustOffset: sourceWind().gustOffset } : {}),
          wetFoam: (position) => water.groundWetness.wetFoamNode(position.xz, position.y),
          swellDirection: water.groundWetness.swellDirectionNode,
          windDirection: nativeWindDirection,
          windSpeed: nativeWindSpeed,
        },
      });
      scene.add(nativeTerrain.group);
    } catch (error) {
      water.dispose();
      rivers.dispose();
      grass.dispose();
      terrainView.dispose();
      groundTextures.dispose();
      disposeSourceWind();
      outerGround.geometry.dispose();
      outerGroundMaterial.dispose();
      texture.dispose();
      environment.dispose();
      audio.dispose();
      sunShadows.dispose();
      canvas.remove();
      renderer.dispose();
      throw error;
    }
  }
  // Ground consumes WaterView's stable shore bridge; initialize both before creating receivers.
  applyGround();
  applyGrass();
  void water.whenCausticsReady().then((loaded) => {
    if (loaded) rivers.setCaustics(loaded, state.doc);
  });

  // Avatar and controller.
  // Avatars match the style: small cubes in Voxel places (P2-26).
  // A mesh body's model loads first, so the player does not start as a stand-in (P2-35).
  if (avatarLook) await preloadAvatarLook(avatarLook);
  const avatar = createGenvrAvatar(avatarLook, {
    cubes: style.avatar === 'cubes',
    onBodyReady: () => animator.rebind(avatar.mesh, avatar.clips),
  });
  const animator = new AvatarAnimator(avatar.mesh, avatar.clips);
  animator.play('Idle');
  const avatarPose = avatar.pose;
  const [sx, sy, sz] = world.spawn.position;
  avatar.root.position.set(sx, Math.max(0, sy - 1), sz);
  scene.add(avatar.root);
  // Other players in the same realtime room.
  const remotePlayers = new RemotePlayers({ cubes: style.avatar === 'cubes' });
  scene.add(remotePlayers.group);
  // A game's hits (P9-12): damage numbers over the one hit, and strikes heard where they happen.
  const damageNumbers = new DamageNumbers();
  scene.add(damageNumbers.group);
  remotePlayers.onStrike = (at) => audio.gameSound('strike', at);
  /** Seconds of the red hit flash left on the local player. */
  let selfFlash = 0;
  /** The local player is knocked out in a game, and for how long (s). */
  let knockedOut = false;
  let downTime = 0;
  // Blocks in other players' hands look like the place's blocks (decision 109).
  if (voxels) remotePlayers.setBlockStyle(blockLook ?? style.blocks ?? 'plain');

  const camera = new PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 5000);
  // Screen effects (bloom on computers in the realistic sky, P2-36), then shadows and effects for the style.
  const post = new PostEffects(renderer, scene, camera);
  /** 0 above water, 1 fully under: moved gradually so breaking the surface is not a hard cut. */
  let submerged = 0;
  void water.whenCausticsReady().then((loaded) => {
    if (loaded) post.setCaustics(loaded);
  });
  applyShadows();
  const neutralSwimPitch = 0.35;
  const orbit = { yaw: Math.PI, pitch: neutralSwimPitch, distance: 9 };
  /** Seconds since the player last looked around (drag, pinch, right stick): the chase camera waits. */
  let lookIdle = 10;

  // Arrow keys nudge the selected items in the studio (the tools are created later).
  const keyboard = new KeyboardInput(window, () => !tools?.arrowsNudge);
  const touch = new TouchJoystickInput(canvas, emulateTouch, () => !tools?.tool);
  const sources: InputSource[] = [keyboard, touch, new GamepadInput()];

  // Player view settings: turn speed and inverted up and down (P3-21).
  const view = { sensitivity: 1, invert: false };
  const pitchSign = () => (view.invert ? -1 : 1);
  // Camera orbit: mouse drag, or touch drag on the right half; wheel or pinch to zoom.
  // Two fingers anywhere: pinch zooms and moving both turns the camera (P3-05).
  let dragging: number | null = null;
  let last = { x: 0, y: 0 };
  const fingers = new Map<number, { x: number; y: number }>();
  let gesture: { distance: number; x: number; y: number } | null = null;
  const twoFingers = () => {
    const [a, b] = [...fingers.values()];
    return a && b
      ? { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      : null;
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (fingers.size === 2) {
        // A second finger: stop walking, drawing, and one-finger turning; start the gesture.
        touch.release();
        for (const id of fingers.keys()) tools?.endStroke(id);
        dragging = null;
        gesture = twoFingers();
        return;
      }
      if (fingers.size > 2) return;
    }
    if (event.pointerType === 'touch' && event.clientX <= canvas.clientWidth / 2 && !tools?.tool) return;
    // The terrain brush takes left-button (and right-half touch) drags; the camera gets the rest.
    if (
      event.button === 0 &&
      tools?.startStroke(event.pointerId, event.clientX, event.clientY, event.shiftKey)
    )
      return;
    dragging = event.pointerId;
    last = { x: event.clientX, y: event.clientY };
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Pointer already released (fast taps, synthetic events); dragging still works without capture.
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    if (fingers.has(event.pointerId)) fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture) {
      const now = twoFingers();
      if (!now) return;
      orbit.distance = Math.min(
        30,
        Math.max(3, orbit.distance * (gesture.distance / Math.max(1, now.distance))),
      );
      orbit.yaw -= (now.x - gesture.x) * 0.005 * view.sensitivity;
      lookIdle = 0;
      orbit.pitch = Math.min(
        1.2,
        Math.max(-0.1, orbit.pitch + (now.y - gesture.y) * 0.004 * view.sensitivity * pitchSign()),
      );
      gesture = now;
      return;
    }
    if (tools?.moveStroke(event.pointerId, event.clientX, event.clientY)) return;
    if (event.pointerId !== dragging || touch.owns(event.pointerId)) return;
    if (event.clientX !== last.x || event.clientY !== last.y) lookIdle = 0;
    orbit.yaw -= (event.clientX - last.x) * 0.005 * view.sensitivity;
    orbit.pitch = Math.min(
      1.2,
      Math.max(-0.1, orbit.pitch + (event.clientY - last.y) * 0.004 * view.sensitivity * pitchSign()),
    );
    last = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent) => {
    fingers.delete(event.pointerId);
    if (fingers.size < 2) gesture = null;
    tools?.endStroke(event.pointerId, event.clientX, event.clientY);
    if (event.pointerId === dragging) dragging = null;
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    orbit.distance = Math.min(30, Math.max(3, orbit.distance + event.deltaY * 0.01));
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const resize = new ResizeObserver(() => {
    const { clientWidth: width, clientHeight: height } = container;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  resize.observe(container);

  // Physics: ground, world edges, and a kinematic character controller (Rapier).
  await initPhysics();
  const physics = new PhysicsWorld();
  physics.addBounds(half);
  const terrainColliders = voxels
    ? new VoxelColliders(voxels, physics)
    : activeSurface
      ? new NativeTerrainColliders(terrain, physics)
      : new TerrainColliders(terrain, physics);
  terrainColliders.update(sx, sz);
  if (!activeSurface) groundView.update(sx, sz);
  // Players never arrive inside a house or an item (owner, 2026-10-07): the start point as it is now (a Real place
  // build moves it), moved to the nearest free street or open ground. Items count once they are loaded.
  let spawnItems: ItemsView | null = null;
  const standsInItem = (x: number, z: number, feetY = groundHeight(x, z)): boolean => {
    const view = spawnItems;
    if (!view) return false;
    const feet = feetY;
    const boxes = view.scatteredBoxesNear(x, z, 3);
    for (const instance of state.doc.instances) {
      const [ix, , iz] = instance.transform.position;
      if (Math.abs(ix - x) > 30 || Math.abs(iz - z) > 30) continue;
      const model = view.model(instance.itemId, instance.params);
      if (model.collider === 'none') continue;
      boxes.push(itemColliderBox(model, instance));
    }
    return boxes.some((box) => {
      // Into the box's own axes (the inverse of itemColliderBox's turn), with the player's radius around it.
      const dx = x - box.center[0]!;
      const dz = z - box.center[2]!;
      const cos = Math.cos(box.yaw);
      const sin = Math.sin(box.yaw);
      const bottom = box.center[1]! - box.half[1]!;
      const top = box.center[1]! + box.half[1]!;
      return (
        Math.abs(dx * cos - dz * sin) < box.half[0]! + 0.4 &&
        Math.abs(dx * sin + dz * cos) < box.half[2]! + 0.4 &&
        bottom < feet + 1.7 &&
        top > feet + 0.3
      );
    });
  };
  // In a shared room the room puts the player back; asked at most once a second (falling repeats every frame).
  let respawnRequest: (() => boolean) | null = null;
  let respawnAskedAt = -Infinity;
  // Asks the room has not answered (reset when it moves the player): after three, this device puts them back itself,
  // so a player the room will not move (a game's knocked-out rule) never falls for ever.
  let respawnUnanswered = 0;
  const askRespawn = (): boolean => {
    if (!respawnRequest || respawnUnanswered >= 3) return false;
    const now = performance.now();
    if (now - respawnAskedAt < 1000) return true;
    if (!respawnRequest()) return false;
    respawnAskedAt = now;
    respawnUnanswered += 1;
    return true;
  };
  // The spawn's feet on the ground as it is now: a build can raise the ground over the spawn (R2i: Test then started
  // the player under a real place, 7 m into the hill).
  const spawnFeetNow = () => {
    const [px, py, pz] = state.doc.spawn.position;
    const spot = freeSpawnPoint(state.doc, px, pz, standsInItem);
    const y = spot.moved ? groundHeight(spot.x, spot.z) : Math.max(groundHeight(px, pz), py - 1);
    return { x: spot.x, y: y + 0.05, z: spot.z };
  };
  const spawnFeet = spawnFeetNow();
  // On block ground players walk up one block without jumping, like a step (P2-26).
  const character = physics.createCharacter(spawnFeet, voxels ? { maxStep: 1.05, snapToGround: 1.05 } : {});
  // Moved off a house: the ground there gets its colliders before the first step.
  if (spawnFeet.x !== sx || spawnFeet.z !== sz) {
    avatar.root.position.set(spawnFeet.x, spawnFeet.y, spawnFeet.z);
    terrainColliders.update(spawnFeet.x, spawnFeet.z);
    if (!activeSurface) groundView.update(spawnFeet.x, spawnFeet.z);
  }

  // Roads, walls, and room floors (meshes and colliders), rebuilt when they or their ground change.
  const heightAt = groundHeight;
  const structures = new StructuresView(terrain, physics);
  // Roads and walls on block ground are blocks, not meshes.
  const structureDoc = () => (voxels ? { ...state.doc, roads: [], walls: [] } : state.doc);
  // Walls on block ground stand on the ground under them (not on the wall tops heightAt gives).
  const wallGround = voxels ? (x: number, z: number) => voxels.floorHeight(x, z) : groundHeight;
  structures.sync(structureDoc());
  scene.add(structures.group);
  // Placed items: one instanced draw call per item type, a box collider per item.
  const packages = fetchPackage
    ? new ItemPackages(fetchPackage, { ...(dracoPath ? { dracoPath } : {}), ktx2: { renderer } })
    : undefined;
  // Real 3D models of Core items in Realistic places (P2-38), served with the web app.
  const coreModels = new ItemPackages(async (itemId) => coreModelPackage(itemId), {
    ...(dracoPath ? { dracoPath } : {}),
    ktx2: { renderer },
  });
  // Core items in the look of the place's style (cube trees in Voxel places, P2-26; real models
  // in Realistic places, P2-38).
  let palmBindings: PalmWorldBindings | null = null;
  const palmTime = TSL.uniform(0).setGroup(TSL.renderGroup);
  const palmFrame = TSL.uniform(0, 'uint').setGroup(TSL.renderGroup);
  const palmCamera = TSL.uniform(camera.position).setGroup(TSL.renderGroup);
  const palmSun = TSL.uniform(new Vector3()).setGroup(TSL.renderGroup);
  const palmNight = TSL.uniform(0).setGroup(TSL.renderGroup);
  const canopyLoading = new CanopyLoading({
    load: async () => {
      const assets = await createCanopyAssets(renderer);
      if (canopyLoading.closed) return { bindings: null, dispose: () => assets.dispose() };
      try {
        const bindings = new CanopyWorldBindings(assets, {
          wind: sourceWind(),
          time: palmTime,
          frame: palmFrame,
          mainCamera: palmCamera,
          sun,
          sunDirection: palmSun,
          night: palmNight,
          nearRange: TSL.uniform(new Vector2(65, 45)),
          farDistance: TSL.uniform(2800),
        });
        return {
          bindings,
          dispose: () => {
            bindings.dispose();
            assets.dispose();
          },
        };
      } catch (error) {
        assets.dispose();
        throw error;
      }
    },
    reload: (id) => items.reload(id, state.doc),
    notify: (id) => tools?.itemModelChanged(id),
    report: (error) => console.warn('Canopy resource preparation or preview refresh failed.', error),
  });
  const items = new ItemsView(physics, (itemId, params) => {
    const model = resolveItem(itemId, packages, currentStyle, coreModels, params);
    if (webgpu && hasCanopyGeometry(model)) {
      if (canopyLoading.resource?.bindings) return prepareCanopyModel(model, canopyLoading.resource.bindings);
      canopyLoading.request(itemId);
      return model;
    }
    if (!webgpu || !hasPalmGeometry(model)) return model;
    palmBindings ??= new PalmWorldBindings({
      wind: sourceWind(),
      time: palmTime,
      frame: palmFrame,
      mainCamera: palmCamera,
      sun,
      sunDirection: palmSun,
      night: palmNight,
    });
    return preparePalmModel(model, palmBindings);
  });
  /**
   * Riding (movement modes): the ride and seats of each ridden item seen here (worked out once, again
   * after the world changes), and the local player's ride. Seat 1 steers with a `RideController`.
   */
  const rideSeats = new Map<
    string,
    {
      ride: Ride;
      seats: Array<{ x: number; y: number; z: number }>;
      bounds: RideBounds;
      size: { width: number; length: number };
    }
  >();
  const rideSetup = (instanceId: string) => {
    let entry = rideSeats.get(instanceId);
    if (!entry) {
      const ride = items.rideOf(instanceId);
      const bounds = items.itemBounds(instanceId);
      if (!ride || !bounds) return null;
      const size = { width: bounds.max.x - bounds.min.x, length: bounds.max.z - bounds.min.z };
      entry = { ride, seats: seatLayout(bounds, ride), bounds, size };
      rideSeats.set(instanceId, entry);
    }
    return entry;
  };
  // The woods and painted cover (P2-40): where anything stands comes from the seed in @genvr/world,
  // so this only fills in the ground near the player and hands the result to ItemsView, which draws
  // it with the instancing, LOD and colliders it already has.
  const scatter = new ScatterView(
    terrain,
    {
      heightAt: (x, z) => terrain.heightAt(x, z),
      coverAt: (x, z) => terrain.coverAt(x, z),
      soilAt,
      waterAt: waterLevelAt,
      builtAt: nearRoad,
    },
    // Nothing grows through a floor, a bridge deck or a placed item (P2-43). The rest context is
    // declared further down; scatter is first worked out after it exists.
    { blocked: (x, z) => builtOver(restContext.surfaces(), x, z) },
  );
  /** Where the drawn part of the scatter was last chosen (P2-43 final review, I4). */
  let scatterDrawnAt: { x: number; z: number } | null = null;
  /**
   * Fills in what grows around the player, and hands over a new list only when it changed: the
   * part of it within the draw distance, where the ground is drawn at full detail (I4), chosen
   * again when new ground was worked out or the player walked a few meters.
   */
  const applyScatter = (x: number, z: number, force = false) => {
    if (activeSurface) return;
    if (force) scatter.clear();
    const changed = scatter.update(state.doc, x, z);
    if (!changed && !needsReselect(scatterDrawnAt, x, z)) return;
    scatterDrawnAt = { x, z };
    items.setScattered(drawnScatter(scatter.instances, x, z), state.doc);
  };
  coreModels.onLoaded((itemId) => {
    const loaded = coreModels.get(itemId);
    if (loaded) cutoutLeaves(loaded);
    items.reload(itemId, state.doc);
    tools?.itemModelChanged(itemId);
  });
  // A package that finishes loading replaces its placeholder boxes and colliders.
  packages?.onLoaded((itemId) => {
    // Its real size is known now: the rest law's shapes and surface index are built again with it.
    restShapes.clear();
    restRules.clear();
    restSurfaces = null;
    items.reload(itemId, state.doc);
    // The placement ghost of that item was a placeholder box until now.
    tools?.itemModelChanged(itemId);
  });
  // Moving package items sound each time their animation starts again, from where they are.
  items.onItemLoop = ({ sound, position }) => {
    if (sound) audio.playAt(sound, position);
  };
  const listenerForward = new Vector3();
  const triangleCounts = new Map<string, number>();
  const trianglesOf = (itemId: string): number | null => {
    const cached = triangleCounts.get(itemId);
    if (cached !== undefined) return cached;
    const model = items.model(itemId);
    const geometries = model.meshes ? model.meshes.map((part) => part.geometry) : null;
    let count = 0;
    if (geometries) {
      for (const geometry of geometries)
        count += (geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0) / 3;
    } else if (getCoreItem(itemId)) {
      const geometry = itemGeometry(model.parts);
      count = (geometry.index?.count ?? 0) / 3;
      geometry.dispose();
    } else return null;
    triangleCounts.set(itemId, count);
    return count;
  };
  // Sizes of item types for the validator and for settling new items; null while a package loads.
  const itemShape: WorldEnvironment['itemShape'] = (itemId) => {
    const core = getCoreItem(itemId);
    const loaded = core ? null : packages?.get(itemId);
    if (!core && !loaded) return null; // not loaded: unknown size
    const model = items.model(itemId);
    // From the entry while the model loads, as the server reads it, so the two never disagree.
    const blocks = model.blocks ?? (core ? itemBlocksForStyle(core, state.doc.style.base) : null);
    return {
      min: model.bounds.min,
      max: model.bounds.max,
      ...(blocks ? { blocks } : {}),
      solid: model.collider !== 'none',
      part: model.resizable || model.grid !== null,
      floats: (core ?? loaded)!.manifest.physics?.floats ?? false,
      climbable: model.climbable ?? false,
    };
  };
  const roomFloors = () =>
    voxels
      ? voxels.roomFloors(state.doc.walls)
      : state.doc.walls.flatMap((wall) => {
          const level = roomFloorLevel(wall, heightAt);
          return level === null ? [] : [{ points: wall.points, level }];
        });
  // The rest law's view of the place (P2-43): item shapes the way the server builds them (a Core
  // item's bounds at the place's style, not the model that happens to be loaded yet), so the
  // browser and the server rest things at the same numbers.
  // Remembered per style and item; forgotten when a package loads (its real size is known then).
  const restShapes = new Map<string, ReturnType<WorldEnvironment['itemShape']>>();
  const restRules = new Map<string, RestShape | null>();
  const restItemShape: WorldEnvironment['itemShape'] = (itemId) => {
    const key = `${state.doc.style.base}:${itemId}`;
    if (restShapes.has(key)) return restShapes.get(key)!;
    const shape = measureRestShape(itemId);
    restShapes.set(key, shape);
    return shape;
  };
  const measureRestShape: WorldEnvironment['itemShape'] = (itemId) => {
    const core = getCoreItem(itemId);
    if (!core) return itemShape(itemId);
    const { min, max } = itemBoundsForStyle(core, state.doc.style.base);
    const blocks = itemBlocksForStyle(core, state.doc.style.base);
    return {
      min,
      max,
      ...(blocks ? { blocks } : {}),
      solid: core.manifest.physics?.collider !== 'none',
      part: (core.resizable ?? false) || core.grid != null,
      floats: core.manifest.physics?.floats ?? false,
      climbable: core.manifest.physics?.climbable ?? false,
    };
  };
  // Built on first use and dropped when walls, roads, water, style, a remote edit, undo or redo
  // change what is under a point; the studio's own item edits keep it in step as they go.
  let restSurfaces: SurfaceIndex | null = null;
  const restShapeOf = (itemId: string): RestShape | null => {
    const shape = restItemShape(itemId);
    if (!shape) return null;
    const core = getCoreItem(itemId);
    const manifest = core?.manifest ?? packages?.get(itemId)?.manifest;
    const rule = core
      ? restRule(core, shape)
      : manifest
        ? packageRestRule(manifest)
        : { mode: 'upright' as const };
    return {
      min: shape.min,
      max: shape.max,
      rule,
      ...(manifest?.placement?.maxTilt !== undefined ? { maxTilt: manifest.placement.maxTilt } : {}),
      // Trees and plants grow out of the ground: the rest law keeps them in it (owner, 2026-10-07).
      ...((
        core
          ? core.group === 'nature'
          : /\b(nature|trees?|plants?|bush(es)?|flowers?|grass(es)?)\b/i.test(manifest?.subcategory ?? '')
      )
        ? { rooted: true }
        : {}),
    };
  };
  const restContext: RestContext = {
    shapeOf: (itemId) => {
      const key = `${state.doc.style.base}:${itemId}`;
      if (restRules.has(key)) return restRules.get(key)!;
      const shape = restShapeOf(itemId);
      restRules.set(key, shape);
      return shape;
    },
    // Floors, decks and water from the document as it is now, the same function the API reads
    // (P2-43 final review, I6): not the drawn rivers' profiles, which only catch up after a
    // command is done, so a river drawn a moment ago already carries what is set on it.
    surfaces: () =>
      (restSurfaces ??= new SurfaceIndex(state.doc, {
        groundAt: groundHeight,
        itemShape: restItemShape,
        restShape: (itemId) => restContext.shapeOf(itemId),
        ...restLayers(state),
      })),
    invalidate: () => {
      restSurfaces = null;
    },
    layers: () => restLayers(state),
  };
  // Render-only drawing fixes for placed items (P2-43 task 11): far things sit on the ground the
  // way TerrainView actually draws it (coarse LOD), and foundation items get a plinth down to the
  // ground. Only wired on terrain-based places: block ground has no chunk LOD steps to offset for.
  if (!voxels && !activeSurface)
    items.setDrawContext({
      terrain: {
        heightAt: (x, z) => terrain.heightAt(x, z),
        drawnHeightAt: (x, z, step) => terrain.drawnHeightAt(x, z, step),
      },
      stepAt: (x, z) => terrainView.stepAt(x, z),
      stepVersion: () => terrainView.stepVersion,
      shapeOf: restContext.shapeOf,
      surfaces: restContext.surfaces,
      realistic: () => currentStyle === 'realistic',
    });
  /** How far an item reaches across the ground from its pivot, turned any way (meters). */
  const scatterReach = (itemId: string, scale: readonly number[]): number => {
    const shape = restContext.shapeOf(itemId);
    if (!shape) return 1;
    const x = Math.max(Math.abs(shape.min[0]!), Math.abs(shape.max[0]!)) * Math.abs(scale[0] ?? 1);
    const z = Math.max(Math.abs(shape.min[2]!), Math.abs(shape.max[2]!)) * Math.abs(scale[2] ?? 1);
    return Math.hypot(x, z);
  };
  const markers = new RuleMarkers(scene);
  const worldEnv = (): WorldEnvironment => ({
    groundAt: groundHeight,
    waterAt: waterLevelAt,
    // What is under a point comes from the same surface index the rest law uses (P2-43).
    supportBelow: (x, z, fromY, ignore) => restContext.surfaces().below(x, z, fromY, ignore),
    itemShape,
    // Blocks make steps, not slopes: the slope rule is for the height field.
    steepCells: (degrees) =>
      voxels
        ? []
        : terrain.steepCells(
            (terrain.activeSurfaceStore?.descriptor.spacing ?? terrain.spacing) *
              Math.tan((degrees * Math.PI) / 180),
          ),
    doors: () => state.doc.walls.flatMap((wall) => doorSpots(wall, wallGround)),
    itemTriangles: trianglesOf,
    itemName: (itemId) => getCoreItem(itemId)?.manifest.name ?? packages?.get(itemId)?.manifest.name ?? null,
    itemRules: (itemId) =>
      (getCoreItem(itemId)?.manifest ?? packages?.get(itemId)?.manifest)?.placement ?? null,
    soilAt,
    floors: roomFloors,
    wallBoxes: () => state.doc.walls.flatMap((wall) => wallBoxes(wall, wallGround)),
    // The rest law (P2-43): judges floating, buried and slope by `rest` instead of the plain box
    // test, and folds in what the world scatters (woods, painted cover) near the player.
    restShape: restContext.shapeOf,
    scattered: () => [...scatter.instancesNear(character.feet.x, character.feet.z)],
    // The checks ask the law's own index (bridge decks, the law's item shapes), never a second
    // one built from loaded models (P2-43 final review, C1).
    surfaces: restContext.surfaces,
    // Riding is off in side-view places (movement modes): the Checks say so.
    playView,
  });
  const checkWorld = (): WorldReport => validateWorld(state.doc, worldEnv());
  // Orientation compass while building (owner note, docs/reference/tools/01): a face turns the
  // camera around the player to that side; hidden in Test, for players, and on touch or small
  // screens (phones and tablets use the simple layout).
  // Top and bottom keep the current turn and only tilt the camera.
  const FACE_ORBIT: Record<ViewFace, { yaw?: number; pitch: number }> = {
    front: { yaw: 0, pitch: 0.15 },
    back: { yaw: Math.PI, pitch: 0.15 },
    right: { yaw: Math.PI / 2, pitch: 0.15 },
    left: { yaw: -Math.PI / 2, pitch: 0.15 },
    top: { pitch: 1.2 },
    bottom: { pitch: -0.1 },
  };
  // Top right (owner note, docs/reference/genvr/06): the bottom left is where toolbars sit.
  const viewCube = editable
    ? new ViewCube(
        container,
        (face) => {
          const { yaw, pitch } = FACE_ORBIT[face];
          if (yaw !== undefined) orbit.yaw = yaw;
          orbit.pitch = pitch;
        },
        { corner: 'top-right' },
      )
    : null;
  let viewCubeWanted = true;
  items.setSimulating(!editable, state.doc);
  items.setMarkersVisible(editable, state.doc);
  items.sync(state.doc);
  applyScatter(state.doc.spawn.position[0], state.doc.spawn.position[2]);
  // With the items known, a start point inside one moves off it now.
  spawnItems = items;
  {
    const settled = spawnFeetNow();
    if (settled.x !== spawnFeet.x || settled.z !== spawnFeet.z) {
      character.teleport(settled);
      terrainColliders.update(settled.x, settled.z);
    }
  }
  scene.add(items.group);
  // Lamps glow at night and the nearest light the street.
  const nightLights = new NightLights();
  nightLights.sync(state.doc);
  scene.add(nightLights.group);
  const previews = new PreviewRenderer(renderer, items, structures.roadMaterials, packages);

  const history = new CommandHistory(state);

  /** A new base style (set_style): soils, outer ground, water, and light change live. */
  const applyStyle = () => {
    if (state.doc.style.base === currentStyle) return;
    currentStyle = state.doc.style.base;
    style = STYLE_LOOKS[currentStyle];
    terrainView.setSoilColors(SOIL_COLORS[currentStyle]);
    texture.dispose();
    texture = groundTexture(style);
    if (outerFollowsEdge) {
      texture.repeat.set(1, 1);
      rebuildOuterGround();
    } else texture.repeat.set(half / style.tile, half / style.tile);
    outerGroundMaterial.map = texture;
    outerGroundMaterial.needsUpdate = true;
    water.setLook(style.water.color, style.water.opacity);
    rivers.setLook(style.water.color);
    applyWaterLook();
    environment.setStyle(style);
    applyShadows();
    avatar.setCubes(style.avatar === 'cubes');
    remotePlayers.setCubes(style.avatar === 'cubes');
    // Items with their own look for a style change shape with it.
    for (const itemId of new Set(state.doc.instances.map((instance) => instance.itemId)))
      if (getCoreItem(itemId)?.looks) {
        items.reload(itemId, state.doc);
        tools?.itemModelChanged(itemId);
      }
  };

  /** Rebuilds what commands changed and reports them (e.g. to the save queue). */
  /** Rebuilds everything a change touched (terrain chunks and their neighbors, structures...). */
  const refresh = (changed: Iterable<string>) => {
    // Ride settings and seats of items may have changed (movement modes).
    rideSeats.clear();
    // Shared border vertices: also rebuild the neighbors of every changed chunk. Block edits
    // ("v:cx,cz") come back through voxels.takeChanged below.
    const keys = new Set([...changed].filter((key) => !key.startsWith('v:')));
    const withNeighbors = new Set<string>();
    for (const key of keys) {
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      for (let dz = -1; dz <= 1; dz += 1)
        for (let dx = -1; dx <= 1; dx += 1) withNeighbors.add(`${cx + dx},${cz + dz}`);
    }
    // Block ground follows the roads (P2-26 stage 2): redraw the chunks they changed and their
    // neighbors (faces and corner shading read one block across the border).
    if (voxels) {
      voxels.setRoads(state.doc.roads);
      voxels.setWalls(state.doc.walls);
      for (const key of voxels.takeChanged()) {
        const [cx, cz] = key.split(',').map(Number) as [number, number];
        for (let dz = -1; dz <= 1; dz += 1)
          for (let dx = -1; dx <= 1; dx += 1) withNeighbors.add(`${cx + dx},${cz + dz}`);
      }
      // Ground that rose under the player (a road taken away) lifts them onto its top block.
      const feet = character.feet;
      const top = groundHeight(feet.x, feet.z);
      if (feet.y < top - 0.01 && feet.y > top - 4)
        character.teleport({ x: feet.x, y: top + 0.05, z: feet.z });
    }
    // Height-field ground that rose over the player (a real place built around them) lifts them onto it; it has no
    // caves, so any depth below is a mistake to undo (R2i).
    if (!voxels && keys.size > 0) {
      const feet = character.feet;
      const top = groundHeight(feet.x, feet.z);
      if (feet.y < top - 0.01) character.teleport({ x: feet.x, y: top + 0.05, z: feet.z });
    }
    groundView.markDirty(withNeighbors);
    // Ground changed along the border: the outer ground follows it (R2k).
    const edge = terrain.chunkRange;
    for (const key of keys) {
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      if (cx <= edge.min || cx >= edge.max || cz <= edge.min || cz >= edge.max) {
        rebuildOuterGround();
        break;
      }
    }
    if (keys.size > 0) tidewaterLighting?.invalidate();
    if (keys.size > 0) tidewaterGround?.invalidate();
    terrainColliders.markDirty(withNeighbors);
    structures.sync(structureDoc(), keys);
    // Plinths reach down to the ground, which just changed (P2-43 final review).
    if (keys.size > 0) items.groundChanged();
    items.sync(state.doc);
    nightLights.sync(state.doc);
    // Whatever the world scattered on this ground is worked out again, so trees follow sculpting.
    scatter.groundChanged(keys);
    applyScatter(character.feet.x, character.feet.z);
    water.sync(state.doc);
    rivers.sync(state.doc);
    riverState.profiles = rivers.profiles;
    // Shores and foam follow sculpting: water over changed chunks measures its depth again.
    const size = terrain.chunkSize;
    water.groundChanged(
      [...keys].map((key) => {
        const [cx, cz] = key.split(',').map(Number) as [number, number];
        return { minX: cx * size, minZ: cz * size, maxX: (cx + 1) * size, maxZ: (cz + 1) * size };
      }),
    );
    environment.apply(state.doc.environment);
    audio.setState(audioState());
    applyStyle();
    applyGround();
    applyGrass(keys.size > 0 || state.doc.roads.length !== grassRoads);
    grassRoads = state.doc.roads.length;
    tools?.afterCommand();
  };

  // Co-building: local edits stay pending until the realtime room confirms them (P3-08).
  const replica = new Replica(state);
  let collaborative = false;
  let commandCounter = 0;
  // A random part per page, so ids never repeat across builders (reconnects match edits by id).
  const pageTag = Math.random().toString(36).slice(2, 8);
  const newCommandId = () => `${pageTag}-${Date.now().toString(36)}-${(commandCounter += 1)}`;

  /** Scatter under an item, a floor or a deck that changed is worked out again (P2-43). */
  const regrowScatter = (steps: Parameters<typeof scatterChunksAfter>[0]) => {
    const regrow = scatterChunksAfter(steps, state.doc, terrain.chunkSize, scatterReach);
    if (regrow === 'all') scatter.clear();
    else scatter.groundChanged(regrow);
  };

  /** Rebuilds what local commands changed and reports them (to the save queue or the room). */
  const afterApply = (steps: AppliedStep[], source: 'edit' | 'undo' | 'redo' = 'edit'): boolean => {
    if (steps.length === 0) return false;
    // Undo and redo move items behind the index's back. Edits went through applyWithRest, which
    // keeps the index in step (and drops it itself after walls, roads, water or style).
    if (source !== 'edit') restSurfaces = null;
    // Refresh below fills the scatter ring back in where this cleared it.
    regrowScatter(steps);
    refresh(steps.flatMap((step) => [...step.result.changedChunks]));
    for (const step of steps) {
      const id = newCommandId();
      if (collaborative) replica.track(id, step.applied, step.result.inverse);
      onCommand?.(step.applied, id, source);
    }
    return true;
  };

  /** Applies a world command through the shared world model (build tools and assistant use this). */
  let lastCommandError: string | null = null;
  const applyCommand = (command: CommandPayload): boolean => {
    try {
      const ok = afterApply(applyWithRest(history, state, restContext, command));
      lastCommandError = null;
      return ok;
    } catch (error) {
      if (error instanceof CommandError) {
        lastCommandError = error.message;
        return false;
      }
      throw error;
    }
  };

  /**
   * Ends a group of edits (a drag, a nudge of several items, a batch): the rest law first levels
   * the ground under a graded building the group moved, once, where it was dropped (P2-43 final
   * review, I1), inside the same undo step.
   */
  const endEditGroup = (): string | null => {
    try {
      afterApply(endRestGroup(history, state, restContext));
      return null;
    } catch (error) {
      if (!(error instanceof CommandError)) throw error;
      lastCommandError = error.message;
      return error.message;
    }
  };

  /**
   * Begins a group of edits; one still open is ended through the rest law first, so the grades it
   * deferred are levelled rather than lost (P2-43 final review).
   */
  const beginEditGroup = () => {
    try {
      afterApply(beginRestGroup(history, state, restContext));
    } catch (error) {
      if (!(error instanceof CommandError)) throw error;
      lastCommandError = error.message;
      history.beginGroup();
    }
  };

  // Build tools: a tap (press and release without dragging) goes to the active tool.
  const tools = editable
    ? new BuildTools({
        camera,
        canvas,
        scene,
        ground: groundView.group,
        structures: structures.group,
        items,
        water: water.group,
        rivers: rivers.group,
        terrain,
        roadMaterials: structures.roadMaterials,
        beginGroup: beginEditGroup,
        endGroup: () => {
          endEditGroup();
        },
        heightAt,
        ...(voxels
          ? {
              roadAt: (x: number, z: number) => voxels.roadAt(x, z),
              wallAt: (x: number, z: number) => voxels.wallAt(x, z),
              blocks: { voxels, player: () => character.feet },
            }
          : {}),
        world: () => state.doc,
        apply: applyCommand,
        isResting: (instance: ItemInstance) => {
          const shape = restContext.shapeOf(instance.itemId);
          return shape !== null && isResting(instance, shape, restContext.surfaces());
        },
        ...(onToolStatus ? { onStatus: onToolStatus } : {}),
      })
    : null;
  const presses = new Map<number, { x: number; y: number; time: number }>();
  const onPressStart = (event: PointerEvent) => {
    presses.set(event.pointerId, { x: event.clientX, y: event.clientY, time: performance.now() });
    // A second finger turns this into a gesture: none of the fingers taps.
    if (presses.size > 1) for (const id of presses.keys()) presses.set(id, { x: -1e6, y: -1e6, time: 0 });
  };
  const onPressEnd = (event: PointerEvent) => {
    const press = presses.get(event.pointerId);
    presses.delete(event.pointerId);
    if (!press || !tools?.tool) return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (moved < 8 && performance.now() - press.time < 600)
      tools.tap(event.clientX, event.clientY, event.shiftKey || event.ctrlKey || event.metaKey);
  };
  const onHover = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.buttons === 0) tools?.hover(event.clientX, event.clientY);
  };
  const onToolKey = (event: KeyboardEvent) => {
    if (
      !tools?.tool ||
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    )
      return;
    if (event.key === 'Enter') tools.finish();
    else if (event.key === 'Escape') tools.cancel();
    else if (event.key === 'Backspace') tools.removeLastPoint();
    else if (event.key === 'r' || event.key === 'R') tools.rotateItem();
    else if (event.key === 'Delete') tools.deleteItem();
    else if (event.key.startsWith('Arrow') || event.key === 'PageUp' || event.key === 'PageDown') {
      // Nudge relative to the camera: Up moves away from it along the nearest ground axis.
      const forward = { x: -Math.sin(orbit.yaw), z: -Math.cos(orbit.yaw) };
      const axis =
        Math.abs(forward.x) > Math.abs(forward.z)
          ? { fx: Math.sign(forward.x), fz: 0 }
          : { fx: 0, fz: Math.sign(forward.z) };
      // Right of forward (x, z) is (-z, x).
      const right = { x: -axis.fz, z: axis.fx };
      const scale = event.shiftKey ? 5 : 1;
      const [dx, dy, dz] =
        event.key === 'ArrowUp'
          ? [axis.fx, 0, axis.fz]
          : event.key === 'ArrowDown'
            ? [-axis.fx, 0, -axis.fz]
            : event.key === 'ArrowRight'
              ? [right.x, 0, right.z]
              : event.key === 'ArrowLeft'
                ? [-right.x, 0, -right.z]
                : event.key === 'PageUp'
                  ? [0, 1, 0]
                  : [0, -1, 0];
      if (tools.nudge(dx * scale, dy * scale, dz * scale)) event.preventDefault();
    }
  };
  if (tools) {
    canvas.addEventListener('pointerdown', onPressStart);
    canvas.addEventListener('pointerup', onPressEnd);
    canvas.addEventListener('pointermove', onHover);
    window.addEventListener('keydown', onToolKey);
  }

  // Building with the avatar's hands in play (decision 109): a tap (or a click) on a block.
  const handsRaycaster = new Raycaster();
  const handsNdc = new Vector2();
  const hands = voxels
    ? new PlayerHands({
        scene,
        voxels,
        ray: (clientX, clientY) => {
          const rect = canvas.getBoundingClientRect();
          handsNdc.set(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1,
          );
          handsRaycaster.setFromCamera(handsNdc, camera);
          return handsRaycaster.ray;
        },
        cameraDistance: () => camera.position.distanceTo(avatar.root.position),
        player: () => character.feet,
        spawn: world.spawn.position,
        send: (blocks) => onPlayerBlocks?.(blocks) ?? false,
        blockStyle: blockLook ?? style.blocks ?? 'plain',
      })
    : null;
  let handsAllowed = false;
  let handsMode: HandsMode = 'place';
  /** The block in hand last told to the room (decision 109). */
  let heldSent = 0;
  /** The game tool in the right hand (P9-12); it takes the hand from building. */
  const heldTool = new HeldTool();
  const handsOn = () => handsAllowed && simulating && !tools?.tool && !heldTool.itemId;
  const handPresses = new Map<number, { x: number; y: number; time: number }>();
  const onHandsDown = (event: PointerEvent) => {
    if (!hands || !handsOn()) return;
    // Taps on the left half of a touch screen belong to the joystick.
    if (event.pointerType !== 'mouse' && event.clientX <= canvas.clientWidth / 2) return;
    handPresses.set(event.pointerId, { x: event.clientX, y: event.clientY, time: performance.now() });
  };
  const onHandsUp = (event: PointerEvent) => {
    const press = handPresses.get(event.pointerId);
    handPresses.delete(event.pointerId);
    if (!press || !hands || !handsOn()) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 8) return;
    if (performance.now() - press.time > 600) return;
    // The mouse digs with the left button and places with the right; touch uses the chosen mode.
    const mode: HandsMode =
      event.pointerType === 'mouse' ? (event.button === 2 ? 'place' : 'dig') : handsMode;
    const refused = hands.use(event.clientX, event.clientY, mode);
    if (refused) onHandsNotice?.(refused);
    else if (animator.clipNames.includes('Build')) {
      sitting = null;
      emote = { clip: 'Build', left: animator.duration('Build') };
    }
  };
  const onHandsHover = (event: PointerEvent) => {
    if (!hands || !handsOn()) return;
    if (event.pointerType === 'mouse' && event.buttons === 0)
      hands.hover(event.clientX, event.clientY, 'dig');
    else hands.hide();
  };
  const onHandsMenu = (event: MouseEvent) => {
    if (handsOn()) event.preventDefault();
  };
  if (hands) {
    canvas.addEventListener('pointerdown', onHandsDown);
    canvas.addEventListener('pointerup', onHandsUp);
    canvas.addEventListener('pointermove', onHandsHover);
    canvas.addEventListener('contextmenu', onHandsMenu);
  }
  /** Redraws blocks players changed (and their colliders); lifts the player out of a new block. */
  const refreshBlocks = () => {
    if (!voxels) return;
    const dirty = new Set<string>();
    for (const key of voxels.takeChanged()) {
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      for (let dz = -1; dz <= 1; dz += 1)
        for (let dx = -1; dx <= 1; dx += 1) dirty.add(`${cx + dx},${cz + dz}`);
    }
    groundView.markDirty(dirty);
    terrainColliders.markDirty(dirty);
    const feet = character.feet;
    if (voxels.solidAt(Math.floor(feet.x), Math.floor(feet.y + 0.1), Math.floor(feet.z))) {
      const top = groundHeight(feet.x, feet.z);
      if (top > feet.y && top < feet.y + 3) character.teleport({ x: feet.x, y: top + 0.05, z: feet.z });
    }
  };

  // Sitting (on a bench or on the ground), swimming, and the touch jump button.
  let sitting: { kind: 'seat' | 'ground'; x: number; y: number; z: number; yaw: number } | null = null;
  let swimming = false;
  let swimMotion = createSwimMotion();
  /** The ladder the player holds on to (P2-23), and time left before grabbing one again. */
  let climbing: Climbable | null = null;
  /** Into the ladder, fixed when taking hold (crossing its middle at the top must not flip it). */
  const climbToward = { x: 0, z: 0 };
  let letGoLeft = 0;
  let jumpQueued = false;
  // Side-view moves (decision 95): jumps and dashes act on the press, not while held.
  const moves = new Set(sideMoves);
  let dashQueued = false;
  let jumpHeld = false;
  let dashHeld = false;
  let airJumps = 0;
  let wallSide: -1 | 0 | 1 = 0;
  let wallLeft = 0;
  let pushX = 0;
  let pushLeft = 0;
  let dashLeft = 0;
  let dashWait = 0;
  let dashDirection = 1;
  let airDashed = false;
  let dropLeft = 0;
  let controlsEnabled = true;
  let presentationBackdrop=false, presentationNavigation=false;
  let padSitDown = false;
  let interactHeld = false;

  // Riding (movement modes): the local player's ride, the rules' speed factor, and what is in reach.
  let rideNow: {
    instanceId: string;
    seat: number;
    ride: Ride;
    /** The seat in the item's own space. */
    seatLocal: { x: number; y: number; z: number };
    /** Seat 1 steers here; passengers are carried by the item's drawn pose. */
    controller: RideController | null;
  } | null = null;
  const speedRule = { factor: 1, until: 0 };
  const speedFactorNow = () => {
    if (speedRule.factor === 1) return 1;
    if (speedRule.until > 0 && Date.now() >= speedRule.until) {
      speedRule.factor = 1;
      speedRule.until = 0;
      return 1;
    }
    return speedRule.factor;
  };
  let inReach: { instanceId: string; model: RideModel } | null = null;
  /** Speed over the ground (the Speed display), reset on every teleport. */
  const groundSpeed = new GroundSpeed();
  /** The chase camera's look height, eased. */
  let chaseY: number | null = null;
  const rideIn = { throttle: 0, steer: 0, up: false, down: false };
  const riderAt = { x: 0, y: 0, z: 0 };
  const drivenPose: LivePose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
  const rideSurface = (x: number, z: number, out: RideSurface): RideSurface => {
    out.ground = groundHeight(x, z);
    out.water = waterLevelAt(x, z);
    return out;
  };

  /** Each item another player steers here: its last yaw and lean, for the bank and tilt worked out here. */
  const remoteLean = new Map<string, { yaw: number; pitch: number; roll: number; time: number }>();
  const leanTarget = { pitch: 0, roll: 0 };
  const remotePose: LivePose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
  /** The room's rows (`rides`) as last seen, so an unchanged row never pulls an item back. */
  const rideRows = new Map<string, { x: number; y: number; z: number; yaw: number }>();
  /** Items a player shown here steered in the last frame (their drawn pose moves the item; rows wait). */
  const steered = new Set<string>();
  const steeredNow = new Set<string>();
  // Other players on items (movement modes): seat 1's eased pose moves the item, riders sit on it.
  remotePlayers.riders = {
    steer: (item, pose, dt) => {
      // The item the local player steers is theirs to move.
      if (rideNow?.controller && rideNow.instanceId === item) return;
      steeredNow.add(item);
      const setup = rideSetup(item);
      let lean = remoteLean.get(item);
      if (!lean) {
        lean = { yaw: pose.yaw, pitch: 0, roll: 0, time: 0 };
        remoteLean.set(item, lean);
      }
      if (setup && dt > 0) {
        const yawRate = Math.atan2(Math.sin(pose.yaw - lean.yaw), Math.cos(pose.yaw - lean.yaw)) / dt;
        lean.time += dt;
        rideTilt(setup.ride, pose, setup.size, rideSurface, yawRate, lean.time, leanTarget);
        const k = 1 - Math.exp(-6 * dt);
        lean.pitch += (leanTarget.pitch - lean.pitch) * k;
        lean.roll += (leanTarget.roll - lean.roll) * k;
      }
      lean.yaw = pose.yaw;
      remotePose.x = pose.x;
      remotePose.y = pose.y;
      remotePose.z = pose.z;
      remotePose.yaw = pose.yaw;
      remotePose.pitch = lean.pitch;
      remotePose.roll = lean.roll;
      items.setLivePose(item, remotePose, true);
    },
    seat: (item, seat, out) => {
      const setup = rideSetup(item);
      const pose = setup ? items.livePose(item) : null;
      if (!setup || !pose) return false;
      seatInWorld(pose, setup.seats[Math.min(setup.seats.length, Math.max(1, seat)) - 1]!, out);
      if (setup.ride.pose === 'sit') out.y -= RIDER.sitDrop;
      out.yaw = pose.yaw;
      return true;
    },
    // Moves come 20 times a second: a fast item goes far between two (spec R1).
    snapDistance: (item) => (rideSetup(item)?.ride.maxSpeed ?? 0) * 0.6,
  };
  /**
   * The room's rows: an item not steered by anyone shown here is drawn at its row when the row
   * changed; an item whose row went is back where it was placed.
   */
  const applyRidePoses = (
    rows: ReadonlyArray<{ instanceId: string; x: number; y: number; z: number; yaw: number }>,
  ) => {
    const busy = (id: string) => steered.has(id) || rideNow?.instanceId === id;
    const seen = new Set<string>();
    for (const row of rows) {
      seen.add(row.instanceId);
      const last = rideRows.get(row.instanceId);
      if (last && last.x === row.x && last.y === row.y && last.z === row.z && last.yaw === row.yaw) continue;
      rideRows.set(row.instanceId, { x: row.x, y: row.y, z: row.z, yaw: row.yaw });
      if (!busy(row.instanceId)) items.setLivePose(row.instanceId, row, true);
    }
    for (const id of [...rideRows.keys()]) {
      if (seen.has(id)) continue;
      rideRows.delete(id);
      remoteLean.delete(id);
      if (!busy(id)) items.setLivePose(id, null);
    }
  };

  const endRideHere = (exit?: { x: number; y: number; z: number; yaw?: number }) => {
    const current = rideNow;
    if (!current) return;
    rideNow = null;
    chaseY = null;
    if (current.controller) {
      // The item stays where it was left (solid again) until the room says otherwise.
      const pose = current.controller.pose;
      drivenPose.x = pose.x;
      drivenPose.y = pose.y;
      drivenPose.z = pose.z;
      drivenPose.yaw = pose.yaw;
      drivenPose.pitch = 0;
      drivenPose.roll = 0;
      current.controller.dispose();
      items.setLivePose(current.instanceId, drivenPose, true);
    }
    character.setEnabled(true);
    const at = exit ?? items.livePose(current.instanceId) ?? character.feet;
    character.teleport({ x: at.x, y: exit ? at.y : at.y + 0.05, z: at.z });
    groundSpeed.reset();
    terrainColliders.update(at.x, at.z);
    if (exit?.yaw !== undefined) avatar.root.rotation.y = exit.yaw;
  };
  const startRideHere = (instanceId: string, seat: number): boolean => {
    if (!simulating || playView === 'side') return false;
    const setup = rideSetup(instanceId);
    const pose = items.livePose(instanceId);
    if (!setup || !pose) return false;
    if (rideNow?.instanceId === instanceId && rideNow.seat === seat) return true;
    const start: Pose4 = { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw };
    if (rideNow) {
      rideNow.controller?.dispose();
      rideNow.controller = null;
    }
    const seatLocal = setup.seats[Math.min(setup.seats.length, Math.max(1, seat)) - 1]!;
    const controller =
      seat === 1
        ? new RideController(
            physics,
            { instanceId, bounds: setup.bounds, pose: start },
            setup.ride,
            rideSurface,
          )
        : null;
    // The steered item's box is the controller's; one carried by another player is solid.
    items.setLivePose(instanceId, start, seat !== 1);
    rideNow = { instanceId, seat, ride: setup.ride, seatLocal, controller };
    sitting = null;
    emote = null;
    climbing = null;
    swimming = false;
    swimMotion = createSwimMotion();
    character.setEnabled(false);
    // The camera turns to behind the item at once.
    lookIdle = CHASE_CAMERA.lookBack;
    return true;
  };
  /**
   * Library animation being played; `left` counts down for one-shots. A strike (P9-12) goes on
   * while the player moves: fights happen on the run.
   */
  let emote: { clip: string; left: number | null; moving?: boolean } | null = null;
  const sceneAnimation = new SceneAnimationLayer();
  /** FILM-10: the spot a filmed avatar walks to (null: the player's own controls). */
  let sceneWalkTo: { x: number; z: number; run: boolean } | null = null;
  const sceneMotions = new Map<
    string,
    { base: ScenePose; motion: SceneMotion; startedAt: number; seconds: number }
  >();
  const sceneTravels = new Map<
    string,
    {
      start: ScenePose;
      spots: Array<{ x: number; z: number }>;
      speed: number;
      lift: number;
      startedAt: number;
    }
  >();
  const clearSceneMotions = () => {
    for (const id of sceneTravels.keys())
      if (
        !sceneMotions.has(id) &&
        !steered.has(id) &&
        rideNow?.instanceId !== id &&
        !rideRows.has(id) &&
        !remoteLean.has(id)
      )
        items.setLivePose(id, null);
    sceneTravels.clear();
    for (const id of sceneMotions.keys())
      if (!steered.has(id) && rideNow?.instanceId !== id && !rideRows.has(id) && !remoteLean.has(id))
        items.setLivePose(id, null);
    sceneMotions.clear();
  };
  const toggleSit = () => {
    if (rideNow) return;
    emote = null;
    if (sitting) {
      sitting = null;
      return;
    }
    const feet = character.feet;
    let best: { d: number; instance: (typeof state.doc.instances)[number] } | null = null;
    for (const instance of state.doc.instances) {
      if (instance.itemId !== 'genvr.core.bench') continue;
      const [bx, , bz] = instance.transform.position;
      const d = Math.hypot(bx - feet.x, bz - feet.z);
      if (d < SEAT_REACH && (!best || d < best.d)) best = { d, instance };
    }
    if (best) {
      const [bx, by, bz] = best.instance.transform.position;
      const q = best.instance.transform.rotation;
      const yaw = 2 * Math.atan2(q[1], q[3]);
      // The seat faces the bench's front (+z in its own space), slightly in front of the back.
      sitting = { kind: 'seat', x: bx + Math.sin(yaw) * 0.05, y: by, z: bz + Math.cos(yaw) * 0.05, yaw };
    } else {
      sitting = { kind: 'ground', x: feet.x, y: feet.y, z: feet.z, yaw: avatar.root.rotation.y };
    }
  };
  const onSitKey = (event: KeyboardEvent) => {
    if (event.code !== 'KeyC' || event.target instanceof HTMLInputElement) return;
    if (tools?.tool && tools.tool !== 'select') return;
    toggleSit();
  };
  window.addEventListener('keydown', onSitKey);
  const playAnimation = (id: string) => {
    const animation = findAnimation(id);
    if (!animation) return false;
    if (animation.manifest.id === SIT_ANIMATION_ID) {
      toggleSit();
      return true;
    }
    if (!animator.clipNames.includes(animation.clip)) return false;
    sitting = null;
    emote = {
      clip: animation.clip,
      left: animation.kind === 'once' ? animator.duration(animation.clip) : null,
    };
    return true;
  };

  const timer = new Timer();
  const forward = new Vector3();
  const right = new Vector3();
  const move = new Vector3();
  const lookTarget = new Vector3();
  const cameraDirection = new Vector3();
  let cameraDistance = orbit.distance;
  // Side view (decision 93): on while playing or testing; players move on the line z = lane.
  let simulating = !editable;
  // Items move between their LOD levels a few times a second (decision 94).
  let lodTimer = 0;
  let lane: number | null = null;
  const sideView = () => playView === 'side' && simulating;

  let fps = 0;
  // Frame-rate cap (P3-21): skip animation frames that come too soon.
  let minFrameMs = 0;
  /** Seconds since the runtime started, for the rings swimmers leave. */
  let wakeClock = 0;
  let lastFrameAt = -Infinity;
  // Opt-in local frame diagnosis; no scene scans or GPU readbacks.
  const profileFrames = urlFlags?.get('profileFrames') === '1';
  let profileLast = 0,
    profileLog = 0;
  const frame = (time: number) => {
    // Atlas baking temporarily owns renderer targets/MRT; do not interleave a world frame.
    if (canopyLoading.busy || canopyLoading.closed) {
      timer.update(time);
      return;
    }
    const profileStart = profileFrames ? performance.now() : 0;
    const profileGap = profileStart - profileLast;
    profileLast = profileStart;
    if (minFrameMs > 0) {
      // A little slack so a 60 Hz screen still gets every frame at a 60 cap.
      if (time - lastFrameAt < minFrameMs - 2) return;
      lastFrameAt = time;
    }
    timer.update(time);
    const raw = timer.getDelta();
    // Frames per second, smoothed over about a second.
    if (raw > 0) fps += (1 / raw - fps) * Math.min(1, raw);
    // Clamp to (0, 50 ms]: the first frame's timestamp can precede the timer start (negative).
    const dt = Math.min(Math.max(raw, 0), 0.05);
    // One clock for the wake, read by the rings here and by the shader that draws them, so a
    // ring's age can never mean two different things.
    wakeClock += dt;
    wake.tick(wakeClock);
    const intent = controlsEnabled && (!presentationBackdrop || presentationNavigation)
      ? mergeIntents(sources.map((source) => source.read()))
      : { direction: { x: 0, z: 0 }, speed: 0, jump: false };
    if (jumpQueued) {
      intent.jump = true;
      jumpQueued = false;
    }
    if (dashQueued) {
      intent.dash = true;
      dashQueued = false;
    }
    // Game controller: the right stick turns the camera, B / Circle sits (docs/PLAYER-UI.md keys).
    const pad = controlsEnabled && (!presentationBackdrop || presentationNavigation) ? firstGamepad() : null;
    if (pad) {
      if (stickValue(pad.axes[2]) !== 0 || stickValue(pad.axes[3]) !== 0) lookIdle = 0;
      orbit.yaw -= stickValue(pad.axes[2]) * 2.4 * dt * view.sensitivity;
      orbit.pitch = Math.min(
        1.2,
        Math.max(-0.1, orbit.pitch + stickValue(pad.axes[3]) * 1.6 * dt * view.sensitivity * pitchSign()),
      );
      // While riding, B / Circle goes down instead (the ride input reads it).
      const sitPressed = Boolean(pad.buttons[1]?.pressed);
      if (sitPressed && !padSitDown && !rideNow) toggleSit();
      padSitDown = sitPressed;
    }
    lookIdle += dt;
    // Get on or off (E, Y): the page asks the room. Not in the side view, where E dashes.
    const interactPressed = Boolean(intent.interact) && !interactHeld;
    interactHeld = Boolean(intent.interact);
    const side = sideView();
    if (interactPressed && simulating && !side) onInteract?.();
    // Other players first: an item someone else steers moves before a rider is put on it.
    steeredNow.clear();
    remotePlayers.update(dt, avatar.root.position);
    steered.clear();
    for (const id of steeredNow) steered.add(id);
    const riding = rideNow;
    let moved = 0;
    let climbSpeed: number | null = null;
    if (riding) {
      // Riding (movement modes): seat 1 predicts the item's move; passengers are carried.
      if (riding.controller) {
        riding.controller.step(rideInput(intent, rideIn), dt, speedFactorNow());
        const pose = riding.controller.pose;
        const tilt = riding.controller.tilt;
        drivenPose.x = pose.x;
        drivenPose.y = pose.y;
        drivenPose.z = pose.z;
        drivenPose.yaw = pose.yaw;
        drivenPose.pitch = tilt.pitch;
        drivenPose.roll = tilt.roll;
        items.setLivePose(riding.instanceId, drivenPose, false);
      } else {
        // A passenger's world still moves on (loose items, other players' items).
        physics.step(dt);
      }
    } else {
      // Moving or jumping stands the player up again and stops an animation.
      if (sitting && (intent.speed > 0.1 || intent.jump)) sitting = null;
      if (emote && !emote.moving && (intent.speed > 0.1 || intent.jump)) emote = null;

      // Camera-relative movement on the ground plane; in the side view only left and right.
      if (side && lane === null) lane = character.feet.z;
      if (!side) lane = null;
      if (side) {
        forward.set(0, 0, 0);
        right.set(1, 0, 0);
      } else {
        forward.set(-Math.sin(orbit.yaw), 0, -Math.cos(orbit.yaw));
        right.set(-forward.z, 0, forward.x);
      }
      move.copy(forward).multiplyScalar(intent.direction.z).addScaledVector(right, intent.direction.x);
      // The rules' `set_speed` makes walking faster or slower too.
      const speed = (intent.speed > 0.75 ? RUN_SPEED : WALK_SPEED) * speedFactorNow();
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed * Math.min(1, intent.speed * 2));
        avatar.root.rotation.y = Math.atan2(move.x, move.z);
      }
      // Filming (FILM-10): a walk to a spot replaces the player's input and stops on the spot.
      if (sceneWalkTo && !side) {
        const dx = sceneWalkTo.x - character.feet.x,
          dz = sceneWalkTo.z - character.feet.z,
          left = Math.hypot(dx, dz);
        const pace = (sceneWalkTo.run ? RUN_SPEED : WALK_SPEED) * speedFactorNow();
        if (left > 0.05) {
          move.set(dx, 0, dz).multiplyScalar(Math.min(pace, left / Math.max(dt, 1 / 120)) / left);
          avatar.root.rotation.y = Math.atan2(dx, dz);
        } else move.set(0, 0, 0);
      }
      // Pulled back onto the line when something pushed the player off it.
      if (side && lane !== null) move.z = (lane - character.feet.z) / Math.max(dt, 1 / 120);
      // Swim in deep water (with a little hysteresis so the switch does not flicker).
      const before = character.feet;
      const surface = waterLevelAt(before.x, before.z);
      const depth = surface === null ? 0 : surface - before.y;
      swimming = swimming ? depth > SWIM.stopDepth : depth > SWIM.startDepth;
      if (!swimming || currentStyle !== 'realistic' || side) swimMotion = createSwimMotion();
      // Ladders (P2-23): up and down (W and S, the stick) climb while touching one; jump lets go.
      // Walking into a ladder, or falling past one, takes hold of it; so does stepping down onto it
      // from the top. A and D move along it (in the side view left and right get off); at the top
      // players step off onto what is behind the ladder.
      letGoLeft = Math.max(0, letGoLeft - dt);
      const ladder = sitting || swimming ? null : items.climbableAt(before);
      const vertical = Math.abs(intent.direction.z) > 0.3 ? Math.sign(intent.direction.z) : 0;
      // The ladder's front and which way the player faces it: into the ladder is `toward`.
      let towardX = 0;
      let towardZ = 0;
      const [ladderX, ladderZ] = ladder ? [ladder.x, ladder.z] : [before.x, before.z];
      // The ladder's front (+z in its own space).
      const [nx, nz] = ladder ? [Math.sin(ladder.yaw), Math.cos(ladder.yaw)] : [0, 1];
      if (ladder) {
        const front = (before.x - ladderX) * nx + (before.z - ladderZ) * nz >= 0 ? 1 : -1;
        towardX = -nx * front;
        towardZ = -nz * front;
      }
      if (!ladder || (intent.jump && climbing)) {
        if (climbing && intent.jump) letGoLeft = CLIMB.letGo;
        climbing = null;
      } else if (!climbing && letGoLeft <= 0) {
        // Walking into it from below; at the top, S (back) steps down onto it.
        const walkingInto =
          !side &&
          before.y < ladder.top - 0.3 &&
          move.lengthSq() > 0 &&
          (move.x * towardX + move.z * towardZ) / move.length() > 0.5;
        const pressing = side
          ? vertical !== 0
          : walkingInto || (vertical < 0 && before.y > ladder.bottom + 0.3);
        // In the side view, falling past a ladder while pressing left or right does not grab it.
        const falling =
          !character.grounded &&
          before.y > ladder.bottom + 0.3 &&
          !(side && Math.abs(intent.direction.x) > 0.3);
        if (pressing || falling) {
          climbing = ladder;
          // From the top players go down the side they face (where they were walking), turned back
          // toward where they came from; in the side view they may already stand past the middle.
          if (before.y > ladder.top - 0.3) {
            const facing = Math.sin(avatar.root.rotation.y) * nx + Math.cos(avatar.root.rotation.y) * nz;
            climbToward.x = facing >= 0 ? -nx : nx;
            climbToward.z = facing >= 0 ? -nz : nz;
          } else {
            climbToward.x = towardX;
            climbToward.z = towardZ;
          }
        }
      }
      if (climbing && vertical < 0 && character.grounded && before.y < climbing.bottom + 0.3) climbing = null;

      // Side-view moves (decision 95): thin floating platforms are passed from below and S drops
      // through them; the creator's moves add a second jump in the air, jumps off walls, and a dash.
      const jumpPressed = intent.jump && !jumpHeld;
      const dashPressed = Boolean(intent.dash) && !dashHeld;
      jumpHeld = intent.jump;
      dashHeld = Boolean(intent.dash);
      character.oneWay = side;
      dropLeft =
        side && !climbing && intent.direction.z < -0.5 ? SIDE_MOVE.dropTime : Math.max(0, dropLeft - dt);
      character.dropThrough = dropLeft > 0;
      wallLeft = Math.max(0, wallLeft - dt);
      dashWait = Math.max(0, dashWait - dt);
      const free = side && !climbing && !sitting && !swimming;
      if (character.grounded) {
        airJumps = moves.has('double-jump') ? 1 : 0;
        airDashed = false;
      }
      if (free && jumpPressed && !character.grounded) {
        if (moves.has('wall-jump') && wallLeft > 0) {
          // Off the wall: up, and pushed away from it for a moment.
          character.launch(JUMP_VELOCITY);
          pushX = -wallSide * SIDE_MOVE.wallPush;
          pushLeft = SIDE_MOVE.wallPushTime;
          wallLeft = 0;
        } else if (airJumps > 0) {
          character.launch(JUMP_VELOCITY);
          airJumps -= 1;
        }
      }
      if (free && moves.has('dash') && dashPressed && dashWait <= 0 && (character.grounded || !airDashed)) {
        // The way the player moves, else the way they face.
        dashDirection = move.x !== 0 ? Math.sign(move.x) : Math.sin(avatar.root.rotation.y) < 0 ? -1 : 1;
        dashLeft = SIDE_MOVE.dashTime;
        dashWait = SIDE_MOVE.dashWait;
        if (!character.grounded) airDashed = true;
      }
      const dashing = free && dashLeft > 0;
      if (!free) {
        dashLeft = 0;
        pushLeft = 0;
      }
      if (dashing) {
        dashLeft -= dt;
        move.x = dashDirection * SIDE_MOVE.dashSpeed;
        // A dash goes straight: no falling while it lasts.
        character.launch(0);
        avatar.root.rotation.y = dashDirection > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else if (pushLeft > 0) {
        pushLeft -= dt;
        move.x = pushX;
        avatar.root.rotation.y = pushX > 0 ? Math.PI / 2 : -Math.PI / 2;
      }

      if (climbing && ladder) {
        climbing = ladder;
        const atTop = before.y >= ladder.top + CLIMB_OVER - 0.02;
        let vy = vertical * CLIMB.speed;
        // The side view's left and right get off at walking speed; A and D move along the ladder.
        let vx = side ? move.x : 0;
        let vz = side ? move.z : 0;
        if (!side) {
          vx = -climbToward.z * intent.direction.x * CLIMB.sideways;
          vz = climbToward.x * intent.direction.x * CLIMB.sideways;
          avatar.root.rotation.y = Math.atan2(climbToward.x, climbToward.z);
        }
        if (atTop && vy > 0) {
          vy = 0;
          // Off the top onto the floor or ground behind the ladder (the side view steps left or right).
          if (!side) {
            vx += climbToward.x * CLIMB.stepOff;
            vz += climbToward.z * CLIMB.stepOff;
          }
        } else if (side && Math.abs(nx) < 0.5) {
          // The side view, a ladder facing the camera: climbers hang in its middle, like in a
          // platform game, until they press left or right to get off.
          if (Math.abs(intent.direction.x) < 0.3) vx += Math.max(-3, Math.min(3, (ladderX - before.x) * 8));
        } else if (!side || Math.abs(intent.direction.x) < 0.3) {
          // Hold on in front of the ladder (players who took hold from the top move over to it);
          // in the side view only along the line, until they press left or right to get off.
          const offset = (before.x - ladderX) * climbToward.x + (before.z - ladderZ) * climbToward.z;
          const pull = Math.max(-3, Math.min(3, (-CLIMB.hold - offset) * 8));
          vx += climbToward.x * pull;
          if (!side) vz += climbToward.z * pull;
        }
        character.climb({ x: vx, y: vy, z: vz }, dt);
        // Up or down speed; 0 while hanging still holds the climbing pose.
        climbSpeed = (character.feet.y - before.y) / dt;
      } else if (sitting) {
        character.move({ x: 0, z: 0 }, false, JUMP_VELOCITY, GRAVITY, dt);
      } else if (swimming && surface !== null) {
        // A river carries the swimmer downstream (P2-39). Only a share of the water's speed, so on
        // calm water a swimmer still works upstream slowly, while rapids carry them away.
        const here = character.feet;
        const [flowX, flowZ] = riverFlowAt(rivers.profiles, here.x, here.z);
        if (currentStyle === 'realistic' && !side) {
          const displacement = stepSwimMotion(
            swimMotion,
            {
              forward: swimLookForward(orbit.yaw, orbit.pitch, neutralSwimPitch),
              right,
              direction: intent.direction,
              ascend: intent.jump,
              dive: Boolean(intent.dive),
              sprint: intent.speed > 0.75,
              magnitude: Math.min(1, intent.speed * 2),
            },
            here.y,
            surface - SWIM.floatDepth,
            dt,
          );
          displacement.x += flowX * FLOW_DRAG * dt;
          displacement.z += flowZ * FLOW_DRAG * dt;
          moved = character.swimDisplacement(displacement, dt);
        } else
          moved = character.swim(
            {
              x: move.x * SWIM.speed + flowX * FLOW_DRAG,
              z: move.z * SWIM.speed + flowZ * FLOW_DRAG,
            },
            surface - SWIM.floatDepth,
            intent.jump,
            dt,
          );
      } else {
        moved = character.move(
          { x: move.x, z: move.z },
          intent.jump,
          JUMP_VELOCITY,
          dashing ? 0 : GRAVITY,
          dt,
        );
      }
      // Swimming leaves rings on the water; standing on dry land stops the trail (owner request).
      if (swimming && surface !== null)
        wake.follow('me', character.feet.x, character.feet.z, moved / Math.max(dt, 1e-3), wakeClock);
      else wake.forget('me');
      // A wall touched in the air: a jump soon after pushes off it (wall jump).
      if (free && !character.grounded && character.wall !== 0) {
        wallSide = character.wall;
        wallLeft = SIDE_MOVE.wallGrace;
      }

      // Fell out of the world: back to spawn (asked of the room once a second while it answers).
      if (
        swimFallout(character.feet.y, swimming, waterLevelAt(character.feet.x, character.feet.z)) &&
        !askRespawn()
      ) {
        const at = spawnFeetNow();
        character.teleport(at);
        terrainColliders.update(at.x, at.z);
        respawnUnanswered = 0;
        swimMotion = createSwimMotion();
        groundSpeed.reset();
      }
    }

    items.updateLoose();
    items.update(dt);
    // While riding, the world around the item is what matters (colliders, ground, sound, scatter).
    const livePose = riding ? items.livePose(riding.instanceId) : null;
    const feet = livePose ?? character.feet;
    // Speed over the ground (the Speed display): the steered item's own, else measured.
    if (riding?.controller) groundSpeed.set(riding.controller.speed);
    else groundSpeed.sample(feet.x, feet.z, dt);
    // Footsteps: the soil under the feet, a road or floor when above the ground, water when swimming.
    const onStructure = feet.y - groundHeight(feet.x, feet.z) > 0.08;
    // Speakers' mouths follow their lines (lip sync, P2-44).
    for (const [id, speech] of speeches) {
      const speaker = id === 'self' ? avatar : remotePlayers.avatarOf(id);
      const now = speech.now();
      if (!speaker || !speech.mouth.speaking(now)) {
        speaker?.setMouth('X'); speech.onMouth?.('X');
        speeches.delete(id);
        continue;
      }
      const shape = speech.mouth.shapeAt(now); speaker.setMouth(shape); speech.onMouth?.(shape);
    }
    avatar.updateExpression(dt);
    for (const id of remotePlayers.ids()) remotePlayers.avatarOf(id)?.updateExpression(dt);

    audio.update(
      dt,
      moved,
      character.grounded && !sitting && !riding,
      swimming ? 'water' : onStructure ? 'hard' : soilAt(feet.x, feet.z),
    );
    terrainColliders.update(feet.x, feet.z);
    if (!activeSurface) groundView.update(feet.x, feet.z);
    const profileGrassStart = profileFrames ? performance.now() : 0;
    if (grass.group.visible) grass.update(camera.position.x, camera.position.z);
    const profileGrassMs = profileFrames ? performance.now() - profileGrassStart : 0;
    if (riding && livePose) {
      // On the item at the rider's seat (spec 7), facing where it goes.
      seatInWorld(livePose, riding.seatLocal, riderAt);
      avatar.root.position.set(
        riderAt.x,
        riderAt.y - (riding.ride.pose === 'sit' ? RIDER.sitDrop : 0),
        riderAt.z,
      );
      avatar.root.rotation.y = livePose.yaw;
    } else if (sitting?.kind === 'seat') {
      avatar.root.position.set(sitting.x, sitting.y, sitting.z);
      avatar.root.rotation.y = sitting.yaw;
    } else {
      avatar.root.position.set(feet.x, feet.y, feet.z);
    }
    const p = avatar.root.position;

    // Animation follows the movement: idle, walk, run, jump, swim, sit.
    const pose = locomotionClip({
      grounded: character.grounded,
      swimming,
      sitting: sitting?.kind ?? null,
      climbing: climbSpeed,
      speed: moved / dt,
      walkSpeed: WALK_SPEED,
      runSpeed: RUN_SPEED,
    });
    if (emote && (swimming || riding)) emote = null;
    if (emote?.left != null) {
      emote.left -= dt;
      if (emote.left <= 0) emote = null;
    }
    // Riders sit, or stand for items set to `stand` (spec 7).
    const riderClip = riding ? (riding.ride.pose === 'sit' ? 'Sit' : 'Idle') : null;
    sceneAnimation.update(dt);
    animator.play(sceneAnimation.resolve(emote ? emote.clip : pose.clip, riderClip));
    animator.speed = riderClip || sceneAnimation.active || emote ? 1 : pose.speed;
    animator.update(dt);
    avatar.updateSprings(dt);
    heldTool.holdIn(avatar.rightHand);
    if (hands) {
      const on = handsOn() && !riding;
      if (on !== hands.active) hands.setActive(on);
      if (on) hands.holdIn(avatar.rightHand);
      const held = on ? BLOCKS.indexOf(hands.block) : 0;
      if (held !== heldSent) {
        heldSent = held;
        onHeldBlock?.(held);
      }
    }
    damageNumbers.update(dt);
    if (selfFlash > 0) {
      selfFlash = Math.max(0, selfFlash - dt);
      avatar.setFlash(selfFlash / HIT_FLASH_SECONDS);
    }
    // Knocked out in a game: fall and fade; stand up at once on respawn.
    if (knockedOut) {
      downTime = Math.min(DOWN_SECONDS, downTime + dt);
      avatar.setDown(downTime / DOWN_SECONDS);
    } else if (downTime > 0) {
      downTime = 0;
      avatar.setDown(0);
    }
    // A rider's held tool is hidden (spec 7).
    heldTool.setVisible(!knockedOut && !riding);
    // Lie forward in the water while swimming.
    const tilt = swimming ? SWIM_TILT : 0;
    if (avatar.down === 0) avatarPose.rotation.x += (tilt - avatarPose.rotation.x) * Math.min(1, dt * 6);

    if (side && lane !== null) {
      // Side view: the camera looks at the line from the front (+z), following the player.
      const distance = Math.min(
        SIDE_CAMERA.maxDistance,
        Math.max(SIDE_CAMERA.minDistance, orbit.distance + 5),
      );
      lookTarget.set(p.x, p.y + 1.2, lane);
      camera.position.set(p.x, p.y + 1.2 + SIDE_CAMERA.height, lane + distance);
      camera.lookAt(lookTarget);
      avatar.root.visible = true;
    } else {
      // Third-person follow camera; moves in front of walls and terrain between it and the player.
      // Riding: a chase camera behind the item (spec 8) that eases back 1.5 s after looking around.
      if (riding && livePose) {
        orbit.yaw = chaseCameraYaw(orbit.yaw, livePose.yaw + Math.PI, dt, lookIdle);
        const k = 1 - Math.exp(-CHASE_CAMERA.rate * dt);
        if (lookIdle >= CHASE_CAMERA.lookBack) orbit.pitch += (CHASE_CAMERA.pitch - orbit.pitch) * k;
        const lookY = riderAt.y + CHASE_CAMERA.lookHeight;
        chaseY = chaseY === null ? lookY : chaseY + (lookY - chaseY) * k;
        lookTarget.set(riderAt.x, chaseY, riderAt.z);
      } else lookTarget.set(p.x, p.y + 1.5, p.z);
      cameraDirection.set(
        Math.sin(orbit.yaw) * Math.cos(orbit.pitch),
        Math.sin(orbit.pitch),
        Math.cos(orbit.yaw) * Math.cos(orbit.pitch),
      );
      const clear = physics.sweepSphere(
        lookTarget,
        cameraDirection,
        riding ? riding.ride.camera : orbit.distance,
        FOLLOW_CAMERA.probeRadius,
        character,
        // The camera ignores the ridden item's own box.
        riding ? (riding.controller ?? items.liveCollider(riding.instanceId)) : null,
      );
      // The scattered woods have no physics body: their trunks stop the camera here (it started
      // inside a trunk next to a spawn point, play-test 2026-10-02).
      let open = clear;
      for (const box of items.scatteredBoxesNear(lookTarget.x, lookTarget.z, open + 2))
        open = rayBoxDistance(lookTarget, cameraDirection, box, open, FOLLOW_CAMERA.probeRadius);
      cameraDistance = nextCameraDistance(cameraDistance, open - FOLLOW_CAMERA.margin, dt);
      camera.position.copy(lookTarget).addScaledVector(cameraDirection, cameraDistance);
      camera.lookAt(lookTarget);
      // Very close up (camera squeezed by a wall), hide the avatar so it does not fill the screen.
      avatar.root.visible = cameraDistance >= FOLLOW_CAMERA.hideAvatarBelow;
    }

    if (fixedCamera) {
      const [cx, ch, cz] = fixedCamera.cam;
      const [lx, lh, lz] = fixedCamera.look;
      if (!fixedCamera.placed) {
        fixedCamera.placed = true;
        character.teleport({ x: cx, y: groundHeight(cx, cz) + 0.05, z: cz });
        swimMotion = createSwimMotion();
      }
      avatar.root.visible = false;
      const seaCamera = urlFlags?.get('camSpace') === 'sea';
      const seaOffset = state.doc.environment.sea?.level ?? 0;
      if (seaCamera && (camera.fov !== 62 || camera.far !== 60000)) {
        camera.fov = 62;
        camera.far = 60000;
        camera.updateProjectionMatrix();
      }
      camera.position.set(cx, (seaCamera ? seaOffset : groundHeight(cx, cz)) + ch, cz);
      lookTarget.set(lx, (seaCamera ? seaOffset : groundHeight(lx, lz)) + lh, lz);
      camera.lookAt(lookTarget);
    }
    const filmFrame = onFilmFrame?.(camera, dt, feet);
    if (typeof filmFrame === 'object') { if (filmFrame.actorVisible) avatar.root.visible = true; if (filmFrame.cut) post.resetHistory(); }
    else if (filmFrame) post.resetHistory();
    if (viewOnly) {
      avatar.root.visible = false;
      const away = Math.hypot(camera.position.x - character.feet.x, camera.position.z - character.feet.z);
      if (away > 20) {
        const { x, z } = camera.position;
        character.teleport({ x, y: groundHeight(x, z) + 0.05, z });
      }
    }
    if(presentationBackdrop){avatar.root.visible=false;heldTool.setVisible(false);}
    nativeTerrain?.update(camera, state.doc.environment.sea?.level ?? 0);
    // Filming objects walking their spots (FILM-10b); a motion on the same object plays on top.
    const travelled = new Map<string, ScenePose>();
    for (const [id, travel] of sceneTravels) {
      if (
        steered.has(id) ||
        rideNow?.instanceId === id ||
        rideRows.has(id) ||
        remoteLean.has(id) ||
        rideSetup(id)
      ) {
        sceneTravels.delete(id);
        continue;
      }
      travelled.set(
        id,
        travelPose(
          travel.start,
          travel.spots,
          travel.speed,
          (performance.now() - travel.startedAt) / 1000,
          groundHeight,
          travel.lift,
        ),
      );
    }
    for (const [id, motion] of sceneMotions) {
      if (steered.has(id) || rideNow?.instanceId === id || rideRows.has(id) || remoteLean.has(id)) {
        sceneMotions.delete(id);
        continue;
      }
      const time = (performance.now() - motion.startedAt) / 1000;
      if (time >= motion.seconds || rideSetup(id)) {
        items.setLivePose(id, travelled.get(id) ?? null, false);
        sceneMotions.delete(id);
      } else items.setLivePose(id, scenePose(travelled.get(id) ?? motion.base, motion.motion, time), false);
    }
    for (const [id, pose] of travelled) if (!sceneMotions.has(id)) items.setLivePose(id, pose, false);
    // Keep the shadow area around the player.
    const profileEnvironment = profileFrames ? performance.now() : 0;
    environment.update(dt, p, time / 1000, camera.position, camera);
    nightLights.update(camera.position, environment.night);
    if (environment.skyPhase !== audioSky) {
      audioSky = environment.skyPhase;
      audio.setState(audioState());
    }
    sun.target.position.copy(p);
    sun.position.copy(p).add(sunOffset);
    if (webgpu && scene.userData.tidewaterEnvironment && !tidewaterLighting) {
      tidewaterLighting = new TidewaterLighting(
        renderer as WebGPURenderer,
        scene,
        sun,
        lightingTerrain,
        (slot) =>
          nativeProfile ? (SOILS[slot] ?? 'sand') : (getGround(groundPalette[slot] ?? '')?.kind ?? 'sand'),
      );
    }
    scene.userData.tidewaterLighting = tidewaterLighting;
    tidewaterWind?.update(dt);
    palmTime.value += dt;
    palmFrame.value++;
    palmSun.value.copy(sunOffset).normalize();
    palmNight.value = environment.lightingNight;
    items.updateProceduralLod(camera.position);
    tidewaterGround?.update(state.doc.environment.sea?.level ?? 0, dt);
    tidewaterLighting?.update(
      dt,
      camera,
      environment.realistic && skyQuality.worldLook === 'tidewater' && !!scene.userData.tidewaterEnvironment,
      state.doc.environment.sea?.level ?? -10000,
      environment.lightingNight,
    );
    lodTimer -= dt;
    if (lodTimer <= 0) {
      lodTimer = 0.25;
      items.updateLod(camera.position);
      items.updateDrawOffsets();
      // The rideable item in reach (the Ride button and E), a few times a second.
      const near = !rideNow && simulating && !side ? items.rideableNear(character.feet) : null;
      if (near?.instanceId !== inReach?.instanceId || near?.ride.model !== inReach?.model)
        inReach = near ? { instanceId: near.instanceId, model: near.ride.model } : null;
    }

    applyScatter(feet.x, feet.z);
    audio.setListener(camera.position, camera.getWorldDirection(listenerForward));
    // Under water (P2-39): the view and the sound follow the camera, not the player, so putting
    // the camera under the surface while the player swims on it is enough to be under.
    const surfaceHere = waterLevelAt(camera.position.x, camera.position.z);
    const under = surfaceHere !== null && camera.position.y < surfaceHere;
    submerged += ((under ? 1 : 0) - submerged) * Math.min(1, dt / post.fadeSeconds);
    post.setSubmerged(submerged);
    audio.setUnderwater(submerged > 0.5);
    sceneLighting.update(state.doc.environment.lighting ?? [], id => {
      if(id === 'self') return avatar.root.position;
      const live = remotePlayers.numberAnchor(id); if(live) return {x:live.x,y:live.y-1.5,z:live.z};
      const instance = state.doc.instances.find(row=>row.instanceId===id); return instance ? {x:instance.transform.position[0],y:instance.transform.position[1],z:instance.transform.position[2]} : null;
    });
    surf.update(dt, camera.position, Date.now() + serverOffset, water.surfShore(), water.surfGround());
    if (viewCube) {
      const show =
        viewCubeWanted &&
        // Phones (also sideways) and touch tablets have the simple layout: no compass there.
        window.innerWidth >= 768 &&
        window.innerHeight >= 500 &&
        !matchMedia('(pointer: coarse)').matches;
      if (viewCube.element.style.display !== (show ? '' : 'none')) viewCube.visible = show;
      if (show) viewCube.update(camera);
    }
    // The Tidewater sea (WebGPU High/Ultra): its FFT runs on the room's clock and its grid follows the camera.
    const profileWater = profileFrames ? performance.now() : 0;
    water.update(dt, camera, scene, sun, Date.now() + serverOffset);
    const profilePost = profileFrames ? performance.now() : 0;
    post.render(dt);
    if (
      profileFrames &&
      (profileGap > 50 || performance.now() - profileStart > 30 || profileStart - profileLog > 1500)
    ) {
      profileLog = profileStart;
      console.info(
        '[frame-profile]',
        JSON.stringify({
          gap: profileGap,
          simulationCamera: profileEnvironment - profileStart,
          grass: profileGrassMs,
          pipelines: profilePipelineCount,
          pipelineMs: profilePipelineMs,
          materials: [...profilePipelineNames],
          environment: profileWater - profileEnvironment,
          water: profilePost - profileWater,
          post: performance.now() - profilePost,
        }),
      );
      profilePipelineCount = 0;
      profilePipelineMs = 0;
      profilePipelineNames.clear();
    }
    onRendered?.();
  };
  let renderingPaused = false;
  renderer.setAnimationLoop(frame);

  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2';

  return {
    diagnostics: (options) =>
      inspectResources(
        {
          backend: webgpu ? 'WebGPU' : 'WebGL2',
          paused: renderingPaused,
          resources: [
            { id: 'ground', label: 'Ground', root: nativeTerrain?.group ?? groundView.group },
            { id: 'outer-ground', label: 'Outer ground', root: outerGround },
            { id: 'grass', label: 'Grass', root: grass.group },
            { id: 'water', label: 'Water', root: water.group },
            { id: 'rivers', label: 'Rivers', root: rivers.group },
            { id: 'items', label: 'Items', root: items.group },
            { id: 'avatar', label: 'Avatar', root: avatar.root },
            { id: 'players', label: 'Other players', root: remotePlayers.group },
            { id: 'structures', label: 'Structures', root: structures.group },
            { id: 'environment', label: 'Sky and weather', root: environment.group },
          ],
          // Stored optional names may be explicitly undefined; diagnostics treats them as absent.
          items: state.doc.instances,
        },
        options,
      ),
    backend,
    surf: {
      get log() {
        return surf.log;
      },
      get stations() {
        return surf.scheduler.stations.length;
      },
      get shoreReady() {
        return water.surfShore() !== null;
      },
    },
    applyCommand,
    get lastCommandError() {
      return lastCommandError;
    },
    undoMark: () => history.size,
    mergeUndoSince: (mark) => {
      history.mergeSince(mark);
    },
    applyBatch: (commands) => {
      beginEditGroup();
      let error: string | null = null;
      for (const command of commands) if (!applyCommand(command)) error ??= lastCommandError;
      error ??= endEditGroup();
      // Keep the first failure's reason for the caller.
      lastCommandError = error;
      return error === null;
    },
    undo: () => afterApply(history.undo(), 'undo'),
    redo: () => afterApply(history.redo(), 'redo'),
    get canUndo() {
      return history.canUndo;
    },
    get canRedo() {
      return history.canRedo;
    },
    terrainHeightAt: heightAt,
    blockGround: voxels !== null,
    blockRoadTypes: voxels ? Object.keys(VOXEL_ROAD_BLOCKS) : null,
    exportSelectedItems: async (ids) => {
      if (!editable || simulating) throw new Error('Stop Test before saving an item.');
      const selected = ids.map((id) => state.doc.instances.find((i) => i.instanceId === id));
      if (selected.some((i) => !i)) throw new Error('The selection changed. Select the item again.');
      return exportBuilderSelection(selected as ItemInstance[], (i) => items.model(i.itemId, i.params));
    },
    setTool: (tool) => tools?.setTool(tool),
    checkWorld,
    itemRules: (instanceId) => {
      const instance = state.doc.instances.find((i) => i.instanceId === instanceId);
      return instance ? ruleReport(state.doc, worldEnv(), instance) : null;
    },
    canStand: (itemId, position, yaw = 0) => {
      const report = ruleReport(state.doc, worldEnv(), {
        instanceId: '__planned__',
        itemId,
        transform: { position, rotation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], scale: [1, 1, 1] },
        params: {},
      });
      return report?.find((rule) => !rule.ok)?.message ?? null;
    },
    settleItems: (instanceIds) => {
      if (!editable) return 0;
      const wanted = new Set(instanceIds);
      const settling = state.doc.instances.filter(
        (instance) =>
          wanted.has(instance.instanceId) &&
          !(instance.floats ?? itemShape(instance.itemId)?.floats ?? false),
      );
      // Ground under each item, also far from the player (the next frame drops the extra chunks).
      for (const instance of settling)
        terrainColliders.include(instance.transform.position[0], instance.transform.position[2]);
      const before = new Map(settling.map((instance) => [instance.instanceId, instance.transform]));
      const commands: CommandPayload[] = [];
      for (const rest of items.settle(
        state.doc,
        settling.map((instance) => instance.instanceId),
      )) {
        const old = before.get(rest.instanceId)!;
        const [x, y, z] = rest.position;
        // Fell through the ground (no collider there): leave it where it was.
        if (y < heightAt(x, z) - 1) continue;
        const moved = rest.position.some((value, i) => Math.abs(value - old.position[i]!) > 0.01);
        const turned = rest.rotation.some((value, i) => Math.abs(value - (old.rotation[i] ?? 0)) > 0.001);
        if (!moved && !turned) continue;
        commands.push({
          type: 'transform_item',
          params: { instanceId: rest.instanceId, position: rest.position, rotation: rest.rotation },
        });
      }
      if (commands.length === 0) return 0;
      beginEditGroup();
      for (const command of commands) applyCommand(command);
      endEditGroup();
      return commands.length;
    },
    markItems: (instanceIds, areas = []) => {
      const wanted = new Set(instanceIds);
      const boxes: Array<{ min: readonly number[]; max: readonly number[] }> = [...areas];
      for (const instance of state.doc.instances) {
        if (!wanted.has(instance.instanceId)) continue;
        const shape = itemShape(instance.itemId);
        if (shape) boxes.push(worldBox(instance, shape));
      }
      markers.show(boxes);
    },
    // Only a hint (ground, room floor, or the top of stacked parts with headroom): a command that
    // asks for `rest` gets its real y from the law.
    restingPoint: (x, z, on) =>
      restingPoint(state.doc, { groundAt: heightAt, itemShape, floors: roomFloors() }, x, z, on),
    itemName: (itemId) => getCoreItem(itemId)?.manifest.name ?? packages?.get(itemId)?.manifest.name ?? null,
    previewSelectedItems: async (ids) => {
      const selected = ids.map((id) => state.doc.instances.find((i) => i.instanceId === id));
      if (selected.some((i) => !i)) throw new Error('The selection changed.');
      const assembly = builderAssembly(selected as ItemInstance[], (i) => items.model(i.itemId, i.params));
      try {
        return await previews.selection(assembly.root);
      } finally {
        assembly.dispose();
      }
    },
    preview: (kind, id) => (kind === 'item' ? previews.item(id) : previews.road(id)),
    setRoadType: (typeId) => tools?.setRoadType(typeId),
    setRiver: (settings) => tools?.setRiver(settings),
    setRoad: (settings) => tools?.setRoad(settings),
    setBrush: (settings) => tools?.setBrush(settings),
    setBlockTool: (settings) => tools?.setBlockTool(settings),
    setPlaceItem: (itemId) => tools?.setPlaceItem(itemId),
    rotateItem: () => tools?.rotateItem(),
    setSnap: (settings) => tools?.setSnap(settings),
    moveItem: () => tools?.moveItem(),
    duplicateItem: () => tools?.duplicateItem(),
    rowItems: (count) => tools?.rowItems(count),
    deleteItem: () => tools?.deleteItem(),
    selectItems: (ids) => tools?.selectItems(ids),
    addWater: (x, z) => tools?.addWater(x, z) ?? 'Building is off here.',
    finishDrawing: () => tools?.finish() ?? false,
    cancelDrawing: () => tools?.cancel(),
    removeLastPoint: () => tools?.removeLastPoint(),
    get world() {
      return state.doc;
    },
    snapshot: () => ({ world: structuredClone(state.doc), terrainChunks: encodeTerrain(state).map((row) => row.data).filter(Boolean) }),
    get playerPosition() {
      // While riding, where the item is.
      const pose = rideNow ? items.livePose(rideNow.instanceId) : null;
      return pose ? { x: pose.x, y: pose.y, z: pose.z } : character.feet;
    },
    get avatarClip() {
      return animator.currentClip;
    },
    get playView() {
      return playView;
    },
    get sideMoves() {
      return sideMoves;
    },
    get avatarState() {return {body:avatar.body,visible:avatar.root.visible,mouth:avatar.mouth,position:{x:avatar.root.position.x,y:avatar.root.position.y,z:avatar.root.position.z},headTop:avatar.headTop};},
    get localPlayer() {
      // Seat 1's moves carry the item's pose (spec 5.2); the room ignores passengers' moves.
      const pose = rideNow ? items.livePose(rideNow.instanceId) : null;
      if (rideNow && pose)
        return {
          x: pose.x,
          y: pose.y,
          z: pose.z,
          yaw: pose.yaw,
          clip: rideNow.ride.pose === 'sit' ? 'Sit' : 'Idle',
        };
      const at = avatar.root.position;
      return { x: at.x, y: at.y, z: at.z, yaw: avatar.root.rotation.y, clip: animator.currentClip ?? 'Idle' };
    },
    setCollaborative: (on) => {
      collaborative = on;
      if (!on) replica.clear();
    },
    applyRemoteCommand: (command) => {
      // Where a moved or removed item stood, read before the command changes it.
      const before = preImage(state.doc, command);
      const result = replica.applyRemote(command);
      restSurfaces = null;
      regrowScatter([{ applied: command, result: { inverse: before } }]);
      refresh(result.changedChunks);
      return { dropped: result.dropped, resync: result.resync };
    },
    confirmCommand: (id) => replica.confirm(id),
    pendingCommands: () => replica.pending.map(({ id, command }) => ({ id, command })),
    rejectCommand: (id) => {
      const result = replica.reject(id);
      restSurfaces = null;
      refresh(result.changedChunks);
      return { dropped: result.dropped, resync: result.resync };
    },
    upsertRemotePlayer: (id, state) => {
      // Other swimmers leave rings too, worked out on this device from the position it was sent.
      if (state.clip === 'Swim') wake.follow(id, state.x, state.z, SWIM.speed, wakeClock);
      else wake.forget(id);
      remotePlayers.upsert(id, state);
    },
    removeRemotePlayer: (id) => {
      wake.forget(id);
      remotePlayers.remove(id);
    },
    remotePlayerIds: () => remotePlayers.ids(),
    toggleSit,
    async importAvatarMotion(target, id, data) {
      if (!/^motion:[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid motion ID.');
      const actor = target === 'self' ? avatar : remotePlayers.avatarOf(target);
      if (!actor) return false;
      const clip = await retargetAvatarMotion(data, actor, id);
      if (target === 'self') { animator.register(clip); return true; }
      if (remotePlayers.avatarOf(target) !== actor) return false;
      return remotePlayers.registerPresentation(target, clip);
    },
    presentAnimation(target, id) {
      if (target === 'self') { if (id === 'idle') { emote = null; return true; }
        if (id.startsWith('motion:') && (animator.clipNames.includes(id) || !!avatarMotionEntry(id))) { emote = { clip: id, left: null }; return true; }
        return playAnimation(id); }
      const animation = findAnimation(id);
      return remotePlayers.playPresentation(target, id === 'idle' ? 'Idle' : id.startsWith('motion:') ? id : animation?.clip ?? '');
    },
    supportsAvatarExpression(target) { return Boolean((target === 'self' ? avatar : remotePlayers.avatarOf(target))?.expressionSupported); },
    presentExpression(target, expression) {
      const actor = target === 'self' ? avatar : remotePlayers.avatarOf(target);
      if (!actor || (expression !== 'neutral' && !actor.expressionSupported)) return false; actor.setExpression(expression); return true;
    },
    playAnimation,
    sceneMotion: (id, motion, seconds) => {
      if (
        !['dance', 'bob', 'spin', 'sway'].includes(motion) ||
        !Number.isFinite(seconds) ||
        seconds <= 0 ||
        seconds > 30
      )
        return false;
      const instance = state.doc.instances.find((i) => i.instanceId === id);
      if (
        !instance ||
        instance.anchored === false ||
        rideSetup(id) ||
        rideRows.has(id) ||
        steered.has(id) ||
        remoteLean.has(id) ||
        (getCoreItem(instance.itemId)?.manifest.physics?.collider ??
          packages?.get(instance.itemId)?.manifest.physics?.collider) !== 'none'
      )
        return false;
      const rotation = new Euler().setFromQuaternion(
        new Quaternion().fromArray(instance.transform.rotation),
        'YXZ',
      );
      const [x, y, z] = instance.transform.position;
      const base = sceneMotions.get(id)?.base ?? {
        x,
        y,
        z,
        yaw: rotation.y,
        pitch: rotation.x,
        roll: rotation.z,
      };
      sceneMotions.set(id, { base, motion, startedAt: performance.now(), seconds });
      return true;
    },
    sceneTravel: (id, from, to, run = false) => {
      if (
        !to.length ||
        to.length > 8 ||
        ![...(from ? [from] : []), ...to].every((p) => Number.isFinite(p.x) && Number.isFinite(p.z))
      )
        return false;
      const instance = state.doc.instances.find((i) => i.instanceId === id);
      if (
        !instance ||
        instance.anchored === false ||
        rideSetup(id) ||
        rideRows.has(id) ||
        steered.has(id) ||
        remoteLean.has(id) ||
        (getCoreItem(instance.itemId)?.manifest.physics?.collider ??
          packages?.get(instance.itemId)?.manifest.physics?.collider) !== 'none'
      )
        return false;
      const rotation = new Euler().setFromQuaternion(
        new Quaternion().fromArray(instance.transform.rotation),
        'YXZ',
      );
      const [x, y, z] = instance.transform.position;
      const lift = y - groundHeight(x, z);
      const sx = from?.x ?? x,
        sz = from?.z ?? z;
      sceneTravels.set(id, {
        start: {
          x: sx,
          y: groundHeight(sx, sz) + lift,
          z: sz,
          yaw: rotation.y,
          pitch: rotation.x,
          roll: rotation.z,
        },
        spots: to.map((p) => ({ x: p.x, z: p.z })),
        speed: run ? RUN_SPEED : WALK_SPEED,
        lift,
        startedAt: performance.now(),
      });
      return true;
    },
    sceneActorIds: () =>
      state.doc.instances
        .filter(
          (instance) =>
            instance.anchored !== false &&
            !rideSetup(instance.instanceId) &&
            (getCoreItem(instance.itemId)?.manifest.physics?.collider ??
              packages?.get(instance.itemId)?.manifest.physics?.collider) === 'none',
        )
        .map((i) => i.instanceId),
    clearSceneMotions,
    prepareSceneAnimation: id => animator.prepare(findAnimation(id)?.clip ?? id),
    playSceneAnimation: (id) => {
      if (id.startsWith('motion:') && (avatarMotionEntry(id) || animator.clipNames.includes(id))) { sceneAnimation.start(id, null); animator.play(id); return true; }
      const animation = findAnimation(id);
      if (!animation || !animator.clipNames.includes(animation.clip)) return false;
      sceneAnimation.start(
        animation.clip,
        animation.kind === 'once' ? animator.duration(animation.clip) : null,
      );
      return true;
    },
    stopSceneAnimation: () => {
      sceneAnimation.stop();
    },
    sceneWalk: (to, run = false) => {
      sceneWalkTo = to ? { x: to.x, z: to.z, run } : null;
    },
    groundAt: (clientX, clientY) => tools?.groundAt(clientX, clientY) ?? null,
    respawn: () => {
      // A rider gets off through the room first.
      if (rideNow) return;
      sitting = null;
      emote = null;
      if (askRespawn()) return;
      respawnUnanswered = 0;
      const at = spawnFeetNow();
      character.teleport(at);
      swimMotion = createSwimMotion();
      groundSpeed.reset();
      terrainColliders.update(at.x, at.z);
    },
    setControlsEnabled: (on) => {
      controlsEnabled = on;
    },
    setSimulating: (on) => {
      const enteringTest = on && !simulating && editable;
      simulating = on || !editable;
      items.setSimulating(on, state.doc);
      items.setMarkersVisible(!simulating, state.doc);
      viewCubeWanted = !on;
      // Building can place a solid item over the player while Studio is open.
      // Resolve that overlap when Test starts, just as we do when joining/respawning.
      if (enteringTest && !rideNow) {
        const feet = character.feet;
        const spot = standsInItem(feet.x, feet.z, feet.y)
          ? freeSpawnPoint(state.doc, feet.x, feet.z, standsInItem)
          : { x: feet.x, z: feet.z, moved: false };
        if (spot.moved) {
          character.teleport({ x: spot.x, y: groundHeight(spot.x, spot.z) + 0.05, z: spot.z });
          terrainColliders.update(spot.x, spot.z);
          sitting = null;
          emote = null;
          swimMotion = createSwimMotion();
          groundSpeed.reset();
        }
      }
    },
    setMarkersVisible: (on) => items.setMarkersVisible(on, state.doc),
    setHeldTool: (itemId) => heldTool.set(itemId),
    strike: () => {
      const strike = strikeEmote(animator.clipNames, (clip) => animator.duration(clip));
      audio.gameSound('strike', avatar.root.position);
      if (!strike) return false;
      sitting = null;
      emote = strike;
      return true;
    },
    showStrike: (id) => {
      remotePlayers.strike(id);
    },
    setKnockedOut: (on) => {
      knockedOut = on;
    },
    meleeTarget: (reach, arcDeg) => {
      const at = avatar.root.position;
      return remotePlayers.inReach({ x: at.x, z: at.z, yaw: avatar.root.rotation.y }, reach, arcDeg);
    },
    say: async (id, line, onMouth) => {
      const speaker = id === 'self' ? avatar : remotePlayers.avatarOf(id);
      if (!speaker) return false;
      const at = speaker.root.position;
      return audio
        .playVoice(line.url, { x: at.x, y: at.y + speaker.headTop - 0.2, z: at.z })
        .then((started) => {
          if (!started) return false;
          const mouth = new SpeechMouth();
          mouth.speak(
            line.voice,
            started.startedAt,
            line.voice.cues.length > 0 ? undefined : started.analyser,
          );
          speeches.get(id)?.mouth.stop();
          speeches.set(id, { mouth, now: started.now, ...(onMouth ? {onMouth} : {}) });
          return true;
        });
    },
    showHit: (id, damage) => {
      let anchor: { x: number; y: number; z: number } | null;
      if (id === 'self') {
        selfFlash = HIT_FLASH_SECONDS;
        avatar.setFlash(1);
        const at = avatar.root.position;
        anchor = { x: at.x, y: at.y + avatar.headTop + NUMBER_ABOVE_HEAD, z: at.z };
      } else {
        remotePlayers.flash(id);
        anchor = remotePlayers.numberAnchor(id);
      }
      if (!anchor) return;
      damageNumbers.show(anchor, damage);
      audio.gameSound('hit', { x: anchor.x, y: anchor.y - 1.5, z: anchor.z });
    },
    setViewSettings: ({ cameraSensitivity, invertCamera, showNames }) => {
      view.sensitivity = Math.min(3, Math.max(0.25, cameraSensitivity));
      view.invert = invertCamera;
      remotePlayers.showNames = showNames;
    },
    setGraphics: ({ quality, fpsCap }) => {
      const device = window.devicePixelRatio || 1;
      // Automatic keeps the sharp default; 1 is half density without shadows, 10 is full density.
      const ratio = quality === 0 ? Math.min(device, 2) : Math.min(device, 2) * (0.5 + (quality - 1) / 18);
      renderer.setPixelRatio(Math.max(0.5, ratio));
      renderer.setSize(container.clientWidth, container.clientHeight);
      const shadows = quality === 0 || quality >= 4;
      // The realistic sky and light follow the same setting (P2-36), and so does the water (P2-39).
      skyQuality = realisticQuality({ quality, touchDevice, webgpu });
      if (worldFlag === 'genvr') skyQuality = { ...skyQuality, worldLook: 'genvr' };
      environment.setRealisticQuality(skyQuality);
      applyGround();
      applyGrass();
      applyWaterQuality();
      applyShadows();
      if (renderer.shadowMap.enabled !== shadows) {
        renderer.shadowMap.enabled = shadows;
        sun.castShadow = shadows;
      }
      minFrameMs = fpsCap > 0 ? 1000 / fpsCap : 0;
    },
    capture: (maxWidth = 1920) => {
      canopyLoading.assertCaptureReady();
      const hidden: Object3D[] = [];
      scene.traverse((object) => {
        if (object.userData.helper && object.visible) hidden.push(object);
      });
      for (const object of hidden) object.visible = false;
      try {
        // Read the canvas in the same task as the render, while its picture is still there.
        // Materials can require the live MRT attachments (sea/velocity/depth). Capture
        // through the same pipeline and discard history containing editor helpers.
        post.resetHistory();
        post.render(0);
        const scale = Math.min(1, maxWidth / canvas.width);
        const out = document.createElement('canvas');
        out.width = Math.round(canvas.width * scale);
        out.height = Math.round(canvas.height * scale);
        out.getContext('2d')?.drawImage(canvas, 0, 0, out.width, out.height);
        let url = out.toDataURL('image/webp', 0.88);
        if (!url.startsWith('data:image/webp')) url = out.toDataURL('image/jpeg', 0.88);
        return url.slice(url.indexOf(',') + 1);
      } finally {
        for (const object of hidden) object.visible = true;
        post.resetHistory();
      }
    },
    setSpeechMouth: (id, shape) => { const speaker=id==='self'?avatar:remotePlayers.avatarOf(id); if(!speaker)return false; speaker.setMouth(shape);return true; },
    setVoiceRecordingStream: stream => audio.setVoiceRecordingStream(stream),
    setAudioVolumes: (volumes) => audio.setVolumes(volumes),
    setPresentationBackdrop: (on, navigation=false) => {presentationBackdrop=on;presentationNavigation=navigation;},
    setAvatarLook: (look) => {
      // Another body type brings another skeleton: the animator binds to its clips.
      if (avatar.setLook(look)) animator.rebind(avatar.mesh, avatar.clips);
    },
    setPaused: (paused) => {
      renderingPaused = paused;
      renderer.setAnimationLoop(paused ? null : frame);
      audio.setPaused(paused);
    },
    isPaused: () => renderingPaused,
    worldSoundStream: () => audio.recordingStream(),
    stats: () => {
      const render = (renderer.info as { render?: { drawCalls?: number; triangles?: number } }).render;
      let objects = 0;
      scene.traverse(() => {
        objects += 1;
      });
      return {
        fps: Math.round(fps),
        drawCalls: render?.drawCalls ?? 0,
        triangles: render?.triangles ?? 0,
        objects,
      };
    },
    setRespawnRequest: (ask) => {
      respawnRequest = ask;
    },
    jump: () => {
      jumpQueued = true;
    },
    dash: () => {
      dashQueued = true;
    },
    teleportPlayer: (position, options) => {
      respawnUnanswered = 0;
      let { x, y, z } = position;
      if (options?.free) {
        const spot = freeSpawnPoint(state.doc, x, z, standsInItem);
        if (spot.moved) ({ x, z, y } = { x: spot.x, z: spot.z, y: undefined });
      }
      // The room moved the player: off any item first.
      if (rideNow) endRideHere({ x, y: y ?? groundHeight(x, z) + 0.05, z });
      sitting = null;
      emote = null;
      character.teleport({ x, y: y ?? groundHeight(x, z) + 0.05, z });
      swimMotion = createSwimMotion();
      // A room move (spawn, respawn, a rule) is no speed on the Speed display.
      groundSpeed.reset();
      terrainColliders.update(x, z);
    },
    startRide: startRideHere,
    endRide: endRideHere,
    rideCorrection: (pose) => {
      rideNow?.controller?.teleport(pose);
    },
    get riding() {
      return rideNow
        ? { instanceId: rideNow.instanceId, seat: rideNow.seat, model: rideNow.ride.model }
        : null;
    },
    applyRidePoses,
    rideableInReach: () => (rideNow || !simulating ? null : inReach),
    setServerOffset: (ms) => {
      serverOffset = Number.isFinite(ms) ? ms : 0;
    },
    setSpeedFactor: (factor, until = 0) => {
      speedRule.factor = Math.max(0.1, Math.min(3, factor));
      speedRule.until = speedRule.factor === 1 ? 0 : until;
    },
    get speed() {
      return groundSpeed.value;
    },
    setRideButtons: (buttons) => touch.setButtons(buttons),
    get divingAvailable() {
      return currentStyle === 'realistic' && swimming && !sideView() && !rideNow;
    },
    hasBlocks: Boolean(voxels),
    setHands: ({ allowed, block, mode }) => {
      if (allowed !== undefined) handsAllowed = allowed;
      if (block) hands?.setBlock(block);
      if (mode) handsMode = mode;
    },
    applyPlayerBlocks: (blocks) => {
      if (!voxels) return;
      voxels.setPlayerBlocks(blocks, '');
      refreshBlocks();
    },
    loadPlayerBlocks: (chunks) => {
      if (!voxels) return;
      voxels.clearPlayerBlocks();
      for (const chunk of chunks) voxels.loadPlayerBlocks(chunk);
      voxels.takePlayerDirty();
      refreshBlocks();
    },
    dispose() {
      const canopySettled = canopyLoading.close();
      rideNow?.controller?.dispose();
      rideNow = null;
      heldTool.dispose();
      hands?.dispose();
      canvas.removeEventListener('pointerdown', onHandsDown);
      canvas.removeEventListener('pointerup', onHandsUp);
      canvas.removeEventListener('pointermove', onHandsHover);
      canvas.removeEventListener('contextmenu', onHandsMenu);
      renderer.setAnimationLoop(null);
      window.removeEventListener('keydown', onSitKey);
      animator.dispose();
      avatar.dispose();
      remotePlayers.dispose();
      tools?.dispose();
      canvas.removeEventListener('pointerdown', onPressStart);
      canvas.removeEventListener('pointerup', onPressEnd);
      canvas.removeEventListener('pointermove', onHover);
      window.removeEventListener('keydown', onToolKey);
      structures.dispose();
      markers.dispose();
      items.dispose();
      nightLights.dispose();
      palmBindings?.dispose();
      viewCube?.dispose();
      packages?.dispose();
      previews.dispose();
      water.dispose();
      environment.dispose();
      sceneLighting.dispose();
      tidewaterLighting?.dispose();
      tidewaterGround?.dispose();
      sunShadows.dispose();
      post.dispose();
      audio.dispose();
      damageNumbers.dispose();
      terrainView.dispose();
      nativeTerrain?.dispose();
      disposeSourceWind();
      nativeSampler?.dispose();
      groundTextures.dispose();
      grass.dispose();
      groundMaterial?.dispose();
      voxelView?.dispose();
      physics.dispose();
      resize.disconnect();
      for (const source of sources) source.dispose();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      texture.dispose();
      scene.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) material.dispose();
        }
      });
      void canopySettled.then(() => renderer.dispose());
      canvas.remove();
    },
  };
}

/** `?cam=x,h,z&look=x,h,z` (Tidewater world shots): null unless both are six finite numbers. */
export function parseFixedCamera(
  cam: string | null,
  look: string | null,
): { cam: [number, number, number]; look: [number, number, number]; placed: boolean } | null {
  const three = (text: string | null) => {
    const values = (text ?? '').split(',').map(Number);
    return values.length === 3 && values.every(Number.isFinite) ? (values as [number, number, number]) : null;
  };
  const at = three(cam);
  const to = three(look);
  return at && to ? { cam: at, look: to, placed: false } : null;
}
