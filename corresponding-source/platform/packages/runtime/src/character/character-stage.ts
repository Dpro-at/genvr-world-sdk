import { previewRGBA } from './readback.js';
import { avatarMotionEntry, resolveAvatarLibraryMotion } from '../avatar-motion-library.js';
import type { FaceUniforms } from './human/face.js';
import { retargetAvatarMotion } from '../avatar-motion.js';
import type { AvatarExpression } from '../avatar-expression.js';
import {
  AnimationMixer,
  RenderTarget,
  UnsignedByteType,
  SRGBColorSpace,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Euler,
  GridHelper,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  LoopRepeat,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshBasicNodeMaterial,
  MeshNormalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShadowMaterial,
  SphereGeometry,
  TSL,
  Timer,
  Vector3,
  WebGPURenderer,
  type AnimationAction,
  type AnimationClip,
  type Bone,
  type Material,
  type Node,
  type Object3D,
  type SkinnedMesh,
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MUSCLE_GROUPS, MUSCLE_ZONE_COLORS, recipeLook, type CharacterRecipe } from '@genvr/contracts';
import {
  CORE_ANIMATIONS,
  findBody,
  isItemBodyId,
  type AvatarBody,
  type BodyJoint,
} from '@genvr/core-library';
import type { RigBone } from '@genvr/core-library';
import { clipFromAnimation, clipTilt, createGenvrAvatar, type GenvrAvatar } from '../avatar.js';
import { FACE_DIRECTIONS, ViewCube, type ViewFace } from '../view-cube.js';
import { boneRoles, shapedBody, shapeSkin, type BoneRole, type ShapeBone } from './shape.js';
import { startMusclePaint, type MusclePaintMode } from './muscle-paint-mode.js';
import type { MusclePaint } from './human/paint.js';
import { armsOnlyIndex, viewModeSetup, type CharacterShading, type CharacterViewMode } from './view-modes.js';

/** What the editor shows about the character now. */
export interface CharacterStageInfo {
  /** The body asked for, and whether it is drawn (a mesh body shows Classic while its model loads). */
  body: string;
  ready: boolean;
  faces: number;
  /** Quads of a body made of quads (our generated body); 0 for triangle bodies. */
  quads: number;
  vertices: number;
  bones: number;
  /** Standing height at rest (m). */
  height: number;
  clip: string | null;
  expression: AvatarExpression;
  expressionSupported: boolean;
  mouth: import('@genvr/contracts').MouthShape;
  backend: 'WebGPU' | 'WebGL';
}

export interface CharacterStageColors {
  /** Bone lines and wire (the page's ink). */
  line: string;
  /** Floor grid lines. */
  grid: string;
}

export interface CharacterStage {
  readonly info: CharacterStageInfo;
  /** Every clip the character can play (Core moves and emotes), by name. */
  readonly clips: readonly string[];
  setRecipe(recipe: CharacterRecipe): void;
  setViewMode(mode: CharacterViewMode): void;
  /** In the muscle and fat views: show one muscle group or fat region (1 + its index), 0 for all. */
  setAnatomyFocus(muscle: number, fat: number): void;
  setShading(shading: CharacterShading): void;
  setGrid(on: boolean): void;
  /** First person: turn the upper arms forward so idle hands come into view. */
  setHandsUp(on: boolean): void;
  setColors(colors: CharacterStageColors): void;
  /** Plays a clip in a loop (the editor previews every move in a loop). */
  play(clip: string): void;
  presentAnimation(id: string): boolean;
  setMouth(shape: import('@genvr/contracts').MouthShape): void;
  presentExpression(expression: AvatarExpression): boolean;
  importAvatarMotion(id: string, data: ArrayBuffer): Promise<boolean>;
  setPaused(paused: boolean): void;
  /** Shows the playing clip at this time (seconds, looped): a host that drives the clock (the motion lab) pauses the stage and calls this every frame. */
  setClipTime(seconds: number): void;
  /**
   * Holds the character in one pose (the motion lab's Pose mode, board M11): turns per joint as Euler XYZ degrees from
   * rest, as the clips store them (the rig bones, and fingers by their own names), and a hips offset in metres. Null
   * goes back to the playing clip.
   */
  setHeldPose(pose: { bones: Readonly<Record<string, readonly number[]>>; root: readonly number[] } | null): void;
  /** Where joints of the drawn character are (world metres), by joint name (`RightHand`). */
  jointPositions(names: readonly string[]): Record<string, [number, number, number]>;
  /** World points to pixels in the stage's container (null: behind the camera). */
  project(points: ReadonlyArray<readonly number[]>): Array<[number, number] | null>;
  /** A pixel in the container to the world point on the plane that faces the camera through `through`. */
  unproject(x: number, y: number, through: readonly number[]): [number, number, number];
  /** Manual eyelid inspection: null restores automatic blinking. */
  setEyeClosure(amount: number | null): void;
  capturePreview(options?: {width:number;height:number;framing:'full'|'bust'|'face';anchor?:number}): Promise<string>;
  setEnvironment(environment: Object3D | null): void;
  frameAvatar(framing: 'full' | 'bust' | 'face', horizontalAnchor?: number): void;
  resetView(): void;
  /** Close-up on the face from the front (face work: eyes, mouth, lines). */
  focusFace(): void;
  lookFrom(face: ViewFace): void;
  /**
   * Put the camera on an orbit round what it looks at (the motion lab shows the course ahead): `azimuth` degrees
   * from +z toward +x, `elevation` degrees above the ground, `distance` metres.
   */
  setOrbit(azimuth: number, elevation: number, distance: number): void;
  /** Turn the camera round what it looks at (degrees, + to the right) or move it closer (factor < 1) / further (> 1). */
  turnView(degrees: number): void;
  zoomView(factor: number): void;
  onChange(listener: (info: CharacterStageInfo) => void): () => void;
  /**
   * The muscle paint tool (generated bodies): the character is replaced by the default boy, static, to paint
   * muscles on; `stopPaint` brings the character back.
   */
  startPaint(paint: MusclePaint): Promise<MusclePaintMode>;
  stopPaint(): void;
  dispose(): void;
}

