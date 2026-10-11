/**
 * The zone settings of a placed item in the studio (generic rules, Task 7): any item can be a zone
 * (an area or a gate) with a tag and a choice whether players see it while playing. Stored flat in
 * the item's params (`ZONE_PARAMS`: `zone`, `zoneTag`, `zoneVisible`) through `set_item_params`,
 * exactly as the room reads them (`zoneFromParams`). Pure, so it is tested without the studio.
 */

import { RULE_LIMITS, ZONE_PARAMS, type Zone } from '@genvr/contracts';

export type ZoneShapeChoice = Zone['shape'] | 'off';

/** A params patch for `set_item_params` (null removes a setting). */
export type ParamsPatch = Record<string, string | number | boolean | null>;

/** What the studio shows for an item: its zone shape (or off), its tag as typed, and visibility. */
export interface ZoneSettings {
  shape: ZoneShapeChoice;
  tag: string;
  visible: boolean;
  /** Whether the room counts it: a shape and a usable tag. */
  active: boolean;
}

/**
 * The item's zone settings. `itemShape` is the shape a zone item has by itself (its params may
 * name the other one); a plain item is off until its params name a shape.
 */
export function zoneSettings(
  params: Readonly<Record<string, unknown>>,
  itemShape?: Zone['shape'],
): ZoneSettings {
  const named = params[ZONE_PARAMS.shape];
  const shape: ZoneShapeChoice = named === 'area' || named === 'gate' ? named : (itemShape ?? 'off');
  const raw = params[ZONE_PARAMS.tag];
  const tag = typeof raw === 'string' ? raw : '';
  const trimmed = tag.trim();
  return {
    shape,
    tag,
    visible: params[ZONE_PARAMS.visible] === true,
    active: shape !== 'off' && trimmed.length > 0 && trimmed.length <= RULE_LIMITS.name,
  };
}

/** The shapes the studio offers: a zone item is always a zone; any other item can also be off. */
export function shapeChoices(itemShape?: Zone['shape']): ZoneShapeChoice[] {
  return itemShape ? ['area', 'gate'] : ['off', 'area', 'gate'];
}

/**
 * The params patch that makes the item this shape. Off clears every zone setting. A zone item's
 * own shape is stored as no param (the item gives it).
 */
export function shapePatch(shape: ZoneShapeChoice, itemShape?: Zone['shape']): ParamsPatch {
  if (shape === 'off')
    return { [ZONE_PARAMS.shape]: null, [ZONE_PARAMS.tag]: null, [ZONE_PARAMS.visible]: null };
  return { [ZONE_PARAMS.shape]: shape === itemShape ? null : shape };
}

/** The params patch for a typed tag: trimmed and cut to the limit; empty removes it. */
export function tagPatch(text: string): ParamsPatch {
  const tag = text.trim().slice(0, RULE_LIMITS.name);
  return { [ZONE_PARAMS.tag]: tag === '' ? null : tag };
}

/** The params patch for showing the zone while playing (hidden is the default, stored as no param). */
export function visiblePatch(visible: boolean): ParamsPatch {
  return { [ZONE_PARAMS.visible]: visible ? true : null };
}
