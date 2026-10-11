import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initPhysics, PhysicsWorld } from '../src/physics.js';
import { OPENING_PRESETS, TerrainData, wallBoxes } from '@genvr/world';
import { TerrainColliders } from '../src/terrain-physics.js';

const DT = 1 / 60;
const GRAVITY = 22;
const JUMP = 7;

let physics: PhysicsWorld;

beforeAll(async () => {
  await initPhysics();
});

afterEach(() => {
  physics?.dispose();
});

function run(steps: number, fn: (i: number) => void) {
  for (let i = 0; i < steps; i += 1) fn(i);
}

describe('character controller', () => {
  it('dives, stays neutrally buoyant and collides with the submerged ground', () => {
    physics = new PhysicsWorld();
    physics.addGround(50);
    const character = physics.createCharacter({ x: 0, y: 5, z: 0 });
    run(60, () => character.swimDisplacement({ x: 0, y: -2 * DT, z: 0 }, DT));
    expect(character.feet.y).toBeCloseTo(3, 1);
    const y = character.feet.y;
    run(60, () => character.swimDisplacement({ x: 0, y: 0, z: 0 }, DT));
    expect(character.feet.y).toBeCloseTo(y, 5);
    run(180, () => character.swimDisplacement({ x: 0, y: -2 * DT, z: 0 }, DT));
    expect(character.feet.y).toBeGreaterThan(-0.05);
    run(60, () => character.swimDisplacement({ x: 0, y: 2 * DT, z: 0 }, DT));
    expect(character.feet.y).toBeGreaterThan(1.9);
  });
  it('falls onto the ground and stands on it', () => {
    physics = new PhysicsWorld();
    physics.addGround(50);
    const character = physics.createCharacter({ x: 0, y: 3, z: 0 });
    run(120, () => character.move({ x: 0, z: 0 }, false, JUMP, GRAVITY, DT));
    expect(character.grounded).toBe(true);
    expect(character.feet.y).toBeGreaterThan(-0.05);
    expect(character.feet.y).toBeLessThan(0.1);
  });

  it('climbs without gravity and stops on the ground climbing down (P2-23)', () => {
    physics = new PhysicsWorld();
    physics.addGround(50);
    const character = physics.createCharacter({ x: 0, y: 0, z: 0 });
    run(60, () => character.climb({ x: 0, y: 2, z: 0 }, DT));
    expect(character.feet.y).toBeGreaterThan(1.9);
    expect(character.grounded).toBe(false);
    // Hanging still: no falling.
    run(60, () => character.climb({ x: 0, y: 0, z: 0 }, DT));
    expect(character.feet.y).toBeGreaterThan(1.9);
    run(120, () => character.climb({ x: 0, y: -2, z: 0 }, DT));
    expect(character.grounded).toBe(true);
    expect(character.feet.y).toBeLessThan(0.1);
  });

  it('walks forward at the requested speed', () => {
    physics = new PhysicsWorld();
    physics.addGround(50);
    const character = physics.createCharacter({ x: 0, y: 0, z: 0 });
    run(60, () => character.move({ x: 0, z: 4 }, false, JUMP, GRAVITY, DT));
    expect(character.feet.z).toBeGreaterThan(3.5);
    expect(character.feet.z).toBeLessThan(4.5);
  });

  it('is stopped by the world edge', () => {
    physics = new PhysicsWorld();
    physics.addGround(10);
    physics.addBounds(10);
    const character = physics.createCharacter({ x: 0, y: 0, z: 0 });
    run(300, () => character.move({ x: 8, z: 0 }, false, JUMP, GRAVITY, DT));
    expect(character.feet.x).toBeLessThan(10);
  });

  it('is blocked by a tall box but steps up a curb', () => {
    physics = new PhysicsWorld();
    physics.addGround(50);
    physics.addBox({ x: 3, y: 1.5, z: 0 }, { x: 0.5, y: 1.5, z: 5 }); // 3 m wall
    const blocked = physics.createCharacter({ x: 0, y: 0, z: 0 });
    run(120, () => blocked.move({ x: 4, z: 0 }, false, JUMP, GRAVITY, DT));
    expect(blocked.feet.x).toBeLessThan(2.5);

    physics.addBox({ x: 0, y: 0.1, z: 6 }, { x: 5, y: 0.1, z: 1 }); // 20 cm curb
    const walker = physics.createCharacter({ x: 0, y: 0, z: 3 });
    run(120, () => walker.move({ x: 0, z: 4 }, false, JUMP, GRAVITY, DT));
    expect(walker.feet.z).toBeGreaterThan(6);
  });

  it('walks up a sculpted hill using terrain colliders', () => {
    physics = new PhysicsWorld();
    const terrain = new TerrainData(128);
    // Ramp: +1 m every 4 m (about 14 degrees) up to a 3 m plateau.
    for (const start of [3, 7, 11]) {
      terrain.sculpt(
        [
          [start, -6],
          [60, -6],
          [60, 6],
          [start, 6],
        ],
        'raise',
        1,
      );
    }
    expect(terrain.heightAt(20, 0)).toBeCloseTo(3);
    const colliders = new TerrainColliders(terrain, physics);
    colliders.update(0, 0);
    const character = physics.createCharacter({ x: -4, y: 0.1, z: 0 });
    run(480, () => {
      character.move({ x: 4, z: 0 }, false, JUMP, GRAVITY, DT);
      colliders.update(character.feet.x, character.feet.z);
    });
    expect(character.feet.x).toBeGreaterThan(14);
    expect(character.feet.y).toBeGreaterThan(2.5);
    expect(Math.abs(character.feet.y - terrain.heightAt(character.feet.x, character.feet.z))).toBeLessThan(
      0.3,
    );
  });

  it('jumps and lands', () => {
    physics = new PhysicsWorld();
    physics.addGround(50);
    const character = physics.createCharacter({ x: 0, y: 0, z: 0 });
    run(10, () => character.move({ x: 0, z: 0 }, false, JUMP, GRAVITY, DT));
    let peak = 0;
    run(90, (i) => {
      character.move({ x: 0, z: 0 }, i === 0, JUMP, GRAVITY, DT);
      peak = Math.max(peak, character.feet.y);
    });
    expect(peak).toBeGreaterThan(0.8);
    expect(character.grounded).toBe(true);
  });
});

