import type { GenvrManifest, GroundMaterialRef, SoilName } from '@genvr/contracts';
import { coreManifest } from '../../manifest.js';

/**
 * What a ground material looks like at a glance (paint list groups, P2-37). `facade` and `roof` are the surfaces of
 * real buildings (R4b): in the library, not in the ground paint list.
 */
export type GroundKind = 'grass' | 'ground' | 'rock' | 'snow' | 'sand' | 'road' | 'bricks' | 'facade' | 'roof';

/** One texture set of a ground material, at one size. */
export interface GroundFiles {
  size: 1024 | 512;
  /** RGB color, A ambient occlusion (WebP). */
  color: string;
  /** RG normal, B roughness, A height (WebP). */
  surface: string;
  /** Bytes of both files. */
  bytes: number;
}

export interface GroundMaterial {
  manifest: GenvrManifest;
  /** File name, e.g. `grass-004`. */
  name: string;
  /** The soil it counts as: footsteps, item rules, and its color in other styles. */
  soil: SoilName;
  kind: GroundKind;
  /** Meters one texture covers on the ground. */
  tile: number;
  files: readonly GroundFiles[];
  /** 256 px picture for the library and the paint list. */
  picture: string;
  /** Source provenance: photo sets are CC0; procedural source ports retain their own license. */
  source: { name: string; page: string; license: 'CC0' | 'MIT' };
  /** Optional procedural surface. Image fallback is used on devices without the required renderer. */
  procedural?: {
    generator: 'tidewater-ground';
    variant: 'beach-sand' | 'seabed-sand' | 'rock' | 'grass' | 'dirt' | 'rubble' | 'seagrass';
    fallback: string;
  };
}

/**
 * A realistic ground material: generated CC0 image sets or attributed procedural source ports;
 * the file lives at `environment/ground/<name>.ts` (id `genvr.core.ground.<name>`).
 */
export function defineGround(ground: Omit<GroundMaterial, 'manifest'> & { title: string }): GroundMaterial {
  const { title, ...rest } = ground;
  const largest = ground.files.find((files) => files.size === 1024) ?? ground.files[0];
  return {
    manifest: {
      ...coreManifest({
        id: `genvr.core.ground.${ground.name}`,
        name: title,
        type: 'material',
        category: 'environment',
        subcategory: 'ground',
        styles: ['realistic'],
      }),
      budget: {
        triangles: 0,
        // Procedural resources share a 512-square RGBA detail texture including mipmaps.
        textureMB: ground.procedural ? 1.4 : Math.round(((largest?.bytes ?? 0) / 1e6) * 10) / 10,
        mobileReady: true,
      },
    },
    ...rest,
  };
}

/** The reference a place's ground palette stores for a material. */
export function groundRef(material: GroundMaterial): GroundMaterialRef {
  return { id: material.manifest.id, soil: material.soil };
}
