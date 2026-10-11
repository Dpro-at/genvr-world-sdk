/** Serial writes preserve order; a completed stale revision must never authorize leaving. */
export class StudioSaveQueue {
  revision = 0;
  private writes = Promise.resolve();
  changed() { this.revision++; }
  async write(save: () => Promise<void>): Promise<boolean> {
    const revision = this.revision;
    const write = this.writes.catch(() => {}).then(save);
    this.writes = write;
    await write;
    return revision === this.revision;
  }
}

/** A take or film edit during an asynchronous world write must keep the editor mounted. */
export async function flushStudioClose(film: {
  busy: () => boolean;
  snapshot: () => { project: unknown; assets: unknown };
  flush: () => Promise<boolean>;
}, saveWorld: () => Promise<boolean>): Promise<boolean> {
  if (film.busy()) return false;
  const before = film.snapshot();
  if (!(await film.flush()) || film.busy() || !(await saveWorld())) return false;
  const after = film.snapshot();
  return !film.busy() && before.project === after.project && before.assets === after.assets;
}