const FINGER_JOINT = /^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)\d$/;
const CORE_ANIMATED =
  /^(Hips|Spine|Spine1|Spine2|Neck|Head|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Shoulder|Arm|ForeArm|Hand))$/;

/** Data about one drawn mesh that every reshape starts from (the mesh as the avatar made it). */
interface Base {
  mesh: SkinnedMesh;
  body: AvatarBody;
  roles: BoneRole[];
  bones: ShapeBone[];
  source: BufferGeometry;
  owned: BufferGeometry;
  arms: BufferGeometry;
  /** Quad edges only (bodies made of quads): the wireframe shows the quads, not their diagonals. */
  quadWire: BufferGeometry | null;
  material: Material | Material[];
  hasModel: boolean;
}

/** The body drawn now, rebuilt from its skeleton (works for Genvr's bodies and uploaded ones alike). */
function bodyOf(avatar: GenvrAvatar): AvatarBody {
  const id = avatar.body;
  const core = isItemBodyId(id) ? null : findBody(id);
  const prefix = core?.bonePrefix ?? 'mixamorig';
  const bones = avatar.skeleton.bones;
  const name = (bone: Bone) => (bone.name.startsWith(prefix) ? bone.name.slice(prefix.length) : bone.name);
  const world = new Map<Bone, Vector3>();
  const joints: BodyJoint[] = bones.map((bone) => {
    const parent = (bone.parent as Bone | null)?.isBone ? (bone.parent as Bone) : null;
    const at = bone.position.clone().add(parent ? (world.get(parent) ?? new Vector3()) : new Vector3());
    world.set(bone, at);
    return { name: name(bone), parent: parent ? name(parent) : null, at: [at.x, at.y, at.z] };
  });
  if (core) return { ...core, joints };
  const animation: Record<string, readonly RigBone[]> = {};
  for (const joint of joints)
    if (CORE_ANIMATED.test(joint.name)) animation[joint.name] = [joint.name as RigBone];
  return {
    ...findBody('starter'),
    id,
    bonePrefix: prefix,
    joints,
    animation,
    parts: [],
    fit: {},
  };
}

/**
 * The character editor's stage (CHAR-01): one character on a calm floor, with the editor's view modes, shaping and
 * clips. Uses the game's own avatar (`createGenvrAvatar`), so every body, clip and spring looks as in play.
 */
