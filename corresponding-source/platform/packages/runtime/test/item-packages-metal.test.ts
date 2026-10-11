import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Texture } from 'three/webgpu';
import { modelParts } from '../src/item-packages.js';

describe('modelParts materials', () => {
  it('draws untextured full metal as plain colour and keeps real metal', () => {
    const plain = new MeshStandardMaterial({ metalness: 1 });
    const textured = new MeshStandardMaterial({ metalness: 1, metalnessMap: new Texture() });
    const half = new MeshStandardMaterial({ metalness: 0.5 });
    const basic = new MeshBasicMaterial();
    const scene = new Group();
    for (const material of [plain, textured, half, basic]) scene.add(new Mesh(new BoxGeometry(), material));
    modelParts(scene);
    expect(plain.metalness).toBe(0);
    expect(textured.metalness).toBe(1);
    expect(half.metalness).toBe(0.5);
  });
});
