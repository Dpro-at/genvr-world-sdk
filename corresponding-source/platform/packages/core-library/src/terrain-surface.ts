import { TerrainActiveSurface, TerrainFieldDescriptor } from '@genvr/contracts';
import type { SoilName } from '@genvr/contracts';
import { getGround } from './environment/ground/index.js';
export type NativeGroundVariant =
  'beach-sand' | 'seabed-sand' | 'rock' | 'grass' | 'dirt' | 'seagrass' | 'rubble';
export interface ResolvedTerrainSurface {
  size: number;
  levels: number;
  bindings: {
    variant: NativeGroundVariant;
    soil: SoilName;
    inputs: Record<string, { channel: string; scale: number }>;
  }[];
}
const INPUTS: Record<NativeGroundVariant, readonly string[]> = {
  'beach-sand': ['coverage'],
  'seabed-sand': [],
  rock: ['coverage', 'scarp'],
  grass: ['coverage'],
  dirt: ['coverage'],
  seagrass: ['coverage'],
  rubble: ['coverage'],
};
/** Live native renderer capabilities; generic stored rasters remain unrestricted by this profile. */
export function resolveTerrainSurface(
  descriptor: TerrainFieldDescriptor,
  surface: TerrainActiveSurface,
): ResolvedTerrainSurface {
  const d = TerrainFieldDescriptor.parse(descriptor),
    s = TerrainActiveSurface.parse(surface);
  const size = d.width * d.spacing;
  const height = d.channels.find((c) => c.id === d.heightBinding?.channel);
  if (
    !height?.range ||
    !d.heightBinding ||
    height.range[0] + d.heightBinding.offset < -150 ||
    height.range[1] + d.heightBinding.offset > 450
  )
    throw new Error('Native height requires a declared range within world height bounds after offset');
  const levels = Math.log2(size / 8) + 1;
  if (!Number.isInteger(levels) || levels < 1 || levels > 16)
    throw new Error('Native terrain requires 1 to 16 LOD levels');
  if (
    s.setId !== d.id ||
    !d.heightBinding ||
    d.channels.find((c) => c.id === d.heightBinding!.channel)?.encoding !== 'f32le'
  )
    throw new Error('Native surface requires a bound Float32 height channel');
  if (
    d.width !== d.height ||
    d.origin[0] !== d.origin[1] ||
    d.origin.some((v) => v % 8 !== 0) ||
    d.sampling !== 'cell-center' ||
    d.width < 8 ||
    (d.width & (d.width - 1)) !== 0 ||
    size < 8 ||
    !Number.isInteger(Math.log2(size / 8))
  )
    throw new Error(
      'Native surface requires square power-of-two cell centres, equal 8m-aligned origins and 8m power-of-two domain',
    );
  if (!s.materialBindings?.length)
    throw new Error('Native surface requires explicit Ground material bindings');
  const seen = new Set<string>();
  const bindings = s.materialBindings.map((binding) => {
    const resource = getGround(binding.itemId);
    if (!resource?.procedural || resource.procedural.generator !== 'tidewater-ground')
      throw new Error('Unsupported native Ground resource');
    const variant = resource.procedural.variant;
    if (seen.has(variant)) throw new Error('Duplicate native Ground binding');
    seen.add(variant);
    if (Object.keys(binding.inputs).some((key) => !INPUTS[variant].includes(key)))
      throw new Error('Unsupported native Ground input');
    if (variant !== 'seabed-sand' && !binding.inputs.coverage)
      throw new Error('Ground binding requires explicit coverage');
    for (const input of Object.values(binding.inputs)) {
      if (!d.channels.some((c) => c.id === input.channel)) throw new Error('Undeclared Ground channel');
      if (input.scale < 0) throw new Error('Ground scale must be nonnegative');
    }
    return { variant, soil: resource.soil, inputs: binding.inputs };
  });
  return { size, levels, bindings };
}

/** Approximate interaction/footstep classification, separate from source visual mask equations. */
export function terrainSurfaceSoil(
  profile: ResolvedTerrainSurface,
  sample: (channel: string, x: number, z: number) => number | null,
  height: number,
  seaLevel: number,
  x: number,
  z: number,
): SoilName {
  let soil: SoilName = height <= seaLevel ? 'sand' : 'grass';
  let strongest = 0.5;
  for (const binding of profile.bindings) {
    let coverage = 0;
    for (const input of Object.values(binding.inputs)) {
      const raw = sample(input.channel, x, z);
      if (raw !== null && Number.isFinite(raw))
        coverage = Math.max(coverage, Math.min(1, Math.max(0, raw * input.scale)));
    }
    if (coverage > strongest) {
      strongest = coverage;
      soil = binding.soil;
    }
  }
  return soil;
}
