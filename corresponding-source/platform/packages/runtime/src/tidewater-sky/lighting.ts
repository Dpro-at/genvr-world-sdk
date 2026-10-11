/** Runtime adapters for the source lighting modules; task7 replaces the generic terrain provider. */
import {
  DataTexture,
  FloatType,
  RGBAFormat,
  NearestFilter,
  NearestMipmapNearestFilter,
  Vector2,
  Vector3,
  TSL,
  type Scene,
  type Camera,
  type Material,
  type MeshStandardNodeMaterial,
  type DirectionalLight,
  type PointLight,
  type SpotLight,
  type WebGPURenderer,
} from 'three/webgpu';
import { GroundBounce, bounceAlbedoNode } from './ground-bounce.js';
import { WATER_ABSORPTION, WATER_SCATTERING } from '../ocean/water-shading.js';
import { LocalLights } from './local-lights.js';
import { copyGroundSunModulation } from '../tidewater-ground/sun-modulation.js';
import { copyPlantTransmission } from '../vegetation/transmission.js';
import { TerrainSunShadow } from '../tidewater-ground/terrain-shadow.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL and material adapter */
type Node = any;
export class TidewaterLighting {
  readonly local = new LocalLights();
  readonly direction = TSL.uniform(new Vector3(0, 1, 0)).setGroup(TSL.renderGroup);
  readonly color = TSL.uniform(new Vector3());
  readonly sea = TSL.uniform(0);
  readonly height: DataTexture;
  readonly covers: DataTexture;
  readonly bounce: GroundBounce;
  readonly terrainShadow: TerrainSunShadow;
  #materials = new Map<Material, MeshStandardNodeMaterial>();
  #originals = new Map<any, Material | Material[]>();
  #installed = new Map<any, Material | Material[]>();
  #lamps = new Map<
    PointLight | SpotLight,
    { visible: boolean; source: ReturnType<LocalLights['addLight']> }
  >();
  #on = false;
  #timer = 0;
  constructor(
    readonly renderer: WebGPURenderer,
    readonly scene: Scene,
    readonly sun: DirectionalLight,
    readonly terrain: {
      half: number;
      heightAt(x: number, z: number): number;
      slotAt(x: number, z: number): number;
    },
    readonly kindOf: (slot: number) => string = () => 'sand',
  ) {
    // Source 1m input/4m shadow heights at its canonical 2048m domain; other world sizes
    // use a capped power-of-two sampling grid with the actual texel size in the march.
    this.terrainShadow = new TerrainSunShadow({origin:new Vector2(-terrain.half,-terrain.half),size:terrain.half*2,
      res:Math.max(16,Math.min(2048,2**Math.ceil(Math.log2(terrain.half*2)))),heightAt:(x,z)=>terrain.heightAt(x,z)});
    this.height = new DataTexture(new Float32Array(256 * 256 * 4), 256, 256, RGBAFormat, FloatType);
    this.height.minFilter = NearestMipmapNearestFilter;
    this.height.magFilter = NearestFilter;
    this.height.generateMipmaps = false;
    this.covers = new DataTexture(new Float32Array(256 * 256 * 4), 256, 256, RGBAFormat, FloatType);
    this.covers.minFilter = this.covers.magFilter = NearestFilter;
    this.local.waterExtinction.value.set(...WATER_ABSORPTION).add(new Vector3(...WATER_SCATTERING));
    const albedoReference = TSL.select(this.sea.lessThan(-1000), TSL.float(0), this.sea);
    const cover = (xz: Node) => TSL.texture(this.covers, xz.add(terrain.half).div(terrain.half * 2));
    const sample = (xz: Node, lod: Node = TSL.float(0)) =>
      TSL.texture(this.height, xz.add(terrain.half).div(terrain.half * 2)).level(lod);
    this.bounce = new GroundBounce({
      origin: new Vector2(-terrain.half, -terrain.half),
      size: terrain.half * 2,
      heightNode: (xz, lod) => sample(xz, lod).r,
      normalNode: (xz) => TSL.normalize(sample(xz).gba),
      // Generic terrain has no source splat/rock channels yet. Its real height and normals are used.
      albedoNode: (xz) =>
        bounceAlbedoNode(
          sample(xz).r.sub(albedoReference),
          TSL.normalize(sample(xz).gba),
          cover(xz).r,
          cover(xz).gb,
          this.sea.sub(albedoReference),
          this.local.waterExtinction,
        ),
      sunDirection: this.direction,
      sunColor: this.color,
      seaLevel: this.sea,
      groundShadowNode: (position) => this.terrainShadow.visibilityNode(position),
      cloudShadowNode: (xz) => scene.userData.tidewaterClouds?.cloudShadow(xz) ?? TSL.float(1),
    });
  }
  invalidate(): void {
    this.terrainShadow.invalidate();
    this.#timer = 0;
    this.bounce.invalidate();
  }
  #refresh(): void {
    const n = 256,
      h = this.terrain.half,
      base = this.height.image.data as Float32Array;
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const px = ((x + 0.5) / n) * h * 2 - h,
          pz = ((z + 0.5) / n) * h * 2 - h,
          i = (z * n + x) * 4;
        const normal = new Vector3(
          -(this.terrain.heightAt(px + 1, pz) - this.terrain.heightAt(px - 1, pz)) / 2,
          1,
          -(this.terrain.heightAt(px, pz + 1) - this.terrain.heightAt(px, pz - 1)) / 2,
        ).normalize();
        const kind = this.kindOf(this.terrain.slotAt(px, pz)),
          cover = this.covers.image.data as Float32Array;
        cover[i] = kind === 'rock' ? 1 : 0;
        cover[i + 1] = kind === 'sand' ? 1 : 0;
        cover[i + 2] = kind === 'grass' ? 1 : 0;
        cover[i + 3] = 1;
        base[i] = this.terrain.heightAt(px, pz);
        base[i + 1] = normal.x;
        base[i + 2] = normal.y;
        base[i + 3] = normal.z;
      }
    const mips: any[] = [{ data: base, width: n, height: n }];
    let prev = base,
      size = n;
    while (size > 1) {
      const next = size / 2,
        data = new Float32Array(next * next * 4);
      for (let z = 0; z < next; z++)
        for (let x = 0; x < next; x++)
          for (let c = 0; c < 4; c++) {
            const values = [0, 1, 2, 3].map(
              (k) => prev[((z * 2 + (k >> 1)) * size + x * 2 + (k & 1)) * 4 + c]!,
            );
            data[(z * next + x) * 4 + c] =
              c === 0 ? Math.max(...values) : values.reduce((a, b) => a + b, 0) / 4;
          }
      mips.push({ data, width: next, height: next });
      prev = data;
      size = next;
    }
    this.covers.needsUpdate = true;
    this.height.mipmaps = mips;
    this.height.needsUpdate = true;
    this.bounce.invalidate();
    this.#timer = Infinity;
  }
  update(dt: number, camera: Camera, on: boolean, seaLevel: number, night: number): void {
    this.direction.value.subVectors(this.sun.position, this.sun.target.position).normalize();
    this.color.value
      .set(this.sun.color.r, this.sun.color.g, this.sun.color.b)
      .multiplyScalar(this.sun.intensity);
    if (this.sea.value !== seaLevel) this.invalidate();
    this.sea.value = seaLevel;
    this.local.seaLevel.value = seaLevel;
    if (on !== this.#on) {
      this.#on = on;
      if (!on) {
        for (const [object, material] of this.#originals) {
          if (object.material === this.#installed.get(object)) object.material = material;
          for (const source of Array.isArray(material) ? material : [material]) {
            source.dispose();
            source.needsUpdate = true;
          }
        }
        this.#originals.clear();
        this.#installed.clear();
        for (const [lamp, value] of this.#lamps) lamp.visible = value.visible;
        this.#lamps.clear();
        this.local.sources.length = 0;
        for (const converted of this.#materials.values()) {
          this.bounce.detach(converted);
          this.local.detach(converted);
          converted.dispose();
        }
        this.#materials.clear();
      } else this.invalidate();
    }
    if (!on) return;
    this.#timer -= dt;
    if (this.#timer <= 0) this.#refresh();
    for (const [original, converted] of this.#materials) {
      const source = original as any,
        target = converted as any;
      for (const property of ['color', 'emissive'])
        if (source[property] && target[property]) target[property].copy(source[property]);
      for (const property of ['opacity', 'roughness', 'metalness', 'emissiveIntensity', 'alphaTest'])
        target[property] = source[property];
      let changed = false;
      for (const property of [
        'map',
        'normalMap',
        'roughnessMap',
        'metalnessMap',
        'aoMap',
        'alphaMap',
        'emissiveMap',
        'transparent',
        'side',
      ]) {
        if (target[property] !== source[property]) {
          target[property] = source[property];
          changed = true;
        }
      }
      if (changed) {
        converted.dispose();
        converted.needsUpdate = true;
      }
    }
    const presentMeshes = new Set<any>();
    const presentLights = new Set<PointLight | SpotLight>();
    this.scene.traverse((object: any) => {
      if (object.material) presentMeshes.add(object);
      if (object.isPointLight || object.isSpotLight) presentLights.add(object);
      if (this.#originals.has(object) && object.material !== this.#installed.get(object)) {
        this.#originals.delete(object);
        this.#installed.delete(object);
      }
      if ((object.isPointLight || object.isSpotLight) && !this.#lamps.has(object)) {
        const source = this.local.addLight(object);
        this.#lamps.set(object, { visible: object.visible, source });
        object.visible = false;
      }
      if (!object.material || this.#originals.has(object)) return;
      const convert = (original: Material): Material => {
        if (!(original as any).isMeshStandardMaterial) return original;
        let material = this.#materials.get(original);
        if (!material) {
          material = (
            (original as any).isNodeMaterial ? original.clone() : this.renderer.library.fromMaterial(original)
          ) as MeshStandardNodeMaterial;
          if (!material) return original;
          copyGroundSunModulation(original as MeshStandardNodeMaterial, material, this.sun, this.direction,
            this.terrainShadow.visibilityNode(TSL.positionWorld));
          copyPlantTransmission(original as MeshStandardNodeMaterial, material, this.sun,
            this.terrainShadow.visibilityNode(TSL.positionWorld));
          this.bounce.attach(material);
          this.local.attach(material);
          this.#materials.set(original, material);
        }
        return material;
      };
      const original = object.material;
      const converted = Array.isArray(original) ? original.map(convert) : convert(original);
      if (converted !== original) {
        this.#originals.set(object, original);
        object.material = converted;
        this.#installed.set(object, converted);
      }
    });
    for (const [object, original] of this.#originals)
      if (!presentMeshes.has(object)) {
        if (object.material === this.#installed.get(object)) object.material = original;
        this.#originals.delete(object);
        this.#installed.delete(object);
      }
    const used = new Set<Material>();
    for (const original of this.#originals.values())
      for (const material of Array.isArray(original) ? original : [original]) used.add(material);
    for (const [original, converted] of this.#materials)
      if (!used.has(original)) {
        this.bounce.detach(converted);
        this.local.detach(converted);
        converted.dispose();
        this.#materials.delete(original);
      }
    for (const [lamp, value] of this.#lamps)
      if (!presentLights.has(lamp)) {
        this.local.remove(value.source);
        lamp.visible = value.visible;
        this.#lamps.delete(lamp);
      }
    this.local.update(camera, dt, night);
    if(this.terrainShadow.update(this.renderer,this.direction.value)) this.bounce.invalidate();
    this.bounce.update(this.renderer);
  }
  get retainedMaterials(): number {
    return this.#materials.size;
  }
  get retainedMeshes(): number {
    return this.#originals.size;
  }
  dispose(): void {
    for (const [object, material] of this.#originals) object.material = material;
    for (const [lamp, value] of this.#lamps) lamp.visible = value.visible;
    this.bounce.dispose();
    this.terrainShadow.dispose();
    this.local.dispose();
    this.height.dispose();
    this.covers.dispose();
    for (const material of this.#materials.values()) material.dispose();
    this.#materials.clear();
    this.#originals.clear();
    this.#installed.clear();
    this.#lamps.clear();
  }
}
