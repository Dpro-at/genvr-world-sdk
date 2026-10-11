/** CPU adapter of Tidewater4811ba48 VegNodes plant equations. MIT; LICENSE-tidewater.md. */
import { BufferAttribute, type BufferGeometry, Vector3 } from 'three';
import { vegetationLodScale } from './index.js';
export type Four = readonly [number, number, number, number];
export interface PlantCpuInputs {
  position: Vector3; normal: Vector3; instancePosition: Four; instanceData: Four;
  vegetation: Four; material: Four; lobe: Four; lodRange: readonly [number, number, number];
  camera: Vector3; time: number; strength: number; gust: number;
  windDirection: Vector3; windPerpendicular: Vector3;
}
const fract = (x: number) => x - Math.floor(x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t);
};
function rotateUp(v: Vector3, direction: Vector3): Vector3 {
  const k = new Vector3(direction.z, 0, -direction.x), cross = k.clone().cross(v);
  return v.clone().add(cross).addScaledVector(k.cross(cross), 1 / (direction.y + 1));
}
/** Allocation-oriented authoring adapter, not a per-frame CPU animation loop.
 * Inputs follow the GPU contract: position/normal already transformed by instance matrix. */
export function deformPlantCpu(i: PlantCpuInputs) {
  const [bx, by, bz, sc] = i.instancePosition, base = new Vector3(bx, by, bz);
  const [angle, lean, H, packedSeed] = i.instanceData;
  const leanDir = new Vector3(Math.cos(angle), 0, Math.sin(angle));
  const seed = fract(packedSeed), kindI = Math.floor(packedSeed), kindV = -i.lobe[3] - 1;
  const keepKind = kindV < .5 || Math.abs(kindV - kindI) < .5;
  const [u, s, flut, ph] = i.vegetation, [part, age] = i.material;
  const { time: t, strength: w, gust: g, windDirection: dir, windPerpendicular: perp } = i;
  const ph0 = seed * 6.2832;
  const sway = w * w * .014 * (g * .9 + .3) + Math.sin(t * .83 + ph0) * w * .0065 * (g + .45);
  const swayP = Math.sin(t * .61 + ph0 * 1.7) * w * .0028;
  const windOff = dir.clone().multiplyScalar(sway).addScaledVector(perp, swayP);
  const c = fract(seed * 7.31), fc = mix(u, u * ((1 - u) + 1), c), df = mix(1, (1 - u) * 2, c);
  const off = leanDir.clone().multiplyScalar(lean * fc).addScaledVector(windOff, u * u);
  const T = new Vector3(0, 1, 0).addScaledVector(leanDir, lean * df).addScaledVector(windOff, u * 2).normalize();
  const radial = new Vector3(i.position.x - bx, 0, i.position.z - bz);
  const axis = base.clone().add(new Vector3(0, u * H, 0)).addScaledVector(off, H);
  const stemPos = axis.add(rotateUp(radial, T)), stemN = rotateUp(i.normal, T);
  const top = new Vector3(0, 1, 0).addScaledVector(leanDir, lean * (1 - c)).addScaledVector(windOff, 2).normalize();
  const tilt = new Vector3(0, 1, 0).add(top).normalize();
  const crown = base.clone().add(new Vector3(0, H, 0)).addScaledVector(leanDir, lean * H).addScaledVector(windOff, H);
  const o1 = rotateUp(i.position.clone().sub(base), tilt), N1 = rotateUp(i.normal, tilt);
  const s2 = s * s;
  const bend = s2 * sc * 4.5 * (w * w * .16 * (g * .8 + .35) + Math.sin(t * (ph * .5 + 1.3) + ph * 23 + ph0) * w * .075 * (g + .3));
  const bounce = Math.sin(t * (ph + 2.1) + ph * 41) * s2 * w * sc * .1;
  const flutter = flut * sc * (Math.sin(t * (ph * 5 + 11) + ph * 60 + s * 9) * (w * .045 + .008) + Math.sin(t * 23 + ph * 13 + s * 17) * (Math.max(w - 1, 0) * .05));
  const disp = dir.clone().multiplyScalar(bend).add(new Vector3(0, bounce - bend * .3, 0)).addScaledVector(N1, flutter);
  const o2 = o1.clone().add(disp).add(new Vector3(0, 1e-5, 0)).normalize().multiplyScalar(o1.length());
  const hideDead = part > .5 && part < 1.5 && age > .95 && fract(seed * 13.7) > .4;
  const pos = part < .5 ? stemPos : hideDead ? crown : crown.clone().add(o2);
  const distance = i.camera.distanceTo(base);
  const fernFade = kindI > 2.5 && kindI < 3.5 ? 1 - smooth(42, 58, distance) : 1;
  const k = vegetationLodScale(distance, i.lodRange) * fernFade * (keepKind ? 1 : 0);
  return { position: base.clone().addScaledVector(pos.sub(base), k), normal: part < .5 ? stemN : N1,
    trunkDirection: T, trunkHeight: u * H };
}

/** Bake a declared calm authoring pose for bounds/ghost/fallback. Does not mutate source geometry.
 * Wind strength retains the source calm floor; gust0/time0 and +X wind are explicit defaults.
 * The resulting bounds describe this pose only, not the full dynamic wind envelope. */
export function bakePlantPose(source: BufferGeometry, height: number, seed: number, lean = 0, leanAngle = 0): BufferGeometry {
  if (!(height > 0) || ![height, seed, lean, leanAngle].every(Number.isFinite)) throw new Error('Invalid plant pose parameters');
  const result = source.clone(), position = source.getAttribute('position'), normal = source.getAttribute('normal');
  const positions = new Float32Array(position.count * 3), normals = new Float32Array(position.count * 3);
  const four = (name: string, n: number): Four => {
    const a = source.getAttribute(name); return [a.getX(n), a.getY(n), a.getZ(n), a.getW(n)];
  };
  for (let n = 0; n < position.count; n++) {
    const d = deformPlantCpu({position: new Vector3().fromBufferAttribute(position,n),normal: new Vector3().fromBufferAttribute(normal,n),
      instancePosition:[0,0,0,1],instanceData:[leanAngle,lean,height,seed],vegetation:four('aVeg',n),material:four('aMat',n),lobe:four('aLobe',n),
      lodRange:[0,1e6,1e6+1],camera:new Vector3(),time:0,strength:.03,gust:0,windDirection:new Vector3(1,0,0),windPerpendicular:new Vector3(0,0,1)});
    d.position.toArray(positions,n*3); d.normal.toArray(normals,n*3);
  }
  result.setAttribute('position',new BufferAttribute(positions,3));result.setAttribute('normal',new BufferAttribute(normals,3));
  result.computeBoundingBox();result.computeBoundingSphere();return result;
}

