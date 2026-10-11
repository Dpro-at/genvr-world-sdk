/**
 * Per-match player handles (`p1`, `p2`, ... in join order). Account ids, session ids and names never enter a script:
 * the runner maps ids to handles on the way in and handles to ids on the way out. Reset on every new match.
 */
export declare class Handles {
    #private;
    /** The handle of `id`, given the next one if it has none yet. */
    handleOf(id: string): string;
    /** The handle of `id` when it has one, without giving a new one. */
    peek(id: string): string | undefined;
    /** The id behind a handle, or undefined. */
    idOf(handle: string): string | undefined;
    /** Gives handles to ids that have none, in the given (join) order. */
    sync(ids: Iterable<string>): void;
    reset(): void;
}
