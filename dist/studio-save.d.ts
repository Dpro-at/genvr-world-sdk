/** Serial writes preserve order; a completed stale revision must never authorize leaving. */
export declare class StudioSaveQueue {
    revision: number;
    private writes;
    changed(): void;
    write(save: () => Promise<void>): Promise<boolean>;
}
/** A take or film edit during an asynchronous world write must keep the editor mounted. */
export declare function flushStudioClose(film: {
    busy: () => boolean;
    snapshot: () => {
        project: unknown;
        assets: unknown;
    };
    flush: () => Promise<boolean>;
}, saveWorld: () => Promise<boolean>): Promise<boolean>;
