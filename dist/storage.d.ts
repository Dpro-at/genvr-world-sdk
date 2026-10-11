import { WorldSession, type WorldEvent } from './session.js';
export interface WorldStorage {
    read(id: string): Promise<string | null>;
    write(id: string, data: string): Promise<void>;
}
/** Browser storage injected so importing the SDK never accesses globals or credentials. */
export declare function browserStorage(storage: Pick<Storage, 'getItem' | 'setItem'>, prefix?: string): WorldStorage;
export declare function saveWorld(session: WorldSession, storage: WorldStorage): Promise<void>;
export declare function openWorld(id: string, storage: WorldStorage, onEvent?: (event: WorldEvent) => void): Promise<WorldSession>;
