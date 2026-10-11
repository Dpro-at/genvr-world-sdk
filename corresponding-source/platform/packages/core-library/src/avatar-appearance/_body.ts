import {
  lookForBody,
  readAvatarLook,
  type AvatarBodyType,
  type BodyId,
  type AvatarColorPart,
  type AvatarLook,
  type AvatarScale,
  type PlaceAvatar,
  NORMAL_AVATAR_SCALE,
} from '@genvr/contracts';
import type { RigBone, V3 } from './_animation.js';
import { boundingBox, type AvatarBody, type BodyColor, type Box, type CoreBody } from './_body-type.js';
import type { BodyArea, WearablePart, WearColor } from './_wearable.js';
import { findWearable, wornItems } from './_wearables.js';
import animeBoy from './bodies/anime-boy.js';
import warrior from './bodies/warrior.js';
import human from './bodies/human.js';
import classic from './bodies/classic.js';
import flat from './bodies/flat.js';
import simple from './bodies/simple.js';
import starter from './bodies/starter.js';

/**
 * The dressed avatar (tasks P2-20, P2-22): a body type's blocks with repainted areas, plus the worn
 * items fitted to that body. The runtime builds the skinned mesh from it and the pages draw the
 * avatar sketches from it, so both always show the same look.
 */

/** Body types in library order; Classic is the main avatar (decision 73). */
export const AVATAR_BODIES: readonly CoreBody[] = [classic, simple, starter, flat, animeBoy, warrior, human];

/**
 * Bodies players pick for themselves (the Look tab). The flat 2D body is a place body: it is
 * worn only where a side-view place uses it for everyone (decision 93).
 */
export const PLAYER_BODIES: readonly CoreBody[] = AVATAR_BODIES.filter((body) => !body.flat);

const bodies = new Map(AVATAR_BODIES.map((body) => [body.id, body]));

/**
 * One of Genvr's bodies by id. A creator's uploaded body (an item id) is not known here: Classic stands in for it, as
 * for any unknown id; the runtime resolves uploaded bodies from the store (uploaded bodies, 2026-10-03).
 */
export const findBody = (id: BodyId | undefined): CoreBody =>
  bodies.get((id ?? 'classic') as AvatarBodyType) ?? classic;

/** The colors of a look, the body type, and the worn items (Core wearable ids). */
export interface LookInput {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  shoes: string;
  body?: BodyId;
  scale?: AvatarScale;
  wear?: readonly string[];
}

const sized = new Map<string, CoreBody>();
const round = (value: number) => Math.round(value * 100) / 100;

/**
 * A body type at a size (P2-22), like Roblox body scales: joints, blocks, fits, and sketch data
 * grow together (height up, width across and deep), and the head grows around the neck. Sizes
 * round to 1 percent and each size is built once.
 */
export function sizedBody(
  id: BodyId | undefined,
  scale: AvatarScale = NORMAL_AVATAR_SCALE,
): CoreBody {
  const base = findBody(id);
  // A mesh body is one fixed model: sizes come later with its own shape keys.
  if (base.model) return base;
  const h = round(scale.height);
  const w = round(scale.width);
  const s = round(scale.head);
  if (h === 1 && w === 1 && s === 1) return base;
  const key = `${base.id}:${h}:${w}:${s}`;
  const cached = sized.get(key);
  if (cached) return cached;
  const grow = (p: V3): V3 => [p[0] * w, p[1] * h, p[2] * w];
  const growSize = (size: V3): V3 => [size[0] * w, size[1] * h, size[2] * w];
  const neck = grow(base.joints.find((joint) => joint.name === 'Head')?.at ?? [0, 0, 0]);
  const head = (p: V3): V3 => {
    const q = grow(p);
    return [neck[0] + (q[0] - neck[0]) * s, neck[1] + (q[1] - neck[1]) * s, neck[2] + (q[2] - neck[2]) * s];
  };
  const place = (joint: string, box: Box): Box =>
    joint === 'Head'
      ? { center: head(box.center), size: growSize(box.size).map((v) => v * s) as V3 }
      : { center: grow(box.center), size: growSize(box.size) };
  const body: CoreBody = {
    ...base,
    scale: { height: h, width: w, head: s },
    joints: base.joints.map((joint) => ({ ...joint, at: grow(joint.at) })),
    parts: base.parts.map((part) => ({ ...part, ...place(part.joint, part) })),
    fit: Object.fromEntries(
      Object.entries(base.fit).map(([bone, target]) => [
        bone,
        { ...target!, box: place(target!.joint, target!.box) },
      ]),
    ),
    sketchArm: {
      start: base.sketchArm.start * w,
      axisY: base.sketchArm.axisY * h,
      hangX: base.sketchArm.hangX * w,
      topY: base.sketchArm.topY * h,
    },
  };
  // Items made for the Starter body always fit through a table once the body is resized.
  if (base.id === 'starter')
    body.fit = Object.fromEntries(
      [...STARTER_BOXES].map(([bone, box]) => [bone, { joint: bone, box: place(bone, box) }]),
    );
  if (sized.size > 64) sized.clear();
  sized.set(key, body);
  return body;
}

