import type { Category, GenvrManifest, ItemSource, ItemType, Style } from '@genvr/contracts';
import { CORE_ITEMS } from './3d-models/index.js';
import { AVATAR_BODIES, CORE_ANIMATIONS, CORE_WEARABLES } from './avatar-appearance/index.js';
import { DRAWN_ITEMS } from './drawn-items.js';
import { CORE_BLOCKS } from './environment/blocks/index.js';
import { GROUND_MATERIALS } from './environment/ground/index.js';
import { ROAD_TYPES } from './environment/roads/index.js';
import { CORE_SKIES } from './environment/sky/index.js';
import { CORE_SURFACES } from './environment/surfaces/index.js';
import { CORE_WEATHER } from './environment/weather/index.js';
import { OCEAN_RESOURCES } from './environment/water/index.js';
import { STYLE_PACKS } from './styles/style-packs/index.js';

/** Anything in the library: every entry carries its `.genvr` manifest. */
export interface LibraryEntry {
  manifest: GenvrManifest;
}

/**
 * The whole Core Library, grouped by the store taxonomy (docs/GENVR-FORMAT.md): 3D models,
 * environment (roads, sky, weather), styles, avatar and appearance; 2D, audio, gameplay scripts, and visual effects join the
 * same way in their own folders.
 */
export const LIBRARY: readonly LibraryEntry[] = [
  ...CORE_ITEMS,
  ...DRAWN_ITEMS,
  ...ROAD_TYPES,
  ...CORE_SKIES,
  ...CORE_WEATHER,
  ...OCEAN_RESOURCES,
  ...CORE_SURFACES,
  ...GROUND_MATERIALS,
  ...CORE_BLOCKS,
  ...STYLE_PACKS,
  ...CORE_ANIMATIONS,
  ...CORE_WEARABLES,
  ...AVATAR_BODIES,
];

/** Filters shared by the build catalogs, the avatar panel, and later the store. */
export interface LibraryFilter {
  type?: ItemType | readonly ItemType[];
  category?: Category;
  /** One subcategory, or any of several. */
  subcategory?: string | readonly string[];
  /** Art style of the world: only items made for it. */
  style?: Style;
  /** Words in the name or id. */
  text?: string;
  /** Free items, or items sold for coins (subscription items count as paid). */
  price?: 'free' | 'paid';
  /** Genvr Core, creators, or AI-made items. */
  source?: ItemSource;
}

export function queryLibrary<T extends LibraryEntry = LibraryEntry>(
  filter: LibraryFilter = {},
  entries: readonly T[] = LIBRARY as readonly T[],
): T[] {
  const types = filter.type === undefined ? null : ([] as ItemType[]).concat(filter.type);
  const words = (filter.text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter(({ manifest }) => {
    if (types && !types.includes(manifest.type)) return false;
    if (filter.category && manifest.category !== filter.category) return false;
    const subcategories =
      filter.subcategory === undefined ? null : ([] as string[]).concat(filter.subcategory);
    if (subcategories && !subcategories.includes(manifest.subcategory)) return false;
    if (filter.style && !manifest.styles.includes(filter.style)) return false;
    if (filter.price && (manifest.price.type === 'free') !== (filter.price === 'free')) return false;
    if (filter.source && manifest.source !== filter.source) return false;
    const haystack = `${manifest.name} ${manifest.id}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** Price label of an item for the catalogs: "Free", "Plus", or its price in coins. */
export function priceLabel(manifest: GenvrManifest): string {
  if (manifest.price.type === 'free') return 'Free';
  if (manifest.price.type === 'subscription') return 'Plus';
  return `${manifest.price.coins} coins`;
}

const byId = new Map(LIBRARY.map((entry) => [entry.manifest.id, entry]));

export const getLibraryItem = (id: string): LibraryEntry | undefined => byId.get(id);
