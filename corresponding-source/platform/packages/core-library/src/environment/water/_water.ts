import type { GenvrManifest, OceanResourceId } from '@genvr/contracts';

/** World-scoped sea controls; these map to Sea fields, never unused arbitrary params. */
export interface OceanControl {
  key: 'level' | 'direction' | 'period' | 'height';
  group: 'appearance' | 'motion';
  label: string;
  description: string;
  unit: 'm' | 's' | 'degrees';
  default: number | null;
  min: number;
  max: number;
  exclusiveMax?: boolean;
  reset: 'default' | 'automatic';
}
export interface OceanResource {
  manifest: GenvrManifest;
  resourceId: OceanResourceId;
  renderer: 'tidewater';
  documentation: string;
  source: { name: string; page: string; license: string; commit: string };
  fallback: string;
  limitations: string;
  controls: readonly OceanControl[];
}
export interface OceanControlInfo {
  resourceId: OceanResourceId;
  scope: 'world';
  documentation: string;
  source: OceanResource['source'];
  controls: readonly OceanControl[];
}
