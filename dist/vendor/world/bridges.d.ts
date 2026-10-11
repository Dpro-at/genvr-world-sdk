import type { Road, WaterBody } from '../contracts/index.js';
import type { TerrainData } from './terrain-data.js';
/**
 * Bridge decks as flat pieces the rest law can stand things on (P2-43): one quad per step of a
 * road's profile where it is a bridge, at that step's deck height. Roads off water are graded
 * into the ground itself, so only decks need a surface of their own.
 */
export declare function bridgeDecks(roads: readonly Road[], terrain: Pick<TerrainData, 'heightAt'>, water: readonly WaterBody[]): Array<{
    points: Array<[number, number]>;
    level: number;
}>;
