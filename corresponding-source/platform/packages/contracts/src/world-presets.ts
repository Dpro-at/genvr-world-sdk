import type { Style } from './common.js';
import type { WorldSeed } from './world.js';

export type StarterKind = WorldSeed['kind'] | 'small' | 'empty';
/** Creation capabilities; stored worlds keep their original schema for compatibility. */
export const AVAILABLE_WORLD_STYLES: readonly Style[] = ['blocky', 'realistic', 'voxel'];
export const WORLD_STARTERS: Readonly<Record<Style, readonly StarterKind[]>> = {
  blocky: ['small', 'empty'],
  realistic: ['small', 'valley', 'island', 'plain', 'mountains', 'empty'],
  voxel: ['small', 'empty'],
  anime: [],
};
export function supportsWorldStarter(style: Style, kind: StarterKind): boolean {
  return WORLD_STARTERS[style]?.includes(kind) ?? false;
}
