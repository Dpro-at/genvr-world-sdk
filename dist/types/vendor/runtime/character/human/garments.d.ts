import { BufferGeometry, SkinnedMesh } from 'three/webgpu';
export type HumanGarmentKind = 'hoodie' | 'tshirt' | 'jacket' | 'trousers' | 'shoes';
export interface HumanGarment {
    id: string;
    kind: HumanGarmentKind;
    color: string;
}
/** Supported fitted garments, separate from a block body's painted clothing. */
export declare function humanGarmentItems(ids: readonly string[], colors: {
    shirt: string;
    pants: string;
    shoes: string;
}): HumanGarment[];
/** A real, closed-thickness clothing shell fitted to the current body, with that body's skin weights. */
export declare function humanGarmentGeometry(body: SkinnedMesh, kind: HumanGarmentKind): BufferGeometry;
export declare function fitHumanGarments(body: SkinnedMesh, items: HumanGarment[]): SkinnedMesh[];
export declare function disposeHumanGarments(items: SkinnedMesh[]): void;
