import type { MeleeTool, Pose } from './types.js';
/** Who a strike reaches: inside the arc and within reach plus a latency tolerance, nearest first. */
export declare function meleeTargets(attacker: Pose, tool: MeleeTool, others: Array<{
    id: string;
    x: number;
    z: number;
}>, tolerance?: number): string[];
