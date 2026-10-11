import { describe, expect, it } from 'vitest';
import { groundVariantIds, TidewaterGround } from '../src/tidewater-ground/index.js';
describe('reusable Tidewater ground', () => {
  it('keeps existing materials separate from source paint masks', () => {
    expect(groundVariantIds(['snow-006','tidewater-beach-sand','rock-051','tidewater-rubble','tidewater-seagrass']))
      .toEqual([0,1,0,6,7]);
  });
  it('rebakes after sculpting or sea changes and integrates source gust speed', () => {
    let reads=0;
    const ground=new TidewaterGround({half:4,heightAt:(x,z)=>{reads++;return x*.2+z*.1;}});
    ground.update(0);
    expect(reads).toBe(64);
    ground.update(0,2);
    expect(reads).toBe(64);
    expect(ground.gustOffset.value.length()).toBeCloseTo((.7*7+1.5)*2);
    ground.update(3);
    expect(reads).toBe(128);
    ground.invalidate();ground.update(3);
    expect(reads).toBe(192);
    ground.dispose();ground.update(0);
    expect(reads).toBe(192);
  });
});
