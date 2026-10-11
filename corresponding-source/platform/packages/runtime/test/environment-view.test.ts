import { STYLE_PACKS } from '@genvr/core-library';
import { Fog, FogExp2, Scene } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { EnvironmentView } from '../src/environment-view.js';

const look = (style: string) => STYLE_PACKS.find((pack) => pack.style === style)!.look;
const environment = {
  sky: { preset: 'day' as const, params: {} },
  weather: { preset: 'clear' as const, params: {} },
  water: [],
  rivers: [],
};

describe('sky per style (P2-36)', () => {
  it('keeps the gradient dome and linear fog in the blocky style', () => {
    const scene = new Scene();
    const view = new EnvironmentView(scene, look('blocky'), 800);
    view.apply(environment);
    expect(view.group.getObjectByName('physical-sky')).toBeUndefined();
    expect(view.group.getObjectByName('sky')!.visible).toBe(true);
    expect(scene.fog).toBeInstanceOf(Fog);
    view.dispose();
  });

  it('draws the physical sky with air fog in the realistic style', () => {
    const scene = new Scene();
    const view = new EnvironmentView(scene, look('realistic'), 800);
    view.apply(environment);
    const physical = view.group.getObjectByName('physical-sky');
    expect(physical).toBeDefined();
    expect(scene.fog).toBeInstanceOf(FogExp2);
    view.dispose();
  });

  it('switches styles back and forth without a second sky', () => {
    const scene = new Scene();
    const view = new EnvironmentView(scene, look('realistic'), 800);
    view.apply(environment);
    view.setStyle(look('blocky'));
    expect(view.group.getObjectByName('physical-sky')).toBeUndefined();
    expect(scene.fog).toBeInstanceOf(Fog);
    view.setStyle(look('realistic'));
    view.setStyle(look('realistic'));
    const skies = view.group.children.filter((child) => child.name === 'physical-sky');
    expect(skies).toHaveLength(1);
    view.dispose();
  });
});
