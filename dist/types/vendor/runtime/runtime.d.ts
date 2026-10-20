import type { AvatarExpression } from './avatar-expression.js';
import { type PlaceBlockLook, type RideModel, type CommandPayload, type SideMove, type VoiceLine, type WorldDocument } from '../contracts/index.js';
import { PerspectiveCamera } from 'three/webgpu';
import { type AvatarLook } from './avatar.js';
import { type BuildTool, type RiverToolSettings, type RoadToolSettings, type WallToolSettings, type ToolStatus } from './build-tools.js';
import type { SnapSettings } from './item-tools.js';
import { type Pose4 } from './ride.js';
import { type PackageFetcher } from './item-packages.js';
import { type RuleResult, type WorldFinding, type WorldReport } from '../validator/index.js';
import { type RemotePlayerState } from './remote-players.js';
import type { BrushSettings } from './terrain-tools.js';
import type { BlockToolSettings } from './block-tools.js';
import { type HandsMode } from './player-hands.js';
import { type SurfLogEntry } from './ocean/surf-audio.js';
import { type SceneMotion } from './scene-director.js';
import { type BlockName } from '../world/index.js';
import { type TerrainFieldPageLoader } from './terrain-field-loader.js';
import { type DiagnosticOptions, type RuntimeDiagnostics } from './diagnostics.js';
export interface RuntimeOptions {
    /** Optional filming rig, after gameplay camera and before environment/LOD/water update.
     * Return true on a camera cut to discard temporal rendering history. A structured result also declares
     * actor visibility while the filming camera replaces the gameplay camera. */
    onFilmFrame?: (camera: PerspectiveCamera, dt: number, player: {
        x: number;
        y: number;
        z: number;
    }) => boolean | {
        cut: boolean;
        actorVisible: boolean;
    } | void;
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
export declare const SIDE_CAMERA: {
    readonly distance: 14;
    readonly height: 2.5;
    readonly minDistance: 8;
    readonly maxDistance: 26;
};
export interface GenvrRuntime {
    /** Detached local save, including heightfield, voxel edits and loaded raster field pages. */
    snapshot(): {
        world: WorldDocument;
        terrainChunks: string[];
    };
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
    /** Height and look of new walls, and the size of new doors and windows (BUILD-B6). */
    setWall(settings: Partial<WallToolSettings>): void;
    /** Changes the terrain brush (mode, size, paint soil). */
    setBrush(settings: Partial<BrushSettings>): void;
    /** Digging and stacking on block ground (Stack or Dig, which block); switches to the Blocks tool. */
    setBlockTool(settings: Partial<BlockToolSettings>): void;
    /** Chooses an item from the library (switches to the place tool). */
    setPlaceItem(itemId: string): void;
    /** Which handles a selected item shows (ITEMS-I2): all, or only move, size or turn. */
    setHandleMode(mode: 'all' | 'move' | 'size' | 'turn'): void;
    /** Turn (degrees), size, colour and material of the next placed items (ITEMS-I1); null clears one. */
    setPlaceOptions(options: {
        size?: number | null;
        color?: string | null;
        material?: string | null;
        turn?: number;
    }): void;
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
    readonly playerPosition: {
        x: number;
        y: number;
        z: number;
    };
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
    readonly avatarState: {
        body: string;
        visible: boolean;
        mouth: import('../contracts/index.js').MouthShape;
        position: {
            x: number;
            y: number;
            z: number;
        };
        headTop: number;
    };
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
    sceneWalk(to: {
        x: number;
        z: number;
    } | null, run?: boolean): void;
    /** Filming (FILM-10): the ground spot under a screen point (page pixels); null off the ground or outside the editor. */
    groundAt(clientX: number, clientY: number): {
        x: number;
        z: number;
    } | null;
    /**
     * Filming (FILM-10b): moves a scene object (the same objects as `sceneMotion`) from `from` (or where it stands)
     * along up to 8 ground spots at walking or running pace; it stays on the last spot until `clearSceneMotions`.
     * A `sceneMotion` on the same object plays on top of the walk.
     */
    sceneTravel(instanceId: string, from: {
        x: number;
        z: number;
    } | null, to: ReadonlyArray<{
        x: number;
        z: number;
    }>, run?: boolean): boolean;
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
    say(id: string | 'self', line: {
        url: string;
        voice: Pick<VoiceLine, 'duration' | 'cues'>;
    }, onMouth?: (shape: import('../contracts/index.js').MouthShape) => void): Promise<boolean>;
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
    setViewSettings(settings: {
        cameraSensitivity: number;
        invertCamera: boolean;
        showNames: boolean;
    }): void;
    /**
     * Graphics (P3-21): quality 0 = automatic, 1 (fastest) to 10 (sharpest) sets the pixel density
     * and shadows; fpsCap limits frames per second (0 = no limit).
     */
    setGraphics(settings: {
        quality: number;
        fpsCap: number;
    }): void;
    /**
     * A picture of the current view without build helpers (selection, handles, drawing guides),
     * as base64 WebP (JPEG where WebP is missing), at most `maxWidth` pixels wide. For place
     * thumbnails and screenshots.
     */
    capture(maxWidth?: number): string;
    /** Loudness (0-1) of footsteps and other effects, and of the weather and nature ambience (P2-08). */
    setSpeechMouth(id: string, shape: import('../contracts/index.js').MouthShape): boolean;
    setVoiceRecordingStream(stream: MediaStream | null): void;
    setAudioVolumes(volumes: {
        effects: number;
        ambience: number;
    }): void;
    /** The loudness now set for effects and ambience. */
    audioVolumes(): {
        effects: number;
        ambience: number;
    };
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
    stats(): {
        fps: number;
        drawCalls: number;
        triangles: number;
        objects: number;
    };
    /** Jump once (on-screen button for touch screens). */
    jump(): void;
    /** Dash once (on-screen button in side-view places with the dash move, decision 95). */
    dash(): void;
    /** The local player's pose, sent to the realtime room. */
    readonly localPlayer: {
        x: number;
        y: number;
        z: number;
        yaw: number;
        clip: string;
    };
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
    applyRemoteCommand(command: CommandPayload): {
        dropped: string[];
        resync: boolean;
    };
    confirmCommand(id: string): void;
    /** Local edits the room has not confirmed yet, oldest first (resent after a reconnect). */
    pendingCommands(): Array<{
        id: string;
        command: CommandPayload;
    }>;
    /** The room refused one of our edits: it is taken out of the local world. */
    rejectCommand(id: string): {
        dropped: string[];
        resync: boolean;
    };
    /** Moves the player (zones, portals, respawn); without `y` the feet land on the ground. */
    /** `free`: a start or respawn spot, moved off any house or item first (never a correction or a rule's move). */
    teleportPlayer(position: {
        x: number;
        y?: number;
        z: number;
    }, options?: {
        free?: boolean;
    }): void;
    /** The place is made of blocks (P2-26): players may build with their hands there. */
    readonly hasBlocks: boolean;
    /**
     * Building with the avatar's hands (decision 109): whether the room allows it, the block in
     * hand, and what a tap does on touch screens (the mouse digs with the left and places with the
     * right button). Building works only while playing or testing.
     */
    setHands(settings: {
        allowed?: boolean;
        block?: BlockName;
        mode?: HandsMode;
    }): void;
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
    endRide(exit?: {
        x: number;
        y: number;
        z: number;
        yaw?: number;
    }): void;
    /** The room refused a move of the ridden item: it goes back to `pose` at once, standing still. */
    rideCorrection(pose: Pose4): void;
    /** What the local player rides, or null. */
    readonly riding: {
        instanceId: string;
        seat: number;
        model: RideModel;
    } | null;
    /** The nearest rideable item the local player can reach now (null while riding or building). */
    rideableInReach(): {
        instanceId: string;
        model: RideModel;
    } | null;
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
    applyRidePoses(rows: ReadonlyArray<{
        instanceId: string;
        x: number;
        y: number;
        z: number;
        yaw: number;
    }>): void;
    /** On-screen buttons held while riding (touch): up (the jump button) and Down. */
    setRideButtons(buttons: {
        up?: boolean;
        descend?: boolean;
    }): void;
    /** Player blocks the room accepted (from anyone). */
    applyPlayerBlocks(blocks: ReadonlyArray<readonly [number, number, number, number]>): void;
    /** Every player block of the room, replacing those shown (on joining). */
    loadPlayerBlocks(chunks: readonly string[]): void;
    dispose(): void;
}
/**
 * Genvr runtime v0: renders a world document (sky, light, ground sized by tier, water) and a
 * walkable placeholder avatar with keyboard, touch, and gamepad input. Physics (Rapier), chunked
 * terrain, items, and multiplayer follow in Phase 2 and 3 tasks.
 */
export declare function createRuntime({ onFilmFrame, onRendered, container, world, terrainChunks, loadTerrainFieldPage, loadSignal, onCommand, editable, onToolStatus, avatarLook, emulateTouch, fetchPackage, dracoPath, forceWebGL, viewOnly, playView, sideMoves, blockLook, onPlayerBlocks, onHeldBlock, onHandsNotice, onInteract, }: RuntimeOptions): Promise<GenvrRuntime>;
/** `?cam=x,h,z&look=x,h,z` (Tidewater world shots): null unless both are six finite numbers. */
export declare function parseFixedCamera(cam: string | null, look: string | null): {
    cam: [number, number, number];
    look: [number, number, number];
    placed: boolean;
} | null;
