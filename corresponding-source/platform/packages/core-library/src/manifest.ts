import {
  GenvrManifest,
  type Category,
  type ItemType,
  type PlacementRules,
  type Style,
} from '@genvr/contracts';

/** Every art style: items that look right in any world (animations, sounds, scripts). */
export const ALL_STYLES: readonly Style[] = ['blocky', 'realistic', 'anime', 'voxel'];

export interface CoreManifestInput {
  id: string;
  name: string;
  type: ItemType;
  category: Category;
  subcategory: string;
  styles?: readonly Style[];
  collider?: 'none' | 'box';
  triangles?: number;
  placement?: PlacementRules;
  /** Players climb it (manifest `physics.climbable`). */
  climbable?: boolean;
  /** A tool a player holds (manifest `tool`). */
  tool?: GenvrManifest['tool'];
  /** A map marker of the rules (manifest `marker`). */
  marker?: GenvrManifest['marker'];
}

/**
 * Manifest of a free Core Library item, in the same `.genvr` format as store items, so core,
 * store, and user items go through one pipeline (docs/CORE-LIBRARY.md "Organization").
 */
export function coreManifest(input: CoreManifestInput): GenvrManifest {
  return GenvrManifest.parse({
    schemaVersion: 1,
    id: input.id,
    name: input.name,
    version: '1.0.0',
    type: input.type,
    category: input.category,
    subcategory: input.subcategory,
    styles: [...(input.styles ?? ['blocky'])],
    author: { id: 'genvr', name: 'Genvr' },
    source: 'core',
    license: 'genvr-core-free',
    price: { type: 'free' },
    ...(input.type === 'model'
      ? { physics: { collider: input.collider ?? 'box', ...(input.climbable ? { climbable: true } : {}) } }
      : {}),
    ...(input.tool ? { tool: input.tool } : {}),
    ...(input.marker ? { marker: input.marker } : {}),
    budget: { triangles: input.triangles ?? 0, textureMB: 0, mobileReady: true },
    ...(input.placement ? { placement: input.placement } : {}),
    trainingConsent: true,
  });
}
