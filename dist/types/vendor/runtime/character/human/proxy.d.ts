import { BufferGeometry, MeshStandardNodeMaterial } from 'three/webgpu';
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
    textures: {
        diffuse: string;
        normal?: string;
    };
}
/** Reads a baked proxy file (see bake-proxies.ts for the layout). */
export declare function decodeProxy(buffer: ArrayBuffer): HumanProxy;
/** Loads a proxy once (`base` is the folder of the body data, e.g. /human/). */
export declare function loadHumanProxy(base: string, id: string): Promise<HumanProxy>;
/**
 * The proxy fitted onto a shaped body: positions from the body's rest positions (MakeHuman's formula), skinning
 * from the body vertex each one rests on most, texture coordinates and triangles as baked.
 */
export declare function fitHumanProxy(proxy: HumanProxy, body: BufferGeometry): BufferGeometry;
/**
 * Real hair (owner, HAIR-01): the asset's strand texture cut out by its alpha (alpha to coverage, both sides), its
 * light and dark strands kept, recoloured to `color`; a little shine (roughness 0.5). One material per avatar.
 */
export declare function humanHairMaterial(base: string, proxy: HumanProxy, color: string): MeshStandardNodeMaterial;
/** Sets a hair material's colour. */
export declare function setHumanHairColor(material: MeshStandardNodeMaterial, color: string): void;
