/**
 * Per-match player handles (`p1`, `p2`, ... in join order). Account ids, session ids and names never enter a script:
 * the runner maps ids to handles on the way in and handles to ids on the way out. Reset on every new match.
 */
export class Handles {
  #byId = new Map<string, string>();
  #byHandle = new Map<string, string>();
  #next = 1;

  /** The handle of `id`, given the next one if it has none yet. */
  handleOf(id: string): string {
    let handle = this.#byId.get(id);
    if (handle === undefined) {
      handle = `p${this.#next}`;
      this.#next += 1;
      this.#byId.set(id, handle);
      this.#byHandle.set(handle, id);
    }
    return handle;
  }

  /** The handle of `id` when it has one, without giving a new one. */
  peek(id: string): string | undefined {
    return this.#byId.get(id);
  }

  /** The id behind a handle, or undefined. */
  idOf(handle: string): string | undefined {
    return this.#byHandle.get(handle);
  }

  /** Gives handles to ids that have none, in the given (join) order. */
  sync(ids: Iterable<string>): void {
    for (const id of ids) this.handleOf(id);
  }

  reset(): void {
    this.#byId = new Map();
    this.#byHandle = new Map();
    this.#next = 1;
  }
}
