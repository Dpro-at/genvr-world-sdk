import { MOUTH_SHAPES } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { createGenvrAvatar, DEFAULT_LOOK } from '../src/avatar.js';
import { MOUTH_GAP, mouthAtlas } from '../src/mouth.js';

// Lip sync (P2-44, plan Task 2): block bodies show the nine mouth shapes on a small surface on the head, in front of
// the face (never flickering against it); the mouth block is gone from the body.

describe('the mouth of block bodies', () => {
  it('draws all nine shapes in one strip, each with something to see', () => {
    const atlas = mouthAtlas();
    const { width, height, data } = atlas.image as { width: number; height: number; data: Uint8Array };
    expect(width).toBe(16 * MOUTH_SHAPES.length);
    for (let frame = 0; frame < MOUTH_SHAPES.length; frame += 1) {
      let seen = 0;
      for (let y = 0; y < height; y += 1)
        for (let x = 0; x < 16; x += 1) if (data[(y * width + frame * 16 + x) * 4 + 3]! > 0) seen += 1;
      expect(seen, MOUTH_SHAPES[frame]).toBeGreaterThan(0);
    }
  });

  it('a Classic avatar has a mouth on its head, in front of the face, that shows the shape it is given', () => {
    const avatar = createGenvrAvatar(DEFAULT_LOOK);
    let mouth: { name: string; position: { z: number }; parent: { name: string } | null } | undefined;
    avatar.root.traverse((object) => {
      if (object.name === 'avatar-mouth') mouth = object as never;
    });
    expect(mouth).toBeDefined();
    expect(mouth!.parent!.name).toMatch(/Head$/);
    expect(mouth!.position.z).toBeGreaterThan(MOUTH_GAP);
    expect(avatar.mouth).toBe('X');
    avatar.setMouth('D');
    expect(avatar.mouth).toBe('D');
    // A new body keeps the shape.
    avatar.setLook({ ...DEFAULT_LOOK, body: 'simple' });
    expect(avatar.mouth).toBe('D');
    avatar.setMouth('X');
    expect(avatar.mouth).toBe('X');
  });

  it('the mouth block is no longer part of the body', () => {
    const avatar = createGenvrAvatar(DEFAULT_LOOK);
    const colors = avatar.mesh.geometry.getAttribute('color');
    // The mouth block's color (#b5524a) is not drawn in the body any more.
    let mouthVertices = 0;
    for (let i = 0; i < colors.count; i += 1)
      if (Math.abs(colors.getX(i) - 0.4621) < 0.02 && Math.abs(colors.getY(i) - 0.0865) < 0.02)
        mouthVertices += 1;
    expect(mouthVertices).toBe(0);
  });
});
