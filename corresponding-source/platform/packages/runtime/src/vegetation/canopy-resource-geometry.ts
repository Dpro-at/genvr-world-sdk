/** Tidewater4811ba48 resource preparation. MIT; LICENSE-tidewater.md. */
import { Box3, Matrix4, Vector3 } from 'three/webgpu';
import { buildTreeNear, TREE_H, TREE_VARIANTS } from './forest-tree-geometry.js';
import {
  buildShrubNear,
  SHRUB_H,
  SHRUB_VARIANTS,
  LOBE_TABLE,
  lobeVariantGeometry,
} from './shrub-geometry.js';

export type CanopyKind = 'tree' | 'shrub';
export interface CanopyResourceDefinition {
  kind: CanopyKind;
  /** Original continuous Scatter seed, independent of fixed topology seeds21/31. */
  appearanceSeed: number;
  size: number;
  stretch: number;
}

/** Exact source metadata mapping; fail invalid authoring inputs before allocating geometry. */
export function canopyResourceData(definition: CanopyResourceDefinition) {
  const { kind, appearanceSeed, size, stretch } = definition;
  if (kind !== 'tree' && kind !== 'shrub') throw new RangeError('Unknown canopy kind');
  if (!Number.isFinite(appearanceSeed) || appearanceSeed < 0 || appearanceSeed >= 1)
    throw new RangeError('Canopy appearanceSeed must be in [0, 1)');
  if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(stretch) || stretch <= 0)
    throw new RangeError('Canopy size and stretch must be finite and positive');
  const shrub = kind === 'shrub';
  // Attributes, literals and each WGSL operation use f32. Preserve the authored seed in
  // definition, but choose exactly the same lobe row as the live near/far shaders.
  const seedProduct = Math.fround(Math.fround(appearanceSeed) * Math.fround(7.77));
  const fraction = Math.fround(seedProduct - Math.floor(seedProduct));
  const variant = Math.floor(Math.fround(fraction * (shrub ? SHRUB_VARIANTS : TREE_VARIANTS)));
  return {
    variant,
    lobeOffset: ((shrub ? TREE_VARIANTS : 0) + variant) * 8,
    height: (shrub ? SHRUB_H : TREE_H) * size * stretch,
    signedStretch: shrub ? -stretch : stretch,
  };
}

/** Owned raw and static variant geometries for the future item generator/binding.
 * Static geometry is the source atlas pose, not a wind-deformed frame. Runtime
 * uses raw geometry and the same continuous seed; never applies lobe contraction twice.
 */
export function buildCanopyResourceGeometry(definition: CanopyResourceDefinition) {
  const data = canopyResourceData(definition);
  const source = (definition.kind === 'tree' ? buildTreeNear() : buildShrubNear()).geometry;
  const preview = lobeVariantGeometry(source, LOBE_TABLE, data.lobeOffset);
  preview.applyMatrix4(
    new Matrix4().makeScale(definition.size, definition.size * definition.stretch, definition.size),
  );
  preview.computeBoundingBox();
  preview.computeBoundingSphere();
  const trunk = new Box3(),
    point = new Vector3();
  const parts = preview.getAttribute('aMat'),
    positions = preview.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    if (parts.getX(i) < 0.5 || parts.getX(i) > 4.5)
      trunk.expandByPoint(point.fromBufferAttribute(positions, i));
  }
  let disposed = false;
  return {
    source,
    preview,
    definition: { ...definition },
    ...data,
    trunk,
    dispose() {
      if (disposed) return;
      disposed = true;
      preview.dispose();
      source.dispose();
    },
  };
}
