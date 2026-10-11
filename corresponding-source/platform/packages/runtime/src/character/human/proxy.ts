import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  MeshStandardNodeMaterial,
  SRGBColorSpace,
  TSL,
  TextureLoader,
  type Texture,
} from 'three/webgpu';

/**
 * Hair, eyebrows and beards on our generated body (HAIR-01): CC0 MakeHuman assets baked by
 * tooling/human-bake/bake-proxies.ts into public/human/proxies/<id>.bin. Each vertex rests on three body vertices
 * (weights) plus an offset scaled by the head's size along each axis, so the hair follows every face and body
 * control; it is skinned like the body vertex it rests on most.
 */
export interface HumanProxy {
  id: string;
  kind: 'hair' | 'brows' | 'beard';
  refs: Uint32Array;
  weights: Float32Array;
  offsets: Float32Array;
  uv: Float32Array;
  index: Uint32Array;
  /** Per axis: two body vertices and the distance along that axis (metres) the offsets were made for. */
  scale: Array<[number, number, number]>;
  textures: { diffuse: string; normal?: string };
}

const PROXY_FORMAT = 1;

/** Reads a baked proxy file (see bake-proxies.ts for the layout). */
export function decodeProxy(buffer: ArrayBuffer): HumanProxy {
  const headerLength = new Uint32Array(buffer, 0, 1)[0]!;
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerLength))) as {
    format: number;
    id: string;
    kind: HumanProxy['kind'];
    vertices: number;
    indices: number;
    scale: Array<[number, number, number]>;
    textures: HumanProxy['textures'];
  };
  if (header.format !== PROXY_FORMAT) throw new Error(`Proxy format ${header.format}`);
  let at = 4 + headerLength;
  const take = <T>(make: (start: number, count: number) => T, count: number, size = 4): T => {
    const value = make(at, count);
    at += count * size;
    return value;
  };
  const n = header.vertices;
  return {
    id: header.id,
    kind: header.kind,
    refs: take((start, count) => new Uint32Array(buffer, start, count), n * 3),
    weights: take((start, count) => new Float32Array(buffer, start, count), n * 3),
    offsets: take((start, count) => new Float32Array(buffer, start, count), n * 3),
    uv: take((start, count) => new Float32Array(buffer, start, count), n * 2),
    index: take((start, count) => new Uint32Array(buffer, start, count), header.indices),
    scale: header.scale,
    textures: header.textures,
  };
}

const loads = new Map<string, Promise<HumanProxy>>();

/** Loads a proxy once (`base` is the folder of the body data, e.g. /human/). */
export function loadHumanProxy(base: string, id: string): Promise<HumanProxy> {
  const url = `${base}proxies/${id}.bin`;
  let load = loads.get(url);
  if (!load) {
    load = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Proxy ${id}: HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then(decodeProxy);
    load.catch(() => loads.delete(url));
    loads.set(url, load);
  }
  return load;
}

/**
 * The proxy fitted onto a shaped body: positions from the body's rest positions (MakeHuman's formula), skinning
 * from the body vertex each one rests on most, texture coordinates and triangles as baked.
 */
export function fitHumanProxy(proxy: HumanProxy, body: BufferGeometry): BufferGeometry {
  const position = body.getAttribute('position');
  const skinIndex = body.getAttribute('skinIndex');
  const skinWeight = body.getAttribute('skinWeight');
  const scale = proxy.scale.map(([a, b, size], axis) => {
    const along = Math.abs(position.getComponent(a, axis) - position.getComponent(b, axis));
    return size > 0 ? along / size : 1;
  });
  const n = proxy.refs.length / 3;
  const positions = new Float32Array(n * 3);
  const indices = new Uint16Array(n * 4);
  const weights = new Float32Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    let lead = 0;
    for (let axis = 0; axis < 3; axis += 1) {
      let value = proxy.offsets[i * 3 + axis]! * scale[axis]!;
      for (let k = 0; k < 3; k += 1)
        value += proxy.weights[i * 3 + k]! * position.getComponent(proxy.refs[i * 3 + k]!, axis);
      positions[i * 3 + axis] = value;
    }
    for (let k = 1; k < 3; k += 1) if (proxy.weights[i * 3 + k]! > proxy.weights[i * 3 + lead]!) lead = k;
    const source = proxy.refs[i * 3 + lead]!;
    for (let j = 0; j < 4; j += 1) {
      indices[i * 4 + j] = skinIndex.getComponent(source, j);
      weights[i * 4 + j] = skinWeight.getComponent(source, j);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(proxy.uv, 2));
  geometry.setAttribute('skinIndex', new BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(weights, 4));
  geometry.setIndex(new BufferAttribute(proxy.index, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

const textures = new Map<string, Texture>();
const texture = (url: string, color: boolean) => {
  let made = textures.get(url);
  if (!made) {
    made = new TextureLoader().load(url);
    if (color) made.colorSpace = SRGBColorSpace;
    made.anisotropy = 4;
    textures.set(url, made);
  }
  return made;
};

const { texture: sample, uniform, uv, vec3 } = TSL;

/**
 * Real hair (owner, HAIR-01): the asset's strand texture cut out by its alpha (alpha to coverage, both sides), its
 * light and dark strands kept, recoloured to `color`; a little shine (roughness 0.5). One material per avatar.
 */
export function humanHairMaterial(base: string, proxy: HumanProxy, color: string): MeshStandardNodeMaterial {
  const map = texture(`${base}proxies/${proxy.textures.diffuse}`, true);
  const material = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.5, metalness: 0 });
  const tint = uniform(new Color(color));
  const strands = sample(map, uv());
  // The strands' own light and dark, around the chosen colour (the assets are painted brown or grey).
  const light = strands.rgb.dot(vec3(0.2126, 0.7152, 0.0722));
  material.colorNode = tint.mul(light.mul(1.6).add(0.25));
  material.opacityNode = strands.a;
  material.alphaTest = 0.45;
  material.alphaToCoverage = true;
  if (proxy.textures.normal) material.normalMap = texture(`${base}proxies/${proxy.textures.normal}`, false);
  material.userData.hairColor = tint;
  material.userData.proxy = proxy.id;
  return material;
}

/** Sets a hair material's colour. */
export function setHumanHairColor(material: MeshStandardNodeMaterial, color: string): void {
  (material.userData.hairColor as { value: Color } | undefined)?.value.set(color);
}
