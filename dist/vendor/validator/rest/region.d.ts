import type { CommandPayload, WorldDocument } from '../../contracts/index.js';
import type { RestShape } from './rest.js';
export type Rect = [minX: number, minZ: number, maxX: number, maxZ: number];
/**
 * Where on the ground plane a command can change what things rest on (P2-43). Commands that
 * change nothing under anything return []; a new world or sea level returns 'all'.
 */
export declare function regionOf(command: CommandPayload, doc: WorldDocument, shapeOf: (itemId: string) => RestShape | null): Rect[] | 'all';
