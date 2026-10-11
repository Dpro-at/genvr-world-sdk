import { Box3, Color, DoubleSide, Float32BufferAttribute, MeshStandardMaterial, Vector3, type BufferGeometry } from 'three/webgpu';
import type { Generator } from '../generators.js';
import type { PalmInstanceDefinition } from './instance-attributes.js';
import { bakePlantPose } from './deformation-cpu.js';
import { buildPalmFar, buildPalmNear } from './palm-geometry.js';
import { mulberry32 } from './forest-tree-geometry.js';

export const PALM_GENERATOR = 'tidewater.palm';
export const PALM_PREVIEW_MATERIAL = 'tidewater.palm.preview';
export interface PalmGeometryBinding { source: BufferGeometry; definition: PalmInstanceDefinition; level: number }
const bindings = new WeakMap<BufferGeometry, PalmGeometryBinding>();
export const palmGeometryBinding = (geometry: BufferGeometry): PalmGeometryBinding | undefined => bindings.get(geometry);
export const createPalmPreviewMaterial = () => new MeshStandardMaterial({ vertexColors: true, roughness: .85, side: DoubleSide });

/** Pure generated geometry; no world nodes, live shaders or borrowed textures enter this cache. */
export const palmGenerator: Generator = {
  build(params) {
    const number = (key: string, fallback: number, min: number, max: number) => {
      const value = params[key];
      return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
    };
    const seed = Math.floor(number('seed', 11, 0, 65535));
    const definition: PalmInstanceDefinition = { seed: mulberry32(seed)(), height: number('height', 10, 3, 20),
      lean: number('lean', .12, 0, .4), leanAngle: number('leanAngle', .3, 0, Math.PI * 2) };
    const trunk = new Box3(), point = new Vector3();
    const levels = [buildPalmNear(seed), buildPalmFar(seed)].map(({ geometry: source }, level) => {
      const geometry = bakePlantPose(source, definition.height, definition.seed, definition.lean, definition.leanAngle);
      const positions = geometry.getAttribute('position'), parts = geometry.getAttribute('aMat');
      const colors = new Float32Array(positions.count * 3);
      const bark = new Color('#776049'), leaf = new Color('#537d35'), dead = new Color('#817047');
      for (let i = 0; i < positions.count; i++) {
        const stem = parts.getX(i) < .5, nut = parts.getX(i) > 4.5;
        const color = stem || nut ? bark : parts.getY(i) >= .9 ? dead : leaf;
        colors.set([color.r, color.g, color.b], i * 3);
        if (level === 0 && stem) trunk.expandByPoint(point.fromBufferAttribute(positions, i));
      }
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
      bindings.set(geometry, { source, definition: { ...definition }, level });
      return [{ geometry, material: PALM_PREVIEW_MATERIAL }];
    });
    return { levels, blocks: { min: trunk.min.toArray(), max: trunk.max.toArray() } };
  },
};
