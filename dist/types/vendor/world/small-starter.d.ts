import type { CommandPayload } from '../contracts/index.js';
import { type WorldState } from './apply.js';
export declare function smallStarterCommands(state: WorldState, boundsFor: (id: string) => {
    min: readonly number[];
    max: readonly number[];
}): CommandPayload[];