const wallFor = () => ({
  id: 'w1',
  points: [
    [-5, 5],
    [5, 5],
  ] as Array<[number, number]>,
  height: 3,
  closed: false,
  openings: [] as Array<never>,
});

describe('frame timing', () => {
  it('indexes terrain before a cold 50ms frame so an idle avatar can still walk and jump (N299)', () => {
    physics = new PhysicsWorld();
    physics.addBounds(250);
    const terrain = new TerrainData(500), colliders = new TerrainColliders(terrain, physics);
    colliders.update(0, 0);
    const character = physics.createCharacter({ x: 0, y: 0.05, z: 0 });
    character.move({ x: 0, z: 0 }, false, JUMP, GRAVITY, 0.05);
    expect(character.feet.y).toBeGreaterThan(0.01);
    run(502, () => character.move({ x: 0, z: 0 }, false, JUMP, GRAVITY, 0.05));
    run(90, () => character.move({ x: 0, z: 4 }, false, JUMP, GRAVITY, DT));
    expect(character.feet.z).toBeGreaterThan(5.5);
    let peak = 0;
    run(90, i => { character.move({ x: 0, z: 0 }, i === 0, JUMP, GRAVITY, DT); peak = Math.max(peak, character.feet.y); });
    expect(peak).toBeGreaterThan(0.8);
    expect(character.grounded).toBe(true);
  });
  it('a zero-length frame (two frames with the same timestamp) does not freeze the character', () => {
    physics = new PhysicsWorld();
    physics.addGround(50);
    const character = physics.createCharacter({ x: 0, y: 0, z: 0 });
    run(10, () => character.move({ x: 0, z: 0 }, false, JUMP, GRAVITY, DT));
    character.move({ x: 0, z: 4 }, false, JUMP, GRAVITY, 0);
    run(60, () => character.move({ x: 0, z: 4 }, false, JUMP, GRAVITY, DT));
    expect(character.feet.z).toBeGreaterThan(3.5);
  });

  it('a negative frame time (first frame timestamp before the timer started) is ignored', () => {
    physics = new PhysicsWorld();
    physics.addGround(50);
    const character = physics.createCharacter({ x: 0, y: 0.05, z: 0 });
    character.move({ x: 0, z: 0 }, false, JUMP, GRAVITY, -0.011);
    run(60, () => character.move({ x: 0, z: 4 }, false, JUMP, GRAVITY, DT));
    expect(character.feet.z).toBeGreaterThan(3.5);
  });
});

describe('idle character', () => {
  it('can still walk after standing still for a long time (the body must not fall asleep)', () => {
    physics = new PhysicsWorld();
    physics.addGround(50);
    const character = physics.createCharacter({ x: 0, y: 0, z: 0 });
    run(600, () => character.move({ x: 0, z: 0 }, false, JUMP, GRAVITY, DT));
    run(60, () => character.move({ x: 0, z: 4 }, false, JUMP, GRAVITY, DT));
    expect(character.feet.z).toBeGreaterThan(3.5);
  });
});

