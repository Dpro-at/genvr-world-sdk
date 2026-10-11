import { GenvrManifest } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { bodyFromItem, findBody } from '../src/index.js';

// Uploaded bodies (plan 2026-10-03, Task 2): a body item becomes an AvatarBody built the way our mesh bodies are, so
// the runtime's skeleton, binding and clips work on it unchanged. The anime boy's own data is the reference.

const boy = findBody('anime-boy');
const manifest = GenvrManifest.parse({
  schemaVersion: 1,
  id: 'user.example.boy-copy',
  name: 'Boy copy',
  version: '1.0.0',
  type: 'avatar',
  category: 'avatar-appearance',
  subcategory: 'bodies',
  styles: ['anime'],
  author: { id: 'example', name: 'Example' },
  source: 'user',
  license: 'genvr-user',
  price: { type: 'free' },
  budget: { triangles: 15000, textureMB: 4, mobileReady: true },
  trainingConsent: false,
  body: {
    model: 'body.glb',
    picture: 'picture.webp',
    height: 1.6,
    joints: boy.joints.map(({ name, parent, at }) => ({ name, parent, at: [...at] })),
  },
});

describe('bodyFromItem', () => {
  it("builds a mesh body like the anime boy's from the item's data and file links", () => {
    const body = bodyFromItem(manifest, {
      model: 'https://files.example/body.glb',
      picture: 'https://files.example/p.webp',
    })!;
    expect(body.id).toBe('user.example.boy-copy');
    expect(body.model).toBe('https://files.example/body.glb');
    expect(body.picture).toBe('https://files.example/p.webp');
    expect(body.bonePrefix).toBe(boy.bonePrefix);
    expect(body.joints).toEqual(boy.joints);
    expect(body.animation).toEqual(boy.animation);
    expect(body.parts).toEqual([]);
    expect(body.fit).toEqual({});
    expect(body.flat).toBeUndefined();
  });

  it('gives nothing for an item that is not a body or lacks the core bones', () => {
    expect(bodyFromItem({ ...manifest, body: undefined }, { model: 'm' })).toBeNull();
    const noHead = {
      ...manifest,
      body: { ...manifest.body!, joints: manifest.body!.joints.filter((j) => j.name !== 'Head') },
    };
    expect(bodyFromItem(noHead, { model: 'm' })).toBeNull();
  });
});
