import { describe, expect, it } from 'vitest';
import { meleeTargets, pickSpawn } from '../src/index.js';

const tool = { damage: 25, reach: 2.5, arcDeg: 90, cooldownSec: 0.6 };

describe('meleeTargets', () => {
  it('hits in front within reach, nearest first, and not behind or too far', () => {
    const others = [
      { id: 'far', x: 0, z: 3.5 }, { id: 'near', x: 0, z: 1 }, { id: 'edge', x: 1.4, z: 1.5 },
      { id: 'behind', x: 0, z: -1 }, { id: 'side', x: 2, z: 0 },
    ];
    expect(meleeTargets({ x: 0, z: 0, yaw: 0 }, tool, others, 0.5)).toEqual(['near', 'edge']);
  });

  it('turns with yaw', () => {
    expect(meleeTargets({ x: 0, z: 0, yaw: Math.PI / 2 }, tool, [{ id: 'east', x: 2, z: 0 }], 0)).toEqual(['east']);
  });
});

describe('pickSpawn', () => {
  const spots = [
    { x: 0, y: 0, z: 0, team: 'any' as const }, { x: 50, y: 0, z: 0, team: 'any' as const },
    { x: -50, y: 0, z: 0, team: 'red' as const },
  ];
  it('picks the spot farthest from opponents', () => {
    expect(pickSpawn(spots.slice(0, 2), null, [{ x: 45, z: 0 }])).toMatchObject({ x: 0 });
  });
  it('uses team spots when the team has any', () => {
    expect(pickSpawn(spots, 'red', [{ x: -45, z: 0 }])).toMatchObject({ x: -50 });
    expect(pickSpawn(spots, 'blue', [])?.team).toBe('any');
  });
  it('returns null with no spots', () => {
    expect(pickSpawn([], null, [])).toBeNull();
  });
});
