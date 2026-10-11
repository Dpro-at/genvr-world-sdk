import tidewaterOcean from './tidewater-ocean.js';
import type { OceanControlInfo, OceanResource } from './_water.js';
export * from './_water.js';

export const OCEAN_RESOURCES: readonly OceanResource[] = [tidewaterOcean];
export const getOceanResource = (id: string): OceanResource | undefined =>
  OCEAN_RESOURCES.find((item) => item.resourceId === id);
export function describeOceanControls(id: string): OceanControlInfo | null {
  const item = getOceanResource(id);
  return item
    ? {
        resourceId: item.resourceId,
        scope: 'world',
        documentation: item.documentation,
        source: item.source,
        controls: item.controls,
      }
    : null;
}
