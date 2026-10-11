import type { SpawnSpot, TeamName } from './types.js';
/** The spot farthest from the nearest opponent; a team's own spots first, else the shared ones. */
export declare function pickSpawn(spots: SpawnSpot[], team: TeamName | null, opponents: Array<{
    x: number;
    z: number;
}>): SpawnSpot | null;
