import type { GenvrManifest, RestRule } from '@genvr/contracts';
import type { CoreItem } from './3d-models/_parts.js';

/** Things that lie on the ground and follow its slope rather than standing up (P2-43). */
const LIES_DOWN = /(^|[.-])(rock|rocks|stone|boulder|log|pebble)s?([.-]|$)/;

/** Half the width of a trunk-sized base: at most 0.3 m, or 15 % of the item's width. Null if bounds are not finite. */
function trunk(bounds: {
  min: readonly number[];
  max: readonly number[];
}): NonNullable<RestRule['base']> | null {
  // Only calculate base for finite bounds (avoid NaN from empty parts or missing style looks).
  if (!Number.isFinite(bounds.min[0]) || !Number.isFinite(bounds.max[0])) return null;
  const cx = (bounds.min[0]! + bounds.max[0]!) / 2;
  const cz = (bounds.min[2]! + bounds.max[2]!) / 2;
  const half = Math.min(
    0.3,
    0.15 * Math.min(bounds.max[0]! - bounds.min[0]!, bounds.max[2]! - bounds.min[2]!),
  );
  return { min: [cx - half, cz - half], max: [cx + half, cz + half] };
}

/**
 * How a Core item rests (P2-43, decision 116): its manifest's rule if it has one, otherwise the
 * default for its group. Written once per item; looks per style change the bounds, never the mode.
 */
export function restRule(
  item: CoreItem,
  bounds: { min: readonly number[]; max: readonly number[] },
): RestRule {
  const manifest = item.manifest;
  if (manifest.physics?.floats) return { mode: 'float' };
  const written = manifest.placement?.rest;
  if (written) return written;
  if (item.grid != null || item.resizable) return { mode: 'upright', sink: 0 };
  if (item.group === 'buildings') return { mode: 'grade' };
  if (item.group === 'nature') {
    if (LIES_DOWN.test(manifest.id)) {
      return { mode: 'tilt', sink: 0.1 };
    }
    const base = trunk(bounds);
    return base ? { mode: 'upright', sink: 0.3, base } : { mode: 'upright', sink: 0.3 };
  }
  return { mode: 'upright', sink: 0.05 };
}

/** An uploaded package's rule: its manifest's rule, `float` when made to float, else upright. */
export function packageRestRule(manifest: GenvrManifest): RestRule {
  if (manifest.physics?.floats) return { mode: 'float' };
  return manifest.placement?.rest ?? { mode: 'upright', sink: 0.05 };
}
