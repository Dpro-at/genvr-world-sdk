/** Per-batch source canopy attributes; ordinary ItemsView matrices remain authoritative. */
import {
  BufferAttribute,
  DynamicDrawUsage,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
  TSL,
  type BufferGeometry,
  type InstancedMesh,
} from 'three/webgpu';
import { canopyResourceData, type CanopyResourceDefinition } from './canopy-resource-geometry.js';
const STRIDE = 25;

/** Requires an identity parent render group, matching ItemsView. Unsupported tilt/reflection/nonuniform
 * horizontal scaling selects the baked static pose in the shader; the user's transform is never discarded. */
export function bindCanopyInstanceAttributes(
  mesh: InstancedMesh,
  source: BufferGeometry,
  definition: CanopyResourceDefinition,
) {
  definition = { ...definition };
  const metadata = canopyResourceData(definition);
  const original = mesh.geometry,
    position = source.getAttribute('position'),
    normal = source.getAttribute('normal');
  if (original.getAttribute('position').count !== position.count)
    throw new Error('Canopy source and baked vertex counts differ');
  const geometry = original.clone(),
    data = new Float32Array(mesh.instanceMatrix.count * STRIDE);
  const buffer = new InstancedInterleavedBuffer(data, STRIDE).setUsage(DynamicDrawUsage);
  const attribute = (name: string, size: number, offset: number) =>
    geometry.setAttribute(name, new InterleavedBufferAttribute(buffer, size, offset));
  attribute('iPos', 4, 0);
  attribute('iDat', 4, 4);
  for (let j = 0; j < 4; j++) attribute(`twCanopyMatrix${j}`, 4, 8 + j * 4);
  attribute('twCanopyEnabled', 1, 24);
  for (const [name, sourceAttribute] of [
    ['twCanopySourcePosition', position],
    ['twCanopySourceNormal', normal],
  ] as const) {
    const values = new Float32Array(position.count * 3);
    for (let n = 0; n < position.count; n++)
      values.set([sourceAttribute.getX(n), sourceAttribute.getY(n), sourceAttribute.getZ(n)], n * 3);
    geometry.setAttribute(name, new BufferAttribute(values, 3));
  }
  mesh.geometry = geometry;
  const oldCulling = mesh.frustumCulled;
  mesh.frustumCulled = false;
  const matrix = new Matrix4(),
    sourceMatrix = new Matrix4(),
    shape = new Matrix4().makeScale(definition.size, definition.size * definition.stretch, definition.size),
    translation = new Vector3(),
    rotation = new Quaternion(),
    scale = new Vector3();
  let version = -1,
    count = -1,
    disposed = false;
  const update = () => {
    if (disposed || (version === mesh.instanceMatrix.version && count === mesh.count)) return false;
    if (!Number.isInteger(mesh.count) || mesh.count < 0 || mesh.count > mesh.instanceMatrix.count)
      throw new Error('Canopy instance count exceeds capacity');
    for (let n = 0; n < mesh.count; n++) {
      mesh.getMatrixAt(n, matrix);
      if (!matrix.elements.every(Number.isFinite)) throw new Error('Canopy instance matrix must be finite');
      matrix.decompose(translation, rotation, scale);
      const e = matrix.elements,
        o = n * STRIDE;
      const upright = Math.abs(rotation.x) < 1e-5 && Math.abs(rotation.z) < 1e-5;
      const uniform = scale.x > 1e-6 && scale.y > 1e-6 && Math.abs(scale.x - scale.z) < 1e-5;
      const enabled = upright && uniform && e.every(Number.isFinite);
      const yaw =
        Number.isFinite(rotation.y) && Number.isFinite(rotation.w)
          ? 2 * Math.atan2(rotation.y, rotation.w)
          : 0;
      data.set(
        [
          translation.x,
          translation.y,
          translation.z,
          definition.size * Math.max(Math.abs(scale.x), 1e-6),
          yaw,
          (metadata.signedStretch * Math.max(Math.abs(scale.y), 1e-6)) / Math.max(Math.abs(scale.x), 1e-6),
          metadata.height * Math.max(Math.abs(scale.y), 1e-6),
          definition.appearanceSeed,
        ],
        o,
      );
      sourceMatrix.multiplyMatrices(matrix, shape);
      data.set(sourceMatrix.elements, o + 8);
      data[o + 24] = enabled ? 1 : 0;
    }
    buffer.clearUpdateRanges();
    buffer.addUpdateRange(0, mesh.count * STRIDE);
    buffer.needsUpdate = true;
    version = mesh.instanceMatrix.version;
    count = mesh.count;
    return true;
  };
  const beforeRender = mesh.onBeforeRender,
    beforeShadow = mesh.onBeforeShadow;
  const render: typeof mesh.onBeforeRender = function (this: InstancedMesh, ...args) {
    update();
    beforeRender.apply(this, args);
  };
  const shadow: typeof mesh.onBeforeShadow = function (this: InstancedMesh, ...args) {
    update();
    beforeShadow.apply(this, args);
  };
  mesh.onBeforeRender = render;
  mesh.onBeforeShadow = shadow;
  return {
    data,
    buffer,
    update,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (mesh.onBeforeRender === render) mesh.onBeforeRender = beforeRender;
      if (mesh.onBeforeShadow === shadow) mesh.onBeforeShadow = beforeShadow;
      if (mesh.geometry === geometry) {
        mesh.geometry = original;
        mesh.frustumCulled = oldCulling;
      }
      geometry.dispose();
    },
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL graph boundary */
/** World-space source position/normal from the original vertex and the existing instance matrix. */
export function canopyInstanceNodes(): { position: any; normal: any; enabled: any; trunkDirection: any } {
  const t = TSL as any,
    m = t.mat4(...[0, 1, 2, 3].map((i) => t.attribute(`twCanopyMatrix${i}`, 'vec4')));
  const p = m.mul(t.vec4(t.attribute('twCanopySourcePosition', 'vec3'), 1)).xyz;
  const a = m.element(0).xyz,
    b = m.element(1).xyz,
    c = m.element(2).xyz;
  const scale = t.vec3(t.dot(a, a), t.dot(b, b), t.dot(c, c)).max(1e-12);
  // Preserve original vegInstanceNormal inverse-transpose magnitude for leaf flutter. This
  // intentionally does not normalize; the surface stage normalizes its shading normal.
  const n = t.mat3(a, b, c).mul(t.attribute('twCanopySourceNormal', 'vec3').div(scale));
  return {
    position: p,
    normal: n,
    enabled: t.attribute('twCanopyEnabled', 'float').greaterThan(0.5),
    trunkDirection: b.normalize(),
  };
}
