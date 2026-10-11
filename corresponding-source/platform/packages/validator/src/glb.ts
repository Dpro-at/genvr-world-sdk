/**
 * Model facts read straight from a GLB file (P2-12): the JSON chunk and the image headers,
 * without decoding geometry or rendering. Works the same in the API, the worker, and the browser.
 */
export interface ModelStats {
  /** Triangles drawn, counting every node that uses a mesh. */
  triangles: number;
  vertices: number;
  /** One per mesh primitive per node that uses it (roughly the draw calls). */
  drawCalls: number;
  materials: number;
  /** Joints of all skins. */
  bones: number;
  animations: string[];
  textures: number;
  /** Estimated GPU memory of the textures (RGBA with mipmaps), in megabytes. */
  textureMB: number;
  /** glTF extensions the file needs (Draco, Meshopt, KTX2, ...). */
  extensions: string[];
  /**
   * The model's box in its own space (meters), from the position bounds of every drawn mesh
   * and the node transforms (P2-11: the server's size of an uploaded item). Skinned meshes are
   * measured in their bind pose. Null when the file has no drawn mesh with position bounds.
   */
  bounds?: { min: [number, number, number]; max: [number, number, number] } | null;
}

export class GlbError extends Error {}

interface GltfJson {
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: Array<{
    mesh?: number;
    children?: number[];
    matrix?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
  }>;
  meshes?: Array<{
    primitives: Array<{ attributes: Record<string, number>; indices?: number; mode?: number }>;
  }>;
  accessors?: Array<{ count: number; min?: number[]; max?: number[] }>;
  materials?: unknown[];
  skins?: Array<{ joints: number[] }>;
  animations?: Array<{ name?: string }>;
  images?: Array<{ bufferView?: number; uri?: string; mimeType?: string }>;
  bufferViews?: Array<{ byteOffset?: number; byteLength: number }>;
  extensionsRequired?: string[];
  extensionsUsed?: string[];
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

/** Splits a GLB into its JSON and binary chunk. */
export function chunks(bytes: Uint8Array): { json: GltfJson; bin: Uint8Array | null } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) throw new GlbError('Not a GLB file.');
  if (view.getUint32(4, true) !== 2) throw new GlbError('Only glTF 2.0 files are supported.');
  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (body.byteLength !== length) throw new GlbError('The GLB file is cut short.');
    if (type === JSON_CHUNK) {
      try {
        json = JSON.parse(new TextDecoder().decode(body)) as GltfJson;
      } catch {
        throw new GlbError('The GLB file has broken JSON.');
      }
    } else if (type === BIN_CHUNK) bin = body;
    offset += 8 + length;
  }
  if (!json) throw new GlbError('The GLB file has no JSON chunk.');
  return { json, bin };
}

const KTX2_ID = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

/** A KTX2 texture (GPU-compressed, KHR_texture_basisu). */
export const isKtx2 = (bytes: Uint8Array): boolean =>
  bytes.byteLength >= 12 && KTX2_ID.every((value, index) => bytes[index] === value);

/** Width and height from a PNG or JPEG header; null for other formats. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // KTX2: the identifier, then vkFormat and typeSize, then pixelWidth and pixelHeight (little-endian).
  if (isKtx2(bytes) && bytes.byteLength >= 28)
    return { width: view.getUint32(20, true), height: view.getUint32(24, true) };
  // PNG: signature, then the IHDR chunk with width and height.
  if (bytes.byteLength >= 24 && view.getUint32(0) === 0x89504e47)
    return { width: view.getUint32(16), height: view.getUint32(20) };
  // JPEG: walk the segments to a start-of-frame marker.
  if (bytes.byteLength >= 4 && view.getUint16(0) === 0xffd8) {
    let offset = 2;
    while (offset + 9 < bytes.byteLength) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1]!;
      const length = view.getUint16(offset + 2);
      const frame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (frame) return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      offset += 2 + length;
    }
  }
  return null;
}

type Matrix = number[]; // 4x4, column-major like glTF

const IDENTITY: Matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a: Matrix, b: Matrix): Matrix {
  const out = new Array<number>(16);
  for (let column = 0; column < 4; column++)
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[column * 4 + k]!;
      out[column * 4 + row] = sum;
    }
  return out;
}

/** A node's local matrix from `matrix` or translation, rotation (quaternion), and scale. */
function localMatrix(node: NonNullable<GltfJson['nodes']>[number]): Matrix {
  if (node.matrix?.length === 16) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y! * y! + z! * z!)) * sx!,
    2 * (x! * y! + z! * w!) * sx!,
    2 * (x! * z! - y! * w!) * sx!,
    0,
    2 * (x! * y! - z! * w!) * sy!,
    (1 - 2 * (x! * x! + z! * z!)) * sy!,
    2 * (y! * z! + x! * w!) * sy!,
    0,
    2 * (x! * z! + y! * w!) * sz!,
    2 * (y! * z! - x! * w!) * sz!,
    (1 - 2 * (x! * x! + y! * y!)) * sz!,
    0,
    tx!,
    ty!,
    tz!,
    1,
  ];
}

