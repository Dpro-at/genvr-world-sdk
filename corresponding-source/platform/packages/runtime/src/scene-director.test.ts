import { expect, it } from 'vitest';
import { SceneAnimationLayer, scenePose } from './scene-director.js';
it('timed Sit overlays both standing and seated gameplay without toggling their state', () => {
  const layer = new SceneAnimationLayer();
  for (const base of ['Idle', 'Sit', 'Dance']) {
    layer.start('Sit', null); expect(layer.resolve(base, null)).toBe('Sit');
    layer.stop(); expect(layer.resolve(base, null)).toBe(base);
  }
  layer.start('Dance', null); expect(layer.resolve('Idle', 'Sit')).toBe('Sit');
  layer.stop(); expect(layer.resolve('Run', null)).toBe('Run');
});
it('once-only scene clips expire without replacing the latest native gameplay pose', () => {
  const layer = new SceneAnimationLayer(); layer.start('Backflip', .5);
  layer.update(.2); expect(layer.resolve('Walk', null)).toBe('Backflip');
  layer.update(.3); expect(layer.active).toBe(false); expect(layer.resolve('Run', null)).toBe('Run');
});
it('object choreography preserves source pose and returns reproducible timed transforms', () => {
  const base = { x: 1, y: 2, z: 3, yaw: .1, roll: .2 };
  expect(scenePose(base, 'bob', .25).y).toBeCloseTo(2.2);
  expect(scenePose(base, 'spin', 1).yaw).toBeCloseTo(Math.PI + .1);
  expect(scenePose(base, 'dance', .25).roll).toBeCloseTo(.4);
  expect(base).toEqual({ x: 1, y: 2, z: 3, yaw: .1, roll: .2 });
  expect(scenePose(base, 'dance', .25)).toEqual(scenePose(base, 'dance', .25));
});
