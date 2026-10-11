import type { paths } from '@genvr/api-client';
import { api } from './api';

type Command = NonNullable<
  paths['/v1/experiences/{id}/commands']['post']['requestBody']
>['content']['application/json']['commands'][number];

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'conflict' | 'error';

/**
 * Batches local edits and saves them with the place's version (optimistic concurrency).
 * On a version conflict the page asks the user to reload; nothing is overwritten.
 */
export class SaveQueue {
  #pending: Command[] = [];
  #timer: ReturnType<typeof setTimeout> | null = null;
  #inFlight = false;

  constructor(
    private readonly experienceId: string,
    private version: number,
    private readonly onStatus: (status: SaveStatus) => void,
    private readonly delayMs = 800,
  ) {}

  push(command: Command): void {
    this.#pending.push(command);
    this.onStatus('unsaved');
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  async flush(): Promise<void> {
    if (this.#inFlight || this.#pending.length === 0) return;
    this.#inFlight = true;
    const batch = this.#takeBatch();
    this.onStatus('saving');
    let result: Awaited<ReturnType<typeof this.post>> | null = null;
    try {
      result = await this.post(batch);
    } catch {
      // Network error: treated like any other failed save below.
    }
    this.#inFlight = false;
    if (result?.data) {
      this.version = result.data.version;
      if (this.#pending.length > 0) void this.flush();
      else this.onStatus('saved');
      return;
    }
    this.#pending.unshift(...batch);
    const conflict = result?.response.status === 409;
    this.onStatus(conflict ? 'conflict' : 'error');
    if (!conflict) setTimeout(() => void this.flush(), 3000);
  }

  private post(batch: Command[]) {
    return api.POST('/v1/experiences/{id}/commands', {
      params: { path: { id: this.experienceId } },
      body: { baseVersion: this.version, commands: batch },
    });
  }

  /** Up to 50 commands and about 6 MB (road undo steps carry terrain), always at least one. */
  #takeBatch(): Command[] {
    let bytes = 0;
    let count = 0;
    while (count < Math.min(50, this.#pending.length)) {
      bytes += JSON.stringify(this.#pending[count]).length;
      if (count > 0 && bytes > 6_000_000) break;
      count += 1;
    }
    return this.#pending.splice(0, count);
  }

  /** Version of the place after the last successful save. */
  get savedVersion(): number {
    return this.version;
  }

  get hasPending(): boolean {
    return this.#pending.length > 0 || this.#inFlight;
  }
}
