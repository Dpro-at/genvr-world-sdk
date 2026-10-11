import backpack from './accessories/backpack.js';
import vest from './clothing/vest.js';
import beanie from './accessories/beanie.js';
import boots from './clothing/boots.js';
import bowTie from './clothing/bow-tie.js';
import cap from './accessories/cap.js';
import cape from './accessories/cape.js';
import crown from './accessories/crown.js';
import glasses from './accessories/glasses.js';
import hoodie from './clothing/hoodie.js';
import jacket from './clothing/jacket.js';
import partyHat from './accessories/party-hat.js';
import scarf from './clothing/scarf.js';
import shorts from './clothing/shorts.js';
import skirt from './clothing/skirt.js';
import sunglasses from './accessories/sunglasses.js';
import wings from './accessories/wings.js';
import type { WearableItem } from './_wearable.js';

/** Clothes (store type `clothing`) on the Look tab, in library order. */
export const CORE_CLOTHING: readonly WearableItem[] = [
  hoodie,
  jacket,
  vest,
  shorts,
  skirt,
  boots,
  scarf,
  bowTie,
];

/** Accessories (store type `avatar`) on the Extras tab, in library order. */
export const CORE_ACCESSORIES: readonly WearableItem[] = [
  cap,
  beanie,
  partyHat,
  crown,
  glasses,
  sunglasses,
  backpack,
  cape,
  wings,
];

export const CORE_WEARABLES: readonly WearableItem[] = [...CORE_CLOTHING, ...CORE_ACCESSORIES];

const byId = new Map(CORE_WEARABLES.map((item) => [item.manifest.id, item]));

export const findWearable = (id: string): WearableItem | undefined => byId.get(id);

const place = (item: WearableItem) => `${item.slot}:${item.layer}`;

/**
 * The items a look really wears: known ids only, one per slot and layer (the last one wins, so a
 * new hat replaces the old one), inner layers before outer ones (outer colors win).
 */
export function wornItems(ids: readonly string[]): WearableItem[] {
  const byPlace = new Map<string, WearableItem>();
  for (const id of ids) {
    const item = byId.get(id);
    if (item) byPlace.set(place(item), item);
  }
  const items = [...byPlace.values()];
  return [
    ...items.filter((item) => item.layer === 'inner'),
    ...items.filter((item) => item.layer === 'outer'),
  ];
}

/**
 * Puts an item on (replacing the one in its slot and layer, so a jacket goes over a hoodie but
 * replaces a vest), or takes it off when it is already worn.
 */
export function toggleWearable(ids: readonly string[], id: string): string[] {
  const item = byId.get(id);
  const worn = wornItems(ids).map((entry) => entry.manifest.id);
  if (!item) return worn;
  if (worn.includes(id)) return worn.filter((entry) => entry !== id);
  return [
    ...wornItems(worn)
      .filter((entry) => place(entry) !== place(item))
      .map((entry) => entry.manifest.id),
    id,
  ];
}
