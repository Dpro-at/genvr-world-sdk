/** Tidewater4811ba48 canopy geometry adapter, MIT; LICENSE-tidewater.md. */
import {
  Box3,
  Vector3,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  MeshStandardMaterial,
  type BufferGeometry,
} from 'three/webgpu';
import type { Generator } from '../generators.js';
import {
  buildCanopyResourceGeometry,
  type CanopyKind,
  type CanopyResourceDefinition,
} from './canopy-resource-geometry.js';
export const CANOPY_TREE_GENERATOR = 'tidewater.tree';
export const CANOPY_SHRUB_GENERATOR = 'tidewater.shrub';
export const CANOPY_PREVIEW_MATERIAL = 'tidewater.canopy.preview';
export interface CanopyGeometryBinding {
  source: BufferGeometry;
  definition: CanopyResourceDefinition;
  level: 0 | 1;
  /** Full source bark envelope, separate from authored low-stem collider policy. */
  barkBounds: { min: [number, number, number]; max: [number, number, number] };
}
const bindings = new WeakMap<BufferGeometry, CanopyGeometryBinding>();
export const canopyGeometryBinding = (geometry: BufferGeometry): CanopyGeometryBinding | undefined =>
  bindings.get(geometry);
/** Coarse static fallback only; the world owner supplies source atlas cutouts and lighting. */
export const createCanopyPreviewMaterial = () =>
  new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: DoubleSide });
function makeGenerator(kind: CanopyKind): Generator {
  return {
    impostor: true,
    build(params) {
      const number = (key: string, fallback: number, min: number, max: number) => {
        const v = params[key];
        return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
      };
      const definition: CanopyResourceDefinition = {
        kind,
        appearanceSeed: number('appearanceSeed', 0.37, 0, 0.9999999999999999),
        size: number('size', 1, 0.25, 3),
        stretch: number('stretch', 1, 0.5, 2),
      };
      const built = buildCanopyResourceGeometry(definition),
        geometry = built.preview;
      // Source species thresholds in attribute f32 precision; this static fallback does not
      // claim procedural card/atlas shading parity. Live materials use CANOPY_SURFACE_WGSL.
      const seed = Math.fround(definition.appearanceSeed),
        fract = (n: number) => Math.fround(n - Math.floor(n));
      const s = fract(Math.fround(seed * Math.fround(kind === 'tree' ? 5.31 : 3.17)));
      const species =
        kind === 'tree'
          ? Math.floor(Math.fround(s * 4))
          : s < Math.fround(0.45)
            ? 0
            : s < Math.fround(0.6)
              ? 1
              : 2;
      const palettes =
        kind === 'tree' ? [0x364a23, 0x485c27, 0x646a31, 0x3a4a36] : [0x52662a, 0x44561f, 0x466624];
      const leaf = new Color(palettes[species]!),
        bark = new Color(0x5c5549),
        parts = geometry.getAttribute('aMat'),
        colors = new Float32Array(parts.count * 3);
      for (let i = 0; i < parts.count; i++) {
        const part = parts.getX(i),
          color = part < 0.5 || part > 4.5 ? bark : leaf;
        colors.set([color.r, color.g, color.b], i * 3);
      }
      const collider = new Box3(),
        point = new Vector3(),
        positions = geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++)
        if (
          (parts.getX(i) < 0.5 || parts.getX(i) > 4.5) &&
          positions.getY(i) <= 2 * definition.size * definition.stretch
        )
          collider.expandByPoint(point.fromBufferAttribute(positions, i));
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
      // Both cached fallback levels stay full geometry. The world owner substitutes its own
      // quad clone for level1, never mutating cached fallback or applying lobe contraction twice.
      const levels = ([geometry, geometry.clone()] as const).map((g, level) => {
        bindings.set(g, {
          source: built.source,
          definition: { ...definition },
          level: level as 0 | 1,
          barkBounds: { min: built.trunk.min.toArray(), max: built.trunk.max.toArray() },
        });
        return [{ geometry: g, material: CANOPY_PREVIEW_MATERIAL }];
      });
      return { levels, blocks: { min: collider.min.toArray(), max: collider.max.toArray() } };
    },
  };
}
/** Registration belongs to the runtime integration owner. No side effects on import. */
export const canopyTreeGenerator = makeGenerator('tree');
export const canopyShrubGenerator = makeGenerator('shrub');