export async function createCharacterStage({
  container,
  recipe: firstRecipe,
  colors: firstColors = { line: '#0a0a0a', grid: '#a1a1aa' },
  viewCube: showCube = true,
  forceWebGL = false,
}: {
  container: HTMLElement;
  recipe: CharacterRecipe;
  colors?: CharacterStageColors;
  viewCube?: boolean;
  forceWebGL?: boolean;
}): Promise<CharacterStage> {
  let disposed=false;
  let previewRenderer:WebGPURenderer|null=null;
  let previewInit:Promise<WebGPURenderer>|null=null;
  let eyeClosure = -1;
  let currentExpression: AvatarExpression = 'neutral';
  const renderer = new WebGPURenderer({ antialias: true, alpha: true, forceWebGL });
  await renderer.init();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, Math.max(1, container.clientHeight));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);
  const backend: 'WebGPU' | 'WebGL' = (renderer.backend as { isWebGLBackend?: boolean }).isWebGLBackend
    ? 'WebGL'
    : 'WebGPU';

  const scene = new Scene();
  let environment: Object3D | null = null;
  let portraitSize:{width:number;height:number}|null=null;
  let portraitAnchor=.5;
  let portrait: 'full' | 'bust' | 'face' | null = null;
  scene.add(new HemisphereLight(0xffffff, 0x8c8c8c, 1.6));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(2.5, 5, 3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = .008;
  sun.shadow.bias = -.00015;
  Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1, far: 15 });
  scene.add(sun);
  const fill = new DirectionalLight(0xffffff, 0.6);
  fill.position.set(-3, 2, -2);
  scene.add(fill);
  const floor = new Mesh(new PlaneGeometry(12, 12), new ShadowMaterial({ opacity: 0.18 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  let grid = new GridHelper(6, 24, firstColors.grid, firstColors.grid);
  (grid.material as Material).transparent = true;
  (grid.material as Material).opacity = 0.35;
  scene.add(grid);

  const camera = new PerspectiveCamera(
    32,
    container.clientWidth / Math.max(1, container.clientHeight),
    0.01,
    100,
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 0.6;
  controls.maxDistance = 12;

  // View materials (shared by every body; skinning works with any material).
  const clay = new MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.85, metalness: 0 });
  const ghost = new MeshStandardMaterial({
    color: 0xc8c8c8,
    roughness: 0.9,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const wire = new MeshBasicMaterial({ color: new Color(firstColors.line), wireframe: true });
  const normals = new MeshNormalMaterial();
  // Muscle and fat views (owner): the mesh lines, red where muscle grows, or yellow where fat does, one at a time.
  const anatomyLine = TSL.uniform(new Color(firstColors.line));
  // The one muscle group or fat region shown (1 + its index in the contracts' lists), 0 for all of them.
  const muscleFocus = TSL.uniform(0);
  const fatFocus = TSL.uniform(0);
  // Each muscle zone in its own colour (contracts MUSCLE_ZONE_COLORS, by zone id); fat in yellow.
  const zoneColors = TSL.uniformArray(
    [new Color(0xf2c230), ...MUSCLE_GROUPS.map((zone) => new Color(MUSCLE_ZONE_COLORS[zone]))],
    'color',
  );
  const anatomyView = (map: string, part: string, focus: typeof muscleFocus, zoned: boolean) => {
    const { attribute, float, mix, smoothstep, step } = TSL;
    const material = new MeshBasicNodeMaterial({ wireframe: true });
    // The colour grows with how much grows there: faint at the edges, full where a muscle (or fat) is thickest.
    const amount = smoothstep(float(0.04), float(0.45), attribute(map, 'float'));
    const id = attribute(part, 'float');
    const chosen = TSL.varying(float(1).sub(step(float(0.5), focus.sub(id).abs()).mul(step(float(0.5), focus))));
    // three's TSL types lose the array's colour type on element().
    // Each corner takes its zone's colour in the vertex stage, so a quad between two zones blends their two colours
    // (an interpolated zone number picked a third zone's colour inside the quad).
    const tint = TSL.varying(
      zoneColors.element((zoned ? id : float(0)).toInt()) as unknown as Node<'color'>,
      `zone${zoned ? 'Muscle' : 'Fat'}Colour`,
    ) as unknown as Node<'color'>;
    material.colorNode = mix(anatomyLine, tint, amount.mul(chosen));
    return material;
  };
  const muscleView = anatomyView('muscleMap', 'muscleGroup', muscleFocus, true);
  const fatView = anatomyView('fatMap', 'fatRegion', fatFocus, false);

  // Bones drawn on top: a line to each parent and a dot per joint.
  const boneLines = new LineSegments(
    new BufferGeometry(),
    new LineBasicMaterial({ color: new Color(firstColors.line), depthTest: false, transparent: true }),
  );
  boneLines.renderOrder = 10;
  boneLines.frustumCulled = false;
  scene.add(boneLines);
  let jointDots: InstancedMesh | null = null;
  const dotMaterial = new MeshBasicMaterial({
    color: new Color(firstColors.line),
    depthTest: false,
    transparent: true,
  });

  let recipe = firstRecipe;
  let mode: CharacterViewMode = 'normal';
  let shading: CharacterShading = 'smooth';
  let handsUp = true;
  let paused = false;
  let base: Base | null = null;
  const sourceColors = new WeakMap<Material, Color>();
  let height = 1.8;
  let clips: AnimationClip[] = [];
  let clipName = recipe.animations.idle;
  const listeners = new Set<(info: CharacterStageInfo) => void>();

  const lookOf = (next: CharacterRecipe) => ({ ...recipeLook(next), wear: [] as string[] });
  const avatar = createGenvrAvatar(lookOf(recipe), { onBodyReady: () => refresh() });
  avatar.root.traverse((object) => {
    object.castShadow = true;
  });
  scene.add(avatar.root);
  const mixer = new AnimationMixer(avatar.root);
  let action: AnimationAction | null = null;

  /** Takes a freshly made mesh (another body, or new colours) as the start of every reshape. */
  const capture = () => {
    const mesh = avatar.mesh;
    const skeleton = mesh.skeleton;
    const keepBones = base && base.mesh === mesh ? base.bones : null;
    const keepBody = base && base.mesh === mesh ? base.body : null;
    const body = keepBody ?? bodyOf(avatar);
    const roles = boneRoles(body);
    const bones: ShapeBone[] =
      keepBones ??
      skeleton.bones.map((bone, i) => ({
        parent: skeleton.bones.indexOf(bone.parent as Bone),
        bind: skeleton.boneInverses[i]!.clone().invert(),
        rest: bone.position.clone(),
        role: roles[i] ?? 'other',
      }));
    // The old copies are no longer drawn (the avatar may have disposed the owned one already).
    if (base) {
      base.owned.dispose();
      base.arms.dispose();
      base.quadWire?.dispose();
    }
    const source = mesh.geometry;
    const owned = source.clone();
    const skinIndex = owned.getAttribute('skinIndex');
    const skinWeight = owned.getAttribute('skinWeight');
    const arms = new BufferGeometry();
    for (const [key, attribute] of Object.entries(owned.attributes)) arms.setAttribute(key, attribute);
    arms.morphAttributes = owned.morphAttributes;
    arms.morphTargetsRelative = owned.morphTargetsRelative;
    arms.setIndex(
      new BufferAttribute(
        armsOnlyIndex(
          owned.index?.array ?? null,
          owned.getAttribute('position').count,
          skinIndex.array,
          skinWeight.array,
          roles,
        ),
        1,
      ),
    );
    const quadEdges = source.userData.quadEdges as Uint32Array | Uint16Array | undefined;
    let quadWire: BufferGeometry | null = null;
    if (quadEdges) {
      quadWire = new BufferGeometry();
      for (const [key, attribute] of Object.entries(owned.attributes)) quadWire.setAttribute(key, attribute);
      quadWire.setIndex(new BufferAttribute(quadEdges, 1));
    }
    const material =
      base && base.mesh === mesh && base.material !== mesh.material
        ? base.material
        : mesh.material;
    base = {
      mesh,
      body,
      roles,
      bones,
      source,
      owned,
      arms,
      quadWire,
      material,
      hasModel: Boolean(mesh.userData.ownMaterial),
    };
    // Joint dots for this skeleton.
    if (jointDots) {
      scene.remove(jointDots);
      jointDots.geometry.dispose();
    }
    jointDots = new InstancedMesh(new SphereGeometry(0.013, 10, 8), dotMaterial, skeleton.bones.length);
    jointDots.renderOrder = 11;
    jointDots.frustumCulled = false;
    scene.add(jointDots);
    const pairs = skeleton.bones.filter((bone) => (bone.parent as Bone | null)?.isBone).length;
    boneLines.geometry.dispose();
    boneLines.geometry = new BufferGeometry();
    boneLines.geometry.setAttribute('position', new BufferAttribute(new Float32Array(pairs * 6), 3));
  };

  /** Applies the recipe's shape to the drawn mesh and rebuilds its clips. */
  const reshape = () => {
    if (!base) return;
    const mesh = base.mesh;
    const skeleton = mesh.skeleton;
    const position = base.source.getAttribute('position');
    const out = shapeSkin(
      {
        positions: position.array,
        skinIndex: base.source.getAttribute('skinIndex').array,
        skinWeight: base.source.getAttribute('skinWeight').array,
        bones: base.bones,
      },
      recipe.shape,
    );
    const target = base.owned.getAttribute('position') as BufferAttribute;
    (target.array as Float32Array).set(out.positions);
    target.needsUpdate = true;
    base.owned.computeBoundingBox();
    base.owned.computeBoundingSphere();
    let top = -Infinity;
    for (let i = 1; i < out.positions.length; i += 3) top = Math.max(top, out.positions[i]!);
    height = Number.isFinite(top) ? top - out.minY.after : 0;
    skeleton.bones.forEach((bone, i) => {
      bone.position.copy(out.rest[i]!);
      skeleton.boneInverses[i]!.copy(out.bind[i]!).invert();
    });
    // Clips on the shaped body: the Hips drop of sitting follows the new size.
    const shaped = shapedBody(base.body, out.rest, recipe.shape);
    clips = CORE_ANIMATIONS.map((animation) => clipFromAnimation(animation, shaped));
    restart(clipName, action?.time ?? 0);
  };

  let motionRequest = 0;
  const restart = (name: string, time = 0) => {
    motionRequest++;
    const clip = clips.find((entry) => entry.name === name) ?? clips.find((entry) => entry.name === 'Idle');
    mixer.stopAllAction();
    mixer.uncacheRoot(avatar.root);
    action = null;
    if (!clip) return;
    clipName = clip.name;
    // Swims are shown lying in the water, as in play.
    avatar.pose.rotation.x = clipTilt(clip.name);
    action = mixer.clipAction(clip);
    action.setLoop(LoopRepeat, Infinity);
    action.play();
    action.time = time % Math.max(clip.duration, 1e-3);
  };

  /** Puts the right geometry and material on the mesh for the view mode and shading. */
  const applyView = () => {
    if (!base) return;
    const setup = viewModeSetup(mode);
    const mesh = base.mesh;
    // The inspection stage keeps ground shadows without self-shadow acne on a deforming face.
    mesh.receiveShadow = false;
    mesh.geometry =
      setup.body === 'arms'
        ? base.arms
        : (setup.body === 'wire' || setup.body === 'muscles' || setup.body === 'fat') && base.quadWire
          ? base.quadWire
          : base.owned;
    mesh.visible = setup.body !== 'none';
    // The anime outline draws the same shaped body (it kept the unshaped one: a grey ghost around a taller
    // character).
    const shapedOutline = mesh.userData.outline as SkinnedMesh | undefined;
    if (shapedOutline) shapedOutline.geometry = base.owned;
    const material =
      setup.body === 'clay'
        ? clay
        : setup.body === 'ghost'
          ? ghost
          : setup.body === 'wire'
            ? wire
            : setup.body === 'muscles' || setup.body === 'fat'
              ? base.quadWire
                ? setup.body === 'muscles'
                  ? muscleView
                  : fatView
                : wire
            : setup.body === 'normals'
              ? normals
              : base.material;
    for (const one of [clay, ghost, normals, ...(Array.isArray(base.material) ? base.material : [base.material])]) {
      const shaded = one as Material & { flatShading?: boolean };
      if (shaded.flatShading !== (shading === 'flat') && one !== base.material && !(Array.isArray(base.material) && base.material.includes(one))) {
        shaded.flatShading = shading === 'flat';
        one.needsUpdate = true;
      }
    }
    if (mesh.material !== material) mesh.material = material;
    // The anime outline belongs to the body's own look only (not clay, wireframe, normals or first person).
    const outline = mesh.userData.outline as { visible: boolean } | undefined;
    if (outline) outline.visible = setup.body === 'own';
    // Mesh bodies take the recipe's tint (block bodies paint their colour areas).
    for (const material of Array.isArray(base.material) ? base.material : [base.material]) {
      const own = material as Material & { color?: Color };
      if (base.hasModel && own.color) {
        if (!sourceColors.has(material)) sourceColors.set(material, own.color.clone());
        own.color.copy(sourceColors.get(material)!).multiply(new Color(recipe.colors.tint));
      }
    }
    // Face details hung on bones (the block mouth) belong to the textured look only.
    for (const bone of mesh.skeleton.bones)
      for (const child of bone.children) if (!(child as Bone).isBone) child.visible = setup.body === 'own';
    boneLines.visible = setup.bones;
    if (jointDots) jointDots.visible = setup.bones;
    controls.enabled = setup.camera === 'orbit';
    camera.fov = setup.camera === 'eye' ? 70 : 32;
    camera.near = setup.camera === 'eye' ? 0.02 : 0.01;
    camera.updateProjectionMatrix();
    floor.visible = setup.camera === 'orbit';
  };

  const info = (): CharacterStageInfo => {
    const geometry = base?.owned;
    const position = geometry?.getAttribute('position');
    return {
      body: recipe.body,
      ready: avatar.body === recipe.body,
      faces: geometry ? Math.round((geometry.index?.count ?? position?.count ?? 0) / 3) : 0,
      quads: (base?.source.userData.quads as number | undefined) ?? 0,
      vertices: position?.count ?? 0,
      bones: avatar.skeleton.bones.length,
      height: Math.round(height * 100) / 100,
      clip: clipName,
      expression: currentExpression,
      expressionSupported: avatar.expressionSupported,
      mouth: avatar.mouth,
      backend,
    };
  };
  const emit = () => {
    const now = info();
    for (const listener of listeners) listener(now);
  };

  /** After any change of the avatar: capture a new mesh or geometry, reshape, restyle, and tell the page. */
  const refresh = () => {
    if (
      !base ||
      base.mesh !== avatar.mesh ||
      (avatar.mesh.geometry !== base.owned &&
        avatar.mesh.geometry !== base.arms &&
        avatar.mesh.geometry !== base.quadWire)
    )
      capture();
    reshape();
    applyView();
    emit();
  };

  const resetView = () => {
    const middle = Math.max(0.4, height * 0.55);
    const distance = Math.max(2.2, height * 2.6);
    controls.target.set(0, middle, 0);
    camera.position.set(
      Math.sin(Math.PI / 7) * distance,
      middle + height * 0.12,
      Math.cos(Math.PI / 7) * distance,
    );
    controls.update();
  };
  const frameAvatar = (framing: 'full' | 'bust' | 'face', horizontalAnchor = .5) => {
    portraitAnchor=Math.max(.2,Math.min(.8,horizontalAnchor));
    portrait = framing;
    const fraction = framing === 'full' ? 1.12 : framing === 'bust' ? .60 : .27;
    const center = height * (framing === 'full' ? .52 : framing === 'bust' ? .74 : .91);
    const half = height * fraction / 2;
    const tangent = Math.tan(camera.fov * Math.PI / 360);
    const distance = Math.max(half / tangent, height * .30 / (tangent * Math.max(.15, camera.aspect)));
    const w=Math.max(1,portraitSize?.width??container.clientWidth),h=Math.max(1,portraitSize?.height??container.clientHeight);
    camera.clearViewOffset();
    if(portraitAnchor!==.5)camera.setViewOffset(w,h,(.5-portraitAnchor)*w,0,w,h);
    controls.target.set(0, center, 0);
    camera.position.set(0, center, distance);
    controls.update();
  };
  const focusFace = () => {
    // The eyes sit about 8 % of the height below the top of the head.
    const eyes = height * 0.92;
    controls.target.set(0, eyes, 0.05);
    camera.position.set(0, eyes + 0.02, 0.62);
    controls.update();
  };
  const lookFrom = (face: ViewFace) => {
    const [x, y, z] = FACE_DIRECTIONS[face];
    const distance = camera.position.distanceTo(controls.target);
    const direction = new Vector3(x, y, z + (y !== 0 ? 0.001 : 0)).normalize();
    camera.position.copy(controls.target).addScaledVector(direction, distance);
    controls.update();
  };
  const viewCube = showCube ? new ViewCube(container, lookFrom, { corner: 'top-right', size: 52 }) : null;

  refresh();
  resetView();

  // First person: the upper arms turn forward after the clip (and back before the next one).
  const upperArms = () =>
    base
      ? base.mesh.skeleton.bones.filter((bone, i) => {
          const parent = base!.bones[i]?.parent ?? -1;
          return base!.roles[i] === 'arm' && (parent < 0 || base!.roles[parent] !== 'arm');
        })
      : [];
  const saved = new Map<Bone, Quaternion>();
  const forward = (side: number) => new Quaternion().setFromEuler(new Euler(-0.95, -0.28 * side, 0, 'YXZ'));
  const eye = new Vector3();
  const look = new Vector3();
  const matrix = new Matrix4();
  const point = new Vector3();
  const clock = new Timer();

  const drawBones = () => {
    if (!base || !boneLines.visible) return;
    const bones = base.mesh.skeleton.bones;
    const lines = boneLines.geometry.getAttribute('position') as BufferAttribute;
    let n = 0;
    const scale = Math.max(0.5, height / 1.8);
    bones.forEach((bone, i) => {
      bone.getWorldPosition(point);
      jointDots?.setMatrixAt(i, matrix.makeScale(scale, scale, scale).setPosition(point));
      const parent = bone.parent as Bone | null;
      if (!parent?.isBone) return;
      lines.setXYZ(n++, point.x, point.y, point.z);
      parent.getWorldPosition(point);
      lines.setXYZ(n++, point.x, point.y, point.z);
    });
    lines.needsUpdate = true;
    if (jointDots) jointDots.instanceMatrix.needsUpdate = true;
  };

  // The motion lab's held pose (board M11): set after the mixer each frame; the bones it moved go back when it ends.
  let held: { bones: Readonly<Record<string, readonly number[]>>; root: readonly number[] } | null = null;
  const touched = new Map<Bone, { q: Quaternion; p: Vector3 }>();
  const heldQ = new Quaternion(), heldPart = new Quaternion(), heldE = new Euler();
  const jointBones = () => {
    const prefix = base?.body.bonePrefix ?? '';
    return new Map(avatar.skeleton.bones.map((bone) => [prefix && bone.name.startsWith(prefix) ? bone.name.slice(prefix.length) : bone.name, bone]));
  };
  const applyHeld = () => {
    if (!held || !base) return;
    const body = base.body, bones = jointBones();
    const remember = (bone: Bone) => { if (!touched.has(bone)) touched.set(bone, { q: bone.quaternion.clone(), p: bone.position.clone() }); };
    const turn = (v: readonly number[] | undefined) => heldPart.setFromEuler(heldE.set(((v?.[0] ?? 0) * Math.PI) / 180, ((v?.[1] ?? 0) * Math.PI) / 180, ((v?.[2] ?? 0) * Math.PI) / 180, 'XYZ'));
    for (const [joint, sources] of Object.entries(body.animation)) {
      const bone = bones.get(joint);
      if (!bone) continue;
      remember(bone);
      heldQ.identity();
      for (const source of sources) heldQ.multiply(turn(held.bones[source]));
      bone.quaternion.copy(heldQ);
    }
    for (const joint of body.joints) {
      const bone = bones.get(joint.name);
      if (!bone || !FINGER_JOINT.test(joint.name) || !held.bones[joint.name]) continue;
      remember(bone);
      bone.quaternion.copy(turn(held.bones[joint.name]));
    }
    const root = body.joints[0], rootBone = root ? bones.get(root.name) : undefined;
    if (root && rootBone) { remember(rootBone); rootBone.position.set(root.at[0] + (held.root[0] ?? 0), root.at[1] + (held.root[1] ?? 0), root.at[2] + (held.root[2] ?? 0)); }
  };
  const tmp = new Vector3();

  let painting: MusclePaintMode | null = null;
  renderer.setAnimationLoop(() => {
    clock.update();
    const delta = Math.min(clock.getDelta(), 0.1);
    const firstPerson = mode === 'first-person';
    for (const [bone, q] of saved) bone.quaternion.copy(q);
    saved.clear();
    if (!paused && !held) mixer.update(delta);
    applyHeld();
    avatar.root.updateMatrixWorld(true);
    if (firstPerson && handsUp)
      for (const bone of upperArms()) {
        saved.set(bone, bone.quaternion.clone());
        const side = Math.sign(base!.bones[base!.mesh.skeleton.bones.indexOf(bone)]!.rest.x) || 1;
        bone.quaternion.premultiply(forward(side));
      }
    // Screen eyes look at whoever watches the stage.
    if (!paused) { avatar.updateSprings(delta); avatar.setGazeTarget(camera.position); avatar.updateExpression(delta); }
    const material = base?.material;
    const face = (Array.isArray(material) ? material[0] : material)?.userData.face as FaceUniforms | undefined;
    if (face) face.eyeClosure.value = eyeClosure;
    avatar.root.updateMatrixWorld(true);
    if (firstPerson && base) {
      const head = base.mesh.skeleton.bones[base.roles.indexOf('head')];
      if (head) head.getWorldPosition(eye);
      else eye.set(0, height * 0.92, 0);
      const s = Math.max(0.4, height / 1.8);
      eye.add(look.set(0, 0.11 * s, 0.06 * s));
      camera.position.copy(eye);
      camera.lookAt(look.copy(eye).add(new Vector3(0, -0.5, 1)));
    } else controls.update();
    drawBones();
    viewCube?.update(camera);
    renderer.render(scene, camera);
  });
  const resize = new ResizeObserver(() => {
    const width = container.clientWidth;
    const heightPx = Math.max(1, container.clientHeight);
    camera.aspect = width / heightPx;
    camera.updateProjectionMatrix();
    renderer.setSize(width, heightPx);
    if (portrait) frameAvatar(portrait,portraitAnchor);
  });
  resize.observe(container);

  const presentAnimation = (id: string): boolean => {
      const name = id === 'idle' ? 'Idle' : CORE_ANIMATIONS.find(row => row.manifest.id === id)?.clip ?? id;
      if (avatarMotionEntry(name)) {
        const request = ++motionRequest, geometry = avatar.mesh.geometry;
        void resolveAvatarLibraryMotion(avatar.root, name).then(result => {
          if (!result || request !== motionRequest || avatar.mesh.geometry !== geometry) return;
          clips = [...clips.filter(clip => clip.name !== name), result.clip];
          restart(name); emit();
        });
        return true;
      }
      if (!clips.some(clip => clip.name === name)) return false; restart(name); emit(); return true;
  };

  return {
    get info() {
      return info();
    },
    get clips() {
      return clips.map((clip) => clip.name);
    },
    setRecipe(next) {
      const bodyChanged = next.body !== recipe.body;
      recipe = next;
      // The avatar replaces or disposes what its mesh draws: give it back its own material and the full geometry.
      if (base) {
        base.mesh.material = base.material;
        base.mesh.geometry = base.owned;
      }
      avatar.setLook({ ...lookOf(next), scale: { height: 1, width: 1, head: 1 } });
      refresh();
      if (bodyChanged) resetView();
    },
    setAnatomyFocus(muscle, fat) {
      muscleFocus.value = muscle;
      fatFocus.value = fat;
    },
    setViewMode(next) {
      const wasEye = mode === 'first-person';
      mode = next;
      applyView();
      if (wasEye && next !== 'first-person') resetView();
    },
    setShading(next) {
      shading = next;
      applyView();
    },
    setGrid(on) {
      grid.visible = on;
    },
    setHandsUp(on) {
      handsUp = on;
    },
    setColors(colors) {
      const visible = grid.visible;
      scene.remove(grid);
      grid.geometry.dispose();
      (grid.material as Material).dispose();
      grid = new GridHelper(6, 24, colors.grid, colors.grid);
      (grid.material as Material).transparent = true;
      (grid.material as Material).opacity = 0.35;
      grid.visible = visible;
      scene.add(grid);
      (boneLines.material as LineBasicMaterial).color.set(colors.line);
      dotMaterial.color.set(colors.line);
      wire.color.set(colors.line);
      anatomyLine.value.set(colors.line);
    },
    presentAnimation,
    setMouth(shape) { avatar.setMouth(shape); },
    presentExpression(expression) { if (expression !== 'neutral' && !avatar.expressionSupported) return false; currentExpression = expression; avatar.setExpression(expression); emit(); return true; },
    async importAvatarMotion(id, data) {
      const clip = await retargetAvatarMotion(data, avatar, id); clips = [...clips.filter(row => row.name !== id), clip]; emit(); return true;
    },
    play(name) {
      if (avatarMotionEntry(name)) { presentAnimation(name); return; }
      restart(name);
      emit();
    },
    setEyeClosure(amount) {
      eyeClosure = amount === null || !Number.isFinite(amount) ? -1 : Math.max(0, Math.min(1, amount));
    },
    setPaused(next) {
      paused = next;
    },
    setHeldPose(pose) {
      held = pose;
      if (pose) return;
      const live = new Set(avatar.skeleton.bones);
      for (const [bone, rest] of touched) if (live.has(bone)) { bone.quaternion.copy(rest.q); bone.position.copy(rest.p); }
      touched.clear();
      mixer.update(0);
    },
    jointPositions(names) {
      const bones = jointBones(), out: Record<string, [number, number, number]> = {};
      for (const name of names) { const bone = bones.get(name); if (bone) { bone.getWorldPosition(tmp); out[name] = [tmp.x, tmp.y, tmp.z]; } }
      return out;
    },
    project(points) {
      const width = container.clientWidth, heightPx = container.clientHeight;
      return points.map((p) => {
        tmp.set(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0).project(camera);
        return tmp.z > 1 || tmp.z < -1 ? null : [((tmp.x + 1) / 2) * width, ((1 - tmp.y) / 2) * heightPx];
      });
    },
    unproject(x, y, through) {
      const width = Math.max(1, container.clientWidth), heightPx = Math.max(1, container.clientHeight);
      const dir = new Vector3((x / width) * 2 - 1, -(y / heightPx) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
      const normal = camera.getWorldDirection(new Vector3());
      const point = new Vector3(through[0] ?? 0, through[1] ?? 0, through[2] ?? 0);
      const t = point.sub(camera.position).dot(normal) / (dir.dot(normal) || 1e-6);
      const hit = camera.position.clone().addScaledVector(dir, t);
      return [hit.x, hit.y, hit.z];
    },
    setClipTime(seconds) {
      if (!action || !Number.isFinite(seconds)) return;
      action.time = ((seconds % action.getClip().duration) + action.getClip().duration) % action.getClip().duration;
      mixer.update(0);
    },
    async capturePreview(options){
      if(!previewInit)previewInit=(async()=>{const capture=new WebGPURenderer({antialias:true,alpha:true,forceWebGL:true});await capture.init();if(disposed){capture.dispose();throw new Error('Character stage closed.');}capture.shadowMap.enabled=true;previewRenderer=capture;return capture;})();
      const capture=await previewInit;
      if(disposed)throw new Error('Character stage closed.');
      const width=Math.max(1,Math.round(options?.width??container.clientWidth)),heightPx=Math.max(1,Math.round(options?.height??container.clientHeight));
      const oldCamera=camera.clone(),oldTarget=controls.target.clone(),oldPortrait=portrait,oldAnchor=portraitAnchor,oldRenderTarget=capture.getRenderTarget();
      const target=new RenderTarget(width,heightPx,{type:UnsignedByteType});target.texture.colorSpace=SRGBColorSpace;
      let pixels:Promise<import('three').TypedArray>;
      try{portraitSize={width,height:heightPx};camera.aspect=width/heightPx;camera.updateProjectionMatrix();frameAvatar(options?.framing??portrait??'full',options?.anchor??portraitAnchor);capture.setRenderTarget(target);capture.render(scene,camera);pixels=capture.readRenderTargetPixelsAsync(target,0,0,width,heightPx);}
      catch(error){target.dispose();throw error;}
      finally{capture.setRenderTarget(oldRenderTarget);portraitSize=null;camera.copy(oldCamera);controls.target.copy(oldTarget);portrait=oldPortrait;portraitAnchor=oldAnchor;controls.update();}
      try{const source=await pixels;const bytes=previewRGBA(source as Uint8Array,width,heightPx,true);
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=heightPx;canvas.getContext('2d')!.putImageData(new ImageData(bytes,width,heightPx),0,0);return canvas.toDataURL('image/png');
      }finally{target.dispose();}
    },
    setEnvironment(next) { if (environment) scene.remove(environment); environment = next; if (next) scene.add(next); },
    frameAvatar,
    resetView,
    focusFace,
    lookFrom,
    setOrbit(azimuth, elevation, distance) {
      const d = Math.max(controls.minDistance, distance);
      controls.maxDistance = Math.max(controls.maxDistance, d * 1.5);
      camera.far = Math.max(camera.far, d * 10);
      camera.updateProjectionMatrix();
      const a = (azimuth * Math.PI) / 180, e = (Math.max(-89, Math.min(89, elevation)) * Math.PI) / 180;
      camera.position.set(
        controls.target.x + Math.sin(a) * Math.cos(e) * d,
        controls.target.y + Math.sin(e) * d,
        controls.target.z + Math.cos(a) * Math.cos(e) * d,
      );
      controls.update();
    },
    turnView(degrees) {
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new Vector3(0, 1, 0), (-degrees * Math.PI) / 180);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    },
    zoomView(factor) {
      const offset = camera.position.clone().sub(controls.target);
      const distance = Math.max(controls.minDistance, Math.min(controls.maxDistance, offset.length() * factor));
      camera.position.copy(controls.target).add(offset.setLength(distance));
      controls.update();
    },
    async startPaint(paint) {
      painting?.dispose();
      painting = await startMusclePaint({ scene, camera, controls, canvas: renderer.domElement, paint });
      avatar.root.visible = false;
      boneLines.visible = false;
      if (jointDots) jointDots.visible = false;
      return painting;
    },
    stopPaint() {
      painting?.dispose();
      painting = null;
      avatar.root.visible = true;
      applyView();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed=true;previewRenderer?.dispose();
      painting?.dispose();
      renderer.setAnimationLoop(null);
      resize.disconnect();
      viewCube?.dispose();
      controls.dispose();
      mixer.stopAllAction();
      if (base) {
        base.mesh.geometry = base.source;
        base.mesh.material = base.material;
        base.owned.dispose();
        base.arms.dispose();
        base.quadWire?.dispose();
      }
      motionRequest++;
      avatar.dispose();
      for (const one of [clay, ghost, wire, normals, dotMaterial] as Material[]) one.dispose();
      boneLines.geometry.dispose();
      (boneLines.material as Material).dispose();
      jointDots?.geometry.dispose();
      grid.geometry.dispose();
      (grid.material as Material).dispose();
      floor.geometry.dispose();
      (floor.material as Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
