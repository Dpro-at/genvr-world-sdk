import type { Style } from './common.js';
import type { WorldSeed } from './world.js';
export type StarterKind = WorldSeed['kind'] | 'small' | 'empty';
/** Creation capabilities; stored worlds keep their original schema for compatibility. */
export declare const AVAILABLE_WORLD_STYLES: readonly Style[];
export declare const WORLD_STARTERS: Readonly<Record<Style, readonly StarterKind[]>>;
export declare function supportsWorldStarter(style: Style, kind: StarterKind): boolean;
