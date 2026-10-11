/** Tidewater4811ba48 createCanopyBakeMaterials, MIT; LICENSE-tidewater.md. */
import { DoubleSide, MeshBasicNodeMaterial, TSL } from 'three/webgpu';
import type { LeafAtlas } from './leaf-atlas.js';
import { CANOPY_SURFACE_WGSL } from './canopy-surface.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native node material boundary */
type N = any;

export const CANOPY_BAKE_WGSL =
  `
fn twCanopyBake(st:vec2f,aMat:vec4f,L:vec4f,localN:vec3f,normalOutput:bool)->vec4f {
 let part=aMat.x;let isBark=part<0.5||part>4.5;
 if(normalOutput){return vec4f(normalize(localN)*0.5+0.5,select(aMat.y,0.6,isBark));}
 let vBright=L.y*1.4;
 let barkN=vegNoise(vec2f(st.x*30.0,st.y*2.5))*0.6+vegNoise(vec2f(st.x*6.0,st.y*0.7))*0.4;
 let bright=select(vBright/1.4,barkN*0.5+0.4,isBark);
 return vec4f(bright,select(1.0,0.0,isBark),aMat.z,1.0);
}
` + CANOPY_SURFACE_WGSL;

/** Borrow the already baked leaf atlas. The two materials are owned by the caller.
 * Output is data, so it bypasses lighting, tone mapping and color-space encoding. */
export function createCanopyBakeMaterials(leafAtlas: Pick<LeafAtlas, 'sample'>): {
  albedo: MeshBasicNodeMaterial;
  normal: MeshBasicNodeMaterial;
} {
  const t = TSL as N;
  const make = (normalOutput: boolean) => {
    const material = new MeshBasicNodeMaterial({ side: DoubleSide, toneMapped: false });
    material.name = `tidewater-impostor-bake-${normalOutput ? 'normal' : 'albedo'}`;
    const aMat = t.attribute('aMat', 'vec4'),
      part = aMat.x;
    const isBark = part.lessThan(0.5).or(part.greaterThan(4.5));
    const sample = leafAtlas.sample(t.uv(), t.select(part.greaterThan(2.5), 2, 0));
    // Source stores the geometry normal before all instance frame rotations.
    const localNormal = t.varying(t.attribute('normal', 'vec3'), 'twBakeLocalNormal');
    material.maskNode = isBark.or(sample.x.greaterThan(0.5));
    material.outputNode = t.wgslFn(CANOPY_BAKE_WGSL)({
      st: t.uv(),
      aMat,
      L: sample,
      localN: localNormal,
      normalOutput: t.bool(normalOutput),
    });
    return material;
  };
  return { albedo: make(false), normal: make(true) };
}
