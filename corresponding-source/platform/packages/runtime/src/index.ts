// Genvr three.js runtime (player and editor core). Must not import React or Next.js.
export { createRuntime, type GenvrRuntime, type RuntimeOptions } from './runtime.js';
export { FilmRig, FILM_PRESETS, captureFilm, sampleFilmPath } from './filming.js';
export {
  GamepadInput,
  KeyboardInput,
  mergeIntents,
  TouchJoystickInput,
  type InputSource,
  type MoveIntent,
} from './input.js';
export { SKY_PRESETS, SOIL_COLORS, STYLE_LOOKS } from './environment.js';
export {
  BoxCharacter,
  Character,
  CHARACTER,
  initPhysics,
  PhysicsWorld,
  type CharacterSettings,
  type ColliderOwner,
} from './physics.js';
export { CHASE_CAMERA, chaseCameraYaw, FOLLOW_CAMERA, nextCameraDistance } from './camera.js';
export {
  RIDER,
  RideController,
  rideInput,
  rideTilt,
  SEATS,
  seatInWorld,
  seatLayout,
  type Pose4,
  type RideBounds,
  type SurfaceAt,
} from './ride.js';
export { screenDisplay, type CaptureAdapter, type DisplayAdapter } from './adapters.js';
export { TerrainColliders } from './terrain-physics.js';
export { inspectResources, type DiagnosticOptions, type RuntimeDiagnostics } from './diagnostics.js';
export { hydrateTerrainFieldSet, type TerrainFieldPageLoader } from './terrain-field-loader.js';
export {
  BUILD_TOOLS,
  BuildTools,
  DEFAULT_RIVER,
  type BuildTool,
  type RiverToolSettings,
  type RoadToolSettings,
  type SelectedWater,
  type ToolStatus,
} from './build-tools.js';
export { STACKABLE_BLOCKS, type BlockMode, type BlockToolSettings } from './block-tools.js';
export { HAND_BLOCKS, HAND_REACH, PlayerHands, rayBlock, type HandsMode } from './player-hands.js';
export { StructuresView } from './structures.js';
export {
  itemColliderBox,
  itemGeometry,
  ItemsView,
  resolveItem,
  yawOf,
  yawQuaternion,
  type ItemModel,
  type LivePose,
} from './items.js';
export { asksForRest, DEFAULT_SNAP, type ItemSelection, type SnapSettings } from './item-tools.js';
export { ITEM_VIEWS, renderItemPictures, type ItemPictures, type ItemView } from './item-pictures.js';
export { CATALOG_PICTURE_IDS, renderCatalogPictures } from './catalog-pictures.js';
export {
  BRUSH_RADIUS,
  DEFAULT_BRUSH,
  type BrushMode,
  type BrushSettings,
  type BrushSize,
} from './terrain-tools.js';
/** What the Cover brush writes (P2-40); the studio picks one and never depends on `@genvr/world`. */
export type { Cover } from '@genvr/world';
export {
  createAvatarClips,
  createGenvrAvatar,
  DEFAULT_LOOK,
  restPosition,
  setItemBodyResolver,
  registerLocalAvatarBody,
  preloadAvatarLook,
  STANDARD_BONES,
  type AvatarLook,
  type GenvrAvatar,
  type StandardBone,
} from './avatar.js';
export { AvatarAnimator, locomotionClip, type LocomotionInput } from './animator.js';
export { lookFor, RemotePlayers, type RemotePlayerState } from './remote-players.js';
export {
  createGltfLoader,
  DEFAULT_DRACO_PATH,
  parseGltf,
  type GLTF,
  type GltfLoaderOptions,
} from './gltf.js';
export {
  ItemPackages,
  mergedPackageGeometry,
  modelParts,
  type LoadedPackage,
  type PackageFetcher,
  type PackageMesh,
} from './item-packages.js';
export { createItemViewer, type ItemFacts, type ItemViewer, type ItemViewerOptions } from './item-viewer.js';
export { cssRotation, FACE_DIRECTIONS, ViewCube, type ViewFace } from './view-cube.js';
export type { WorldFinding, WorldReport } from '@genvr/validator';
/** Lip sync (P2-44): mouth shapes from voice lines and their sound. */
export { loudnessShape, SpeechMouth, type LevelSource } from './speech.js';
/** Generated looks (decision 130): runtime generators of Core Library items. */
export { hasGenerator, registerGenerator, registerGeneratorMaterial, type Generator } from './generators.js';
/** Sea life of the Tidewater seabed and shore (SEALIFE-01): starfish, giant clams and shells, registered here. */
import { registerSeaLife } from './sealife/index.js';
registerSeaLife();
export {
  CLAM_GENERATOR,
  SHELL_GENERATOR,
  STARFISH_GENERATOR,
  registerSeaLife,
} from './sealife/index.js';

export { retargetAvatarMotion } from './avatar-motion.js';

export { registerAvatarMotionLibrary, avatarMotionEntry as findAvatarMotion, avatarMotionEntries, type AvatarMotionLibrary, type AvatarMotionEntry } from './avatar-motion-library.js';

export { MOTION_CATEGORIES, motionCategories, type MotionCategory } from './avatar-motion-categories.js';