/** Reads the model facts of a GLB file. Throws GlbError when the file is not a usable GLB. */
export function inspectGlb(bytes: Uint8Array): ModelStats {
  const { json, bin } = chunks(bytes);
  const accessors = json.accessors ?? [];
  const count = (index: number | undefined) => (index === undefined ? 0 : (accessors[index]?.count ?? 0));

  // How many nodes of the default scene use each mesh (a mesh used twice is drawn twice).
  // Also the model's box: each drawn mesh's position bounds carried through its node matrices.
  const uses = new Map<number, number>();
  const nodes = json.nodes ?? [];
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? nodes.map((_, index) => index);
  const seen = new Set<number>();
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const measure = (meshIndex: number, matrix: Matrix) => {
    for (const primitive of json.meshes?.[meshIndex]?.primitives ?? []) {
      const position = primitive.attributes.POSITION;
      const accessor = position === undefined ? undefined : accessors[position];
      if (accessor?.min?.length !== 3 || accessor.max?.length !== 3) continue;
      for (let corner = 0; corner < 8; corner++) {
        const local = [0, 1, 2].map((k) => ((corner >> k) & 1 ? accessor.max![k]! : accessor.min![k]!));
        for (let k = 0; k < 3; k++) {
          const value =
            matrix[k]! * local[0]! +
            matrix[4 + k]! * local[1]! +
            matrix[8 + k]! * local[2]! +
            matrix[12 + k]!;
          min[k] = Math.min(min[k]!, value);
          max[k] = Math.max(max[k]!, value);
        }
      }
    }
  };
  const walk = (index: number, parent: Matrix) => {
    if (seen.has(index)) return; // broken files can loop
    seen.add(index);
    const node = nodes[index];
    if (!node) return;
    const matrix = multiply(parent, localMatrix(node));
    if (node.mesh !== undefined) {
      uses.set(node.mesh, (uses.get(node.mesh) ?? 0) + 1);
      measure(node.mesh, matrix);
    }
    for (const child of node.children ?? []) walk(child, matrix);
  };
  for (const root of roots) walk(root, IDENTITY);
  const round3 = (value: number) => Math.round(value * 1000) / 1000;
  const bounds = Number.isFinite(min[0])
    ? {
        min: min.map(round3) as [number, number, number],
        max: max.map(round3) as [number, number, number],
      }
    : null;

  let triangles = 0;
  let vertices = 0;
  let drawCalls = 0;
  for (const [meshIndex, times] of uses) {
    for (const primitive of json.meshes?.[meshIndex]?.primitives ?? []) {
      const mode = primitive.mode ?? 4;
      const corners =
        primitive.indices !== undefined ? count(primitive.indices) : count(primitive.attributes.POSITION);
      // Triangles (4), strips (5), and fans (6); points and lines draw no triangles.
      const shapes = mode === 4 ? corners / 3 : mode === 5 || mode === 6 ? Math.max(0, corners - 2) : 0;
      triangles += Math.floor(shapes) * times;
      vertices += count(primitive.attributes.POSITION) * times;
      drawCalls += times;
    }
  }

  let textureBytes = 0;
  const images = json.images ?? [];
  for (const image of images) {
    const view = image.bufferView === undefined ? null : json.bufferViews?.[image.bufferView];
    const data =
      view && bin ? bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength) : null;
    const size = data ? imageSize(data) : null;
    // Unknown formats (e.g. WebP) count as a 1024 x 1024 texture until they are read.
    const pixels = size ? size.width * size.height : 1024 * 1024;
    // KTX2 stays compressed on the GPU (about one byte per pixel); others unpack to RGBA. Plus mipmaps.
    const perPixel = data && isKtx2(data) ? 1 : 4;
    textureBytes += pixels * perPixel * (4 / 3);
  }

  const joints = new Set<number>();
  for (const skin of json.skins ?? []) for (const joint of skin.joints) joints.add(joint);

  return {
    triangles,
    vertices,
    drawCalls,
    materials: json.materials?.length ?? 0,
    bones: joints.size,
    animations: (json.animations ?? []).map((animation, index) => animation.name || `animation ${index + 1}`),
    textures: images.length,
    textureMB: Math.round((textureBytes / (1024 * 1024)) * 10) / 10,
    extensions: [...new Set([...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])])].sort(),
    bounds,
  };
}
