import type { CommandPayload, ItemInstance, PlacementRules, WorldDocument } from '@genvr/contracts';
import { place, rotate, type Placed } from './geometry.js';
import type { WorldEnvironment } from './world-checks.js';

export type PlacementRuleName = 'stands' | 'soil' | 'tilt' | 'slope' | 'front';

/** One placement rule of an item and whether the item keeps it (the studio's debug view). */
export interface RuleResult {
  rule: PlacementRuleName;
  /** The rule in words, e.g. "Upright (leans at most 10°)". */
  label: string;
  ok: boolean;
  /** Why it is broken, or null when kept. */
  message: string | null;
  /** Commands that repair it (one undo step), or null when a person has to decide. */
  fix: CommandPayload[] | null;
}

/** A gap bigger than this under an item: it floats, and the floating check reports it. */
const FLOAT_GAP = 0.3;
/** How far above ground and water a support must be to count as built (a floor, an item). */
const BUILT_LIFT = 0.15;
/** Ground rising more than this in front of an item blocks it (meters). */
const STEP = 0.6;

const toDegrees = (radians: number) => Math.round((radians * 180) / Math.PI);
const list = (words: readonly string[]) =>
  words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} or ${words.at(-1)}`;

/** The rules of one placed item, checked against the world around it. */
export function checkItemRules(
  item: Placed,
  rules: PlacementRules,
  env: WorldEnvironment,
  others: readonly Placed[],
  nameOf: (instance: ItemInstance) => string,
): RuleResult[] {
  const { instance, min, max, feet } = item;
  const name = nameOf(instance);
  const [cx, cz] = feet[0]!;
  const results: RuleResult[] = [];
  const result = (
    rule: PlacementRuleName,
    label: string,
    message: string | null,
    fix: CommandPayload[] | null = null,
  ) => results.push({ rule, label, ok: message === null, message, fix: message === null ? null : fix });

  // Upright: the item's up direction against the world's.
  if (rules.maxTilt !== undefined && rules.maxTilt < 180) {
    const up = rotate([0, 1, 0], instance.transform.rotation);
    const lean = toDegrees(Math.acos(Math.max(-1, Math.min(1, up[1]))));
    const forward = rotate([0, 0, 1], instance.transform.rotation);
    const yaw = Math.atan2(forward[0], forward[2]);
    const straight: CommandPayload = {
      type: 'transform_item',
      params: {
        instanceId: instance.instanceId,
        rotation: [
          0,
          Math.round(Math.sin(yaw / 2) * 1e4) / 1e4,
          0,
          Math.round(Math.cos(yaw / 2) * 1e4) / 1e4,
        ],
      },
    };
    result(
      'tilt',
      `Upright (leans at most ${rules.maxTilt}°)`,
      lean > rules.maxTilt ? `${name} leans ${lean}°; it should lean at most ${rules.maxTilt}°.` : null,
      [straight],
    );
  }

  // What it stands on; not judged while it floats (the floating check covers that).
  const resting = item.floats
    ? null
    : (() => {
        const ground = Math.max(...feet.map(([x, z]) => env.groundAt(x, z)));
        const water = env.waterAt?.(cx, cz) ?? null;
        const support = Math.max(
          ...feet.map(([x, z]) => env.supportBelow(x, z, min[1] + 0.05, instance.instanceId)),
        );
        if (min[1] - support > FLOAT_GAP) return null;
        if (water !== null && water > ground + 0.2 && min[1] < water + FLOAT_GAP) return 'water' as const;
        if (support > Math.max(ground, water ?? -Infinity) + BUILT_LIFT) return 'built' as const;
        return 'ground' as const;
      })();

  if (rules.stands && resting) {
    const words = { ground: 'the ground', built: 'floors or other items', water: 'water' };
    const message = rules.stands.includes(resting)
      ? null
      : resting === 'water'
        ? `${name} stands in water; it belongs on ${list(rules.stands.map((s) => words[s]))}.`
        : resting === 'built'
          ? `${name} stands on a built thing; it belongs on ${list(rules.stands.map((s) => words[s]))}.`
          : `${name} stands on the ground; it belongs on ${list(rules.stands.map((s) => words[s]))}.`;
    result('stands', `Stands on ${list(rules.stands.map((s) => words[s]))}`, message);
  }

  if (rules.soils && resting === 'ground' && env.soilAt) {
    const soil = env.soilAt(cx, cz);
    result(
      'soil',
      `Grows on ${list(rules.soils)}`,
      rules.soils.includes(soil as (typeof rules.soils)[number])
        ? null
        : `${name} needs ${list(rules.soils)}; it stands on ${soil}.`,
    );
  }

  if (rules.maxSlope !== undefined && resting === 'ground') {
    let steepest = 0;
    const points = feet.map(([x, z]) => [x, z, env.groundAt(x, z)] as const);
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++) {
        const [ax, az, ah] = points[i]!;
        const [bx, bz, bh] = points[j]!;
        const run = Math.hypot(ax - bx, az - bz);
        if (run > 0.05) steepest = Math.max(steepest, Math.abs(ah - bh) / run);
      }
    const slope = toDegrees(Math.atan(steepest));
    result(
      'slope',
      `Ground at most ${rules.maxSlope}° steep`,
      slope > rules.maxSlope
        ? `The ground under ${name} is ${slope}° steep; it needs at most ${rules.maxSlope}°.`
        : null,
    );
  }

  if (rules.clearFront) {
    const forward = rotate([0, 0, 1], instance.transform.rotation);
    const length = Math.hypot(forward[0], forward[2]) || 1;
    const [fx, fz] = [forward[0] / length, forward[2] / length];
    const depth = (Math.abs(fx) * (max[0] - min[0]) + Math.abs(fz) * (max[2] - min[2])) / 2;
    let problem: string | null = null;
    for (const reach of [depth + 0.2, depth + rules.clearFront]) {
      const x = cx + fx * reach;
      const z = cz + fz * reach;
      const blocker = others.find(
        (other) =>
          other !== item &&
          other.solid &&
          !(instance.groupId && other.instance.groupId === instance.groupId) &&
          // What a player bumps into: a bench under a tree's crown is not blocked by the tree.
          x > other.body.min[0] &&
          x < other.body.max[0] &&
          z > other.body.min[2] &&
          z < other.body.max[2] &&
          other.body.min[1] < min[1] + 1.8 &&
          other.body.max[1] > min[1] + 0.1,
      );
      if (blocker) problem = `${nameOf(blocker.instance)} is in the way`;
      else if (env.groundAt(x, z) > min[1] + STEP) problem = 'the ground rises there';
      if (problem) break;
    }
    result(
      'front',
      `${rules.clearFront} m free in front`,
      problem ? `${name} needs ${rules.clearFront} m of free space in front; ${problem}.` : null,
    );
  }
  return results;
}

/**
 * The placement rules of one item, placed or only planned (the assistant asks before placing):
 * every rule with kept or broken, or null when the item has no rules or no known size.
 */
export function ruleReport(
  doc: WorldDocument,
  env: WorldEnvironment,
  instance: ItemInstance,
  nameOf: (instance: ItemInstance) => string = (i) => env.itemName?.(i.itemId) ?? i.itemId,
): RuleResult[] | null {
  const rules = env.itemRules?.(instance.itemId);
  const shape = env.itemShape(instance.itemId);
  if (!rules || !shape) return null;
  const item = place(instance, shape);
  const others: Placed[] = [];
  for (const other of doc.instances) {
    if (other.instanceId === instance.instanceId) continue;
    const otherShape = env.itemShape(other.itemId);
    if (otherShape) others.push(place(other, otherShape));
  }
  return checkItemRules(item, rules, env, others, nameOf);
}
