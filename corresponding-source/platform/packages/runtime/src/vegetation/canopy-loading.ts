/** Serializes one world's lazy canopy preparation against rendering and disposal. */
export class CanopyLoading<T extends { dispose(): void }> {
  resource: T | null = null;
  busy = false;
  closed = false;
  failed = false;
  private pending: Promise<void> | null = null;
  private readonly waiting = new Set<string>();

  constructor(
    private readonly callbacks: {
      load(): Promise<T>;
      reload(id: string): void;
      notify(id: string): void;
      report(error: unknown): void;
    },
  ) {}

  private report(error: unknown) {
    try {
      this.callbacks.report(error);
    } catch {
      /* Diagnostics cannot interrupt cleanup. */
    }
  }

  request(id: string) {
    if (this.closed || this.failed || this.resource) return;
    this.waiting.add(id);
    if (this.busy) return;
    this.busy = true;
    this.pending = Promise.resolve()
      .then(async () => {
        if (this.closed) return;
        const resource = await this.callbacks.load();
        if (this.closed) {
          resource.dispose();
          return;
        }
        this.resource = resource;
        for (const item of this.waiting) {
          this.callbacks.reload(item);
          try {
            this.callbacks.notify(item);
          } catch (error) {
            this.report(error);
          }
        }
        this.waiting.clear();
      })
      .catch((error) => {
        this.failed = true;
        const resource = this.resource;
        this.resource = null;
        try {
          resource?.dispose();
        } catch (disposeError) {
          this.report(disposeError);
        }
        if (!this.closed)
          for (const item of this.waiting) {
            try {
              this.callbacks.reload(item);
            } catch (rollbackError) {
              this.report(rollbackError);
            }
          }
        this.waiting.clear();
        this.report(error);
      })
      .finally(() => {
        this.busy = false;
        this.pending = null;
      });
  }

  assertCaptureReady() {
    if (this.busy) throw new Error('World resources are still preparing; retry capture shortly.');
    if (this.closed) throw new Error('World is closed.');
  }

  /** Stop accepting work immediately; wait for borrowed renderer use before destroying it. */
  close(): Promise<void> {
    this.closed = true;
    this.waiting.clear();
    const resource = this.resource;
    this.resource = null;
    try {
      resource?.dispose();
    } catch (error) {
      this.report(error);
    }
    return this.pending ?? Promise.resolve();
  }

  settled(): Promise<void> {
    return this.pending ?? Promise.resolve();
  }
}