/** A block of the dressed avatar on one joint, with its final color (hex). */
export interface LookPart {
  joint: string;
  size: V3;
  center: V3;
  color: string;
  /** The worn item this block belongs to (none for the body itself). */
  item?: string;
  /** Body area of a body block. */
  area?: BodyArea;
  /** A face block (eyes, mouth): the runtime may draw it its own way (the mouth's shapes, lip sync P2-44). */
  face?: 'eyes' | 'mouth';
}

const FACE: Record<'eyes' | 'mouth', string> = { eyes: '#1c1b2e', mouth: '#b5524a' };

/** Starter blocks per bone: where items made for the Starter body sit (the source of every fit). */
const STARTER_BOXES = new Map<string, Box>(
  [...new Set(starter.parts.map((part) => part.joint))].map((joint) => [
    joint,
    boundingBox(starter.parts.filter((part) => part.joint === joint)),
  ]),
);

/** An item block made for the Starter body, moved and stretched onto this body. */
function fitPart(body: AvatarBody, part: WearablePart): Pick<LookPart, 'joint' | 'size' | 'center'> | null {
  const target = body.fit[part.bone];
  if (!target) {
    const known = body.joints.some((joint) => joint.name === part.bone);
    return known ? { joint: part.bone, size: part.size, center: part.center } : null;
  }
  const source = STARTER_BOXES.get(part.bone);
  if (!source) return null;
  // Each target axis follows a Starter axis (turned for arms that hang at rest).
  const axes = target.axes ?? [1, 2, 3];
  const from = axes.map((axis) => Math.abs(axis) - 1);
  const sign = axes.map((axis) => Math.sign(axis));
  const scale = [0, 1, 2].map((a) => target.box.size[a]! / source.size[from[a]!]!);
  return {
    joint: target.joint,
    size: [0, 1, 2].map((a) => part.size[from[a]!]! * scale[a]!) as V3,
    center: [0, 1, 2].map(
      (a) =>
        target.box.center[a]! + sign[a]! * (part.center[from[a]!]! - source.center[from[a]!]!) * scale[a]!,
    ) as V3,
  };
}

/** The dressed avatar: the body with repainted areas, then every worn item's blocks. */
export function lookParts(look: LookInput): LookPart[] {
  const body = sizedBody(look.body, look.scale);
  // A mesh body draws its own model; block clothing does not fit it yet (P2-35).
  if (body.model) return [];
  const items = wornItems(look.wear ?? []);
  const paint: Partial<Record<BodyArea, WearColor>> = {};
  for (const item of items) Object.assign(paint, item.paint);
  const hex = (color: WearColor | BodyColor): string =>
    color.startsWith('#')
      ? color
      : color === 'eyes' || color === 'mouth'
        ? FACE[color]
        : look[color as AvatarColorPart];
  const blocks: LookPart[] = body.parts.map(({ joint, size, center, color, area }) => ({
    joint,
    size,
    center,
    color: hex((area && paint[area]) || color),
    ...(area ? { area } : {}),
    ...(color === 'eyes' || color === 'mouth' ? { face: color } : {}),
  }));
  // Slots with an outer layer on: the inner items' covered blocks hide under it.
  const covered = new Set(items.filter((item) => item.layer === 'outer').map((item) => item.slot));
  for (const item of items)
    for (const part of item.parts) {
      if (part.covered && item.layer === 'inner' && covered.has(item.slot)) continue;
      const placed = fitPart(body, part);
      if (placed) blocks.push({ ...placed, color: hex(part.color), item: item.manifest.id });
    }
  return blocks;
}

/** Bones an item's blocks follow on the Starter body. */
export const itemBones = (id: string): RigBone[] => [
  ...new Set(findWearable(id)?.parts.map((part) => part.bone) ?? []),
];

/** A look from anywhere (a client, an old save): valid colors, known items, one per slot and layer. */
export function normalizeAvatarLook(saved: unknown): AvatarLook {
  const look = readAvatarLook(saved);
  return { ...look, wear: wornItems(look.wear).map((item) => item.manifest.id) };
}

/** Whether a place allows an item on players' own looks (limited places leave out large ones). */
export const allowedInPlace = (id: string, rules: Pick<PlaceAvatar, 'mode'>): boolean =>
  rules.mode !== 'player-limited' || findWearable(id)?.large !== true;

/**
 * The look a player shows in a place (P2-21): their own, their own without large items, or the
 * place's outfit with their own skin, hair, and body type.
 */
export function applyPlaceAvatar(saved: unknown, rules: PlaceAvatar): AvatarLook {
  // A place may use one body type for everyone (P2-22): the player's look kept for that body.
  // The flat 2D body shows only where the place asks for it; elsewhere the Classic look.
  const worn = rules.body === 'any' ? saved : lookForBody(saved, rules.body);
  const own = normalizeAvatarLook(worn);
  const look =
    findBody(own.body).flat && rules.body !== own.body
      ? normalizeAvatarLook(lookForBody(saved, 'classic'))
      : own;
  if (rules.mode === 'place') {
    const outfit = normalizeAvatarLook(rules.outfit);
    return { ...outfit, skin: look.skin, hair: look.hair, body: look.body, scale: NORMAL_AVATAR_SCALE };
  }
  if (rules.mode === 'player-limited')
    return { ...look, scale: NORMAL_AVATAR_SCALE, wear: look.wear.filter((id) => allowedInPlace(id, rules)) };
  return look;
}
