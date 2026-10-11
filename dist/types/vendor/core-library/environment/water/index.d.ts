import type { OceanControlInfo, OceanResource } from './_water.js';
export * from './_water.js';
export declare const OCEAN_RESOURCES: readonly OceanResource[];
export declare const getOceanResource: (id: string) => OceanResource | undefined;
export declare function describeOceanControls(id: string): OceanControlInfo | null;
