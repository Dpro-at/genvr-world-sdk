import { WorldDocument } from '@genvr/contracts';
import { PointLight, Vector3, type InstancedMesh } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { NIGHT_LIGHTS_MAX, NightLights } from '../src/night-lights.js';

function world(lamps: Array<[number, number]>) {
  return WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-night',
    version: 0,
    style: { base: 'blocky' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'night' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
    instances: [
      ...lamps.map(([x, z], i) => ({
        instanceId: `lamp-${i}`,
        itemId: 'genvr.core.lamp',
        transform: { position: [x, 0, z] },
      })),
      { instanceId: 'bench', itemId: 'genvr.core.bench', transform: { position: [0, 0, 0] } },
    ],
  });
}

const lights = (view: NightLights) => view.group.children.filter((c): c is PointLight => c instanceof PointLight);
const glow = (view: NightLights) => view.group.children.find((c) => (c as InstancedMesh).isInstancedMesh) as InstancedMesh;

describe('night lights', () => {
  it('lights nothing by day and makes no light objects', () => {
    const view = new NightLights();
    view.sync(world([[0, 0]]));
    view.update(new Vector3(0, 2, 0), 0);
    expect(glow(view).visible).toBe(false);
    expect(lights(view)).toHaveLength(0);
  });

  it('makes every lamp glow at night, at its bulb, and lights the nearest ones', () => {
    const view = new NightLights();
    const lamps: Array<[number, number]> = Array.from({ length: 12 }, (_, i) => [i * 10, 0]);
    view.sync(world(lamps));
    view.update(new Vector3(0, 2, 0), 1);
    expect(glow(view).visible).toBe(true);
    expect(glow(view).count).toBe(12);
    const on = lights(view).filter((light) => light.intensity > 0);
    expect(lights(view)).toHaveLength(NIGHT_LIGHTS_MAX);
    expect(on).toHaveLength(NIGHT_LIGHTS_MAX);
    // The nearest lamps, at bulb height.
    expect(Math.max(...on.map((light) => light.position.x))).toBe(70);
    expect(on[0]!.position.y).toBeCloseTo(3.8);
  });

  it('dims the lights again when the day comes, keeping the same light objects', () => {
    const view = new NightLights();
    view.sync(world([[0, 0]]));
    view.update(new Vector3(0, 2, 0), 1);
    const made = lights(view);
    view.update(new Vector3(0, 2, 0), 0);
    expect(lights(view)).toEqual(made);
    expect(made.every((light) => light.intensity === 0)).toBe(true);
    expect(glow(view).visible).toBe(false);
  });
});