describe('walls', () => {
  const wall = {
    id: 'w1',
    points: [
      [-5, 5],
      [5, 5],
    ] as Array<[number, number]>,
    height: 3,
    closed: false,
    openings: [{ id: 'd1', kind: 'door' as const, segment: 0, offset: 5, ...OPENING_PRESETS.door }],
  };

  it('block the character, and a door lets it walk through', () => {
    physics = new PhysicsWorld();
    physics.addGround(50);
    physics.setStructure(
      'wall:w1',
      wallBoxes(wall, () => 0),
    );
    const blocked = physics.createCharacter({ x: 3, y: 0, z: 0 });
    const through = physics.createCharacter({ x: 0, y: 0, z: 0 });
    run(180, () => {
      blocked.move({ x: 0, z: 4 }, false, JUMP, GRAVITY, DT);
      through.move({ x: 0, z: 4 }, false, JUMP, GRAVITY, DT);
    });
    expect(blocked.feet.z).toBeLessThan(5 - 0.15 - 0.3);
    expect(through.feet.z).toBeGreaterThan(8);
  });

  it('removing a structure removes its colliders', () => {
    physics = new PhysicsWorld();
    physics.addGround(50);
    physics.setStructure(
      'wall:w1',
      wallBoxes({ ...wall, openings: [] }, () => 0),
    );
    physics.removeStructure('wall:w1');
    const character = physics.createCharacter({ x: 3, y: 0, z: 0 });
    run(180, () => character.move({ x: 0, z: 4 }, false, JUMP, GRAVITY, DT));
    expect(character.feet.z).toBeGreaterThan(8);
    expect(physics.structureKeys).toHaveLength(0);
  });
});

describe('camera sweep', () => {
  it('stops at a wall between the player and the camera, and ignores the player capsule', () => {
    physics = new PhysicsWorld();
    physics.addGround(50);
    physics.setStructure(
      'wall:w1',
      wallBoxes({ ...wallFor(), openings: [] }, () => 0),
    );
    const character = physics.createCharacter({ x: 0, y: 0, z: 0 });
    physics.step(DT);
    const head = { x: 0, y: 1.5, z: 0 };
    // Wall face at z = 5 - 0.15; sphere radius 0.25 touches it after about 4.6 m.
    const blocked = physics.sweepSphere(head, { x: 0, y: 0, z: 1 }, 9, 0.25, character);
    expect(blocked).toBeGreaterThan(4.4);
    expect(blocked).toBeLessThan(4.7);
    const clear = physics.sweepSphere(head, { x: 0, y: 0, z: -1 }, 9, 0.25, character);
    expect(clear).toBe(9);
  });
});

describe('side-view moves (decision 95)', () => {
  /** A 0.4 m thick platform from x -2 to 2, its top 2 m up, marked one-way. */
  function platform() {
    physics = new PhysicsWorld();
    physics.addGround(50);
    physics.setStructure('item:p', [{ center: [0, 1.8, 0], half: [2, 0.2, 1], yaw: 0 }], [], true);
  }

  it('lets the character jump up through a one-way platform and land on it', () => {
    platform();
    const character = physics.createCharacter({ x: 0, y: 0, z: 0 });
    character.oneWay = true;
    run(10, () => character.move({ x: 0, z: 0 }, false, JUMP, GRAVITY, DT));
    // A strong jump from below goes through, then the fall lands on the top.
    run(90, (i) => character.move({ x: 0, z: 0 }, i === 0, 10, GRAVITY, DT));
    expect(character.grounded).toBe(true);
    expect(character.feet.y).toBeGreaterThan(1.95);
    // Dropping through: back on the ground.
    character.dropThrough = true;
    run(60, () => character.move({ x: 0, z: 0 }, false, JUMP, GRAVITY, DT));
    character.dropThrough = false;
    expect(character.feet.y).toBeLessThan(0.1);
  });

  it('keeps a one-way platform solid for characters that do not use them (3D places)', () => {
    platform();
    const character = physics.createCharacter({ x: 0, y: 0, z: 0 });
    run(10, () => character.move({ x: 0, z: 0 }, false, JUMP, GRAVITY, DT));
    run(90, (i) => character.move({ x: 0, z: 0 }, i === 0, 10, GRAVITY, DT));
    expect(character.feet.y).toBeLessThan(0.5);
  });

  it('tells which side a wall is on, and jumps in the air with launch', () => {
    physics = new PhysicsWorld();
    physics.addGround(50);
    physics.addBox({ x: 1.5, y: 3, z: 0 }, { x: 0.5, y: 3, z: 5 }); // wall on the right
    const character = physics.createCharacter({ x: 0, y: 2, z: 0 });
    run(20, () => character.move({ x: 4, z: 0 }, false, JUMP, GRAVITY, DT));
    expect(character.wall).toBe(1);
    run(5, () => character.move({ x: -4, z: 0 }, false, JUMP, GRAVITY, DT));
    expect(character.wall).toBe(0);
    run(120, () => character.move({ x: 0, z: 0 }, false, JUMP, GRAVITY, DT));
    expect(character.grounded).toBe(true);
    character.launch(JUMP);
    run(5, () => character.move({ x: 0, z: 0 }, false, JUMP, GRAVITY, DT));
    expect(character.feet.y).toBeGreaterThan(0.4);
  });
});
