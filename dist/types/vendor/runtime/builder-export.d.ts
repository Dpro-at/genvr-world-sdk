import type { ItemInstance } from '../contracts/index.js';
import { Group } from 'three';
import { type ItemModel } from './items.js';
/** A detached static assembly. Shared engine geometry/materials are never mutated or disposed. */
export declare function builderAssembly(instances: readonly ItemInstance[], model: (i: ItemInstance) => ItemModel): {
    root: Group<import("three").Object3DEventMap>;
    dispose: () => void;
};
export declare function exportBuilderSelection(instances: readonly ItemInstance[], model: (i: ItemInstance) => ItemModel): Promise<ArrayBuffer>;
